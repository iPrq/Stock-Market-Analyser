from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import requests

from langchain_google_genai import Chatgoogleai
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_tavily import TavilySearch

app = FastAPI(title="Financial Research & Valuation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.environ["OPENAI_API_KEY"] = "your-openai-key"
os.environ["FMP_API_KEY"] = "your-fmp-key"
os.environ["TAVILY_API_KEY"] = "tvly-your-tavily-key"

# 1. Instantiate Tavily Tool optimized for financial research
tavily_tool = TavilySearch(
    max_results=4, 
    topic="finance", 
    search_depth="advanced"
)

# 2. Financial Modeling Prep Tools
@tool
def fetch_fmp_financials(symbol: str) -> str:
    """Fetches real-time profile and key financial metrics from FMP."""
    FMP_KEY = os.environ.get("FMP_API_KEY")
    symbol = symbol.upper()
    
    p_res = requests.get(f"https://financialmodelingprep.com/api/v3/profile/{symbol}?apikey={FMP_KEY}").json()
    m_res = requests.get(f"https://financialmodelingprep.com/api/v3/key-metrics-ttm/{symbol}?apikey={FMP_KEY}").json()
    
    profile = p_res[0] if p_res else {}
    metrics = m_res[0] if m_res else {}

    price = profile.get("price", 100)
    mkt_cap = profile.get("mktCap", 1e10)
    pe = metrics.get("peRatioTTM", 15)
    fcf = mkt_cap / pe if pe else 1e9

    return json.dumps({
        "symbol": symbol,
        "company_name": profile.get("companyName"),
        "price": price,
        "market_cap": mkt_cap,
        "pe_ratio": pe,
        "free_cash_flow": fcf,
        "shares_outstanding": mkt_cap / price if price else 1e8
    })

@tool
def calculate_dcf(free_cash_flow: float, shares_outstanding: float, growth_rate: float = 0.08) -> str:
    """Calculates intrinsic value per share using a 2-stage DCF model."""
    discount_rate, terminal_growth = 0.09, 0.025
    pv_cash_flows = sum([free_cash_flow * ((1 + growth_rate) ** t) / ((1 + discount_rate) ** t) for t in range(1, 6)])
    terminal_val = (free_cash_flow * ((1 + growth_rate) ** 5) * (1 + terminal_growth)) / (discount_rate - terminal_growth)
    pv_terminal = terminal_val / ((1 + discount_rate) ** 5)
    
    intrinsic_val = (pv_cash_flows + pv_terminal) / shares_outstanding
    return json.dumps({
        "intrinsic_value_per_share": round(intrinsic_val, 2),
        "pv_cash_flows": round(pv_cash_flows, 2),
        "pv_terminal_value": round(pv_terminal, 2)
    })

# Register all tools including Tavily
tools = [fetch_fmp_financials, calculate_dcf, tavily_tool]

llm = ChatOpenAI(model="gpt-4o", temperature=0)

prompt = ChatPromptTemplate.from_messages([
    ("system", """
    You are an automated financial research engine.
    
    Workflow:
    1. Call `fetch_fmp_financials` to retrieve fundamental metrics.
    2. Call `calculate_dcf` to get intrinsic value.
    3. Use `tavily_search` to find recent earnings surprises, key operational risks, and market growth drivers.
    
    ALWAYS output your final response strictly as raw JSON (no markdown formatting blocks) using this schema:

    {{
        "company_name": "string",
        "ticker": "string",
        "current_price": number,
        "intrinsic_value": number,
        "recommendation": "BUY" | "HOLD" | "SELL",
        "margin_of_safety_percent": number,
        "metrics": {{
            "market_cap": number,
            "pe_ratio": number,
            "free_cash_flow": number
        }},
        "thesis": {{
            "bull_case": ["point 1", "point 2"],
            "bear_case": ["point 1", "point 2"]
        }}
    }}
    """),
    ("human", "Run complete valuation and market research on {ticker}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

class AnalysisRequest(BaseModel):
    ticker: str

@app.post("/api/analyze")
async def analyze_stock(request: AnalysisRequest):
    try:
        response = agent_executor.invoke({"ticker": request.ticker})
        raw_output = response["output"].strip()
        
        if raw_output.startswith("```json"):
            raw_output = raw_output.replace("```json", "").replace("```", "").strip()
            
        return json.loads(raw_output)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))