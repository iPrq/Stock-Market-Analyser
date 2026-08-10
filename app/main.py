import os
import json
import re
import asyncio
from threading import Lock
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.tools import tool

from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Financial Research & Valuation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # The frontend does not send cookies or authorization credentials. Keeping
    # this false makes the wildcard origin valid in browsers.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)



class ModelRequestCallback(BaseCallbackHandler):
    """Process-local counters for Gemini requests made through LangChain."""

    def __init__(self) -> None:
        self._lock = Lock()
        self.request_count = 0
        self.failed_request_count = 0

    def _record_request(self) -> None:
        with self._lock:
            self.request_count += 1

    def on_llm_start(self, serialized: dict, prompts: list[str], **kwargs: object) -> None:
        self._record_request()

    def on_chat_model_start(
        self, serialized: dict, messages: list[list[object]], **kwargs: object
    ) -> None:
        self._record_request()

    def on_llm_error(self, error: BaseException, **kwargs: object) -> None:
        with self._lock:
            self.failed_request_count += 1

    def snapshot(self) -> dict[str, int]:
        with self._lock:
            return {
                "model_requests": self.request_count,
                "failed_model_requests": self.failed_request_count,
            }


model_request_callback = ModelRequestCallback()


def _fmp_get(endpoint: str, **params: str | int) -> list[dict]:
    """Fetch an FMP endpoint and return its list payload or raise a useful error."""
    api_key = os.environ.get("FMP_API_KEY")
    if not api_key:
        raise ValueError("FMP_API_KEY is not configured.")

    response = requests.get(
        f"https://financialmodelingprep.com/stable/{endpoint}",
        params={**params, "apikey": api_key},
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json()

    if isinstance(payload, dict) and payload.get("Error Message"):
        raise ValueError(f"FMP request failed: {payload['Error Message']}")
    if not isinstance(payload, list):
        raise ValueError("FMP returned an unexpected response.")
    return payload


# 2. Financial Modeling Prep Tools
def fetch_fmp_financials(symbol: str) -> str:
    """Fetches real-time profile, cash flows, and key financial metrics from FMP."""
    symbol = symbol.upper()

    # Cash Flow Statement API uses the latest annual statement for actual FCF.
    p_res = _fmp_get("profile", symbol=symbol)
    m_res = _fmp_get("ratios-ttm", symbol=symbol)
    cf_res = _fmp_get("cash-flow-statement", symbol=symbol, limit=1)
    
    profile = p_res[0] if p_res else {}
    metrics = m_res[0] if m_res else {}
    cash_flow = cf_res[0] if cf_res else {}

    price = profile.get("price", 0.0)
    mkt_cap = profile.get("marketCap", profile.get("mktCap", 0.0))
    pe = metrics.get("priceToEarningsRatioTTM", metrics.get("peRatioTTM", 0.0))
    fcf = cash_flow.get("freeCashFlow", 0.0)

    # Fallback share count calculation if price exists.  Do not invent a
    # positive share count: the DCF tool needs to reject unavailable data.
    shares = mkt_cap / price if price > 0 and mkt_cap > 0 else 0.0

    return json.dumps({
        "symbol": symbol,
        "company_name": profile.get("companyName", symbol),
        "price": price,
        "market_cap": mkt_cap,
        "pe_ratio": pe,
        "free_cash_flow": fcf,
        "shares_outstanding": shares,
        "sector": profile.get("sector", ""),
        "industry": profile.get("industry", ""),
        "image": profile.get("image", ""),
    })

def calculate_dcf(free_cash_flow: float, shares_outstanding: float, growth_rate: float = 0.08) -> str:
    """Calculates intrinsic value per share using a 2-stage DCF model."""
    if shares_outstanding <= 0:
        return json.dumps({"error": "Invalid shares_outstanding provided."})

    discount_rate, terminal_growth = 0.09, 0.025
    if growth_rate <= -1 or growth_rate >= discount_rate:
        return json.dumps({
            "error": "growth_rate must be greater than -1 and less than the discount rate."
        })
    pv_cash_flows = sum([free_cash_flow * ((1 + growth_rate) ** t) / ((1 + discount_rate) ** t) for t in range(1, 6)])
    terminal_val = (free_cash_flow * ((1 + growth_rate) ** 5) * (1 + terminal_growth)) / (discount_rate - terminal_growth)
    pv_terminal = terminal_val / ((1 + discount_rate) ** 5)
    
    intrinsic_val = (pv_cash_flows + pv_terminal) / shares_outstanding
    return json.dumps({
        "intrinsic_value_per_share": round(intrinsic_val, 2),
        "pv_cash_flows": round(pv_cash_flows, 2),
        "pv_terminal_value": round(pv_terminal, 2)
    })

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0,
    google_api_key=os.environ.get("GOOGLE_API_KEY"),
)

class AnalysisRequest(BaseModel):
    ticker: str 
    


def _extract_model_text(output: object) -> str:
    """Extract text from plain or Gemini structured agent output."""
    if isinstance(output, str):
        return output
    if isinstance(output, dict) and isinstance(output.get("text"), str):
        return output["text"]
    if isinstance(output, list):
        text_parts = [
            item["text"]
            for item in output
            if isinstance(item, dict)
            and item.get("type") == "text"
            and isinstance(item.get("text"), str)
        ]
        if text_parts:
            return "\n".join(text_parts)
    raise ValueError("The model returned no text output.")


def _parse_model_json(raw_output: str) -> dict:
    """Accept raw JSON or a JSON code block, rejecting non-object responses."""
    cleaned_output = re.sub(
        r"^\s*```(?:json)?\s*|\s*```\s*$", "", raw_output, flags=re.IGNORECASE
    ).strip()
    parsed = json.loads(cleaned_output)
    if not isinstance(parsed, dict):
        raise json.JSONDecodeError("Expected a JSON object", cleaned_output, 0)
    return parsed


def _build_research_prompt(financials: dict, dcf: dict) -> str:
    """Request a grounded investment thesis using FMP data supplied by this API."""
    return f"""
You are a careful equity research analyst. Research {financials['symbol']} using
Google Search grounding for recent earnings, business developments, competitive
position, and material risks. Treat the supplied FMP figures as the source of
truth for valuation inputs. Do not invent financial figures or sources.

FMP financial data:
{json.dumps(financials)}

DCF output:
{json.dumps(dcf)}

Return ONLY a JSON object with this exact shape:
{{
  "company_name": "string",
  "ticker": "string",
  "current_price": number,
  "intrinsic_value": number,
  "recommendation": "BUY" | "HOLD" | "SELL",
  "margin_of_safety_percent": number,
  "metrics": {{"market_cap": number, "pe_ratio": number, "free_cash_flow": number}},
  "thesis": {{
    "summary": "A 3-5 sentence plain-English explanation of the company, its business, and the investment conclusion.",
    "recommendation_rationale": "A direct explanation of why the valuation and current research support BUY, HOLD, or SELL.",
    "bull_case": ["specific, evidence-based upside driver", "specific, evidence-based upside driver"],
    "bear_case": ["specific, evidence-based risk", "specific, evidence-based risk"],
    "sources": [{{"title": "source title", "url": "https://source-url"}}]
  }}
}}

Include 2-4 relevant, credible sources discovered through Google Search. This is
general research, not personalized financial advice.
""".strip()


@app.get("/api/usage")
async def get_model_usage():
    """Return process-local Gemini request totals for this running API instance."""
    return model_request_callback.snapshot()


@app.post("/api/analyze")
async def analyze_stock(request: AnalysisRequest):
    ticker = request.ticker.strip().upper()
    if not ticker or not re.fullmatch(r"[A-Z0-9.\-]{1,15}", ticker):
        raise HTTPException(status_code=422, detail="Provide a valid stock ticker.")

    if not os.environ.get("GOOGLE_API_KEY"):
        raise HTTPException(status_code=503, detail="GOOGLE_API_KEY is not configured.")
    if not os.environ.get("FMP_API_KEY"):
        raise HTTPException(status_code=503, detail="FMP_API_KEY is not configured.")
    try:
        financials = json.loads(fetch_fmp_financials.invoke({"symbol": ticker}))
        dcf = json.loads(calculate_dcf.invoke({
            "free_cash_flow": financials["free_cash_flow"],
            "shares_outstanding": financials["shares_outstanding"],
        }))
        if "error" in dcf:
            raise ValueError(dcf["error"])

        # Google Search is Gemini's built-in grounding tool. It researches
        # current context while FMP continues to provide valuation inputs.
        response = await asyncio.to_thread(
            llm.invoke,
            _build_research_prompt(financials, dcf),
            tools=[{"google_search": {}}],
            config={"callbacks": [model_request_callback]},
        )
        raw_output = _extract_model_text(response.content)
        analysis = _parse_model_json(raw_output)
        analysis["company_profile"] = {
            "sector": financials["sector"],
            "industry": financials["industry"],
            "image": financials["image"],
        }
        return analysis
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Failed to parse structured JSON from model response.")
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Unable to retrieve financial data.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    