from langchain.tools import tool
from dotenv import load_dotenv
import os
import json
import requests
from langchain_tavily import TavilySearch


load_dotenv()

FMP_KEY = os.environ.get("FMP_API_KEY")
GOOGLE_KEY = os.environ.get("GOOGLE_API_KEY")

web_search_tool = TavilySearch(max_results=4, topic="finance")

@tool
def fetch_fmp_financials(symbol: str) -> str:
    """
    Fetches real-time profile, key metrics, income statement, and cash flow statement
    for a stock ticker using Financial Modeling Prep (FMP) API.
    """
    symbol = symbol.upper()
    
    # 1. Company Profile (Price, Market Cap, Beta, Sector)
    profile_url = f"https://financialmodelingprep.com/api/v3/profile/{symbol}?apikey={FMP_KEY}"
    profile_res = requests.get(profile_url).json()
    profile = profile_res[0] if profile_res else {}

    # 2. Key Metrics TTM (PE, Debt/Equity, FCF Yield)
    metrics_url = f"https://financialmodelingprep.com/api/v3/key-metrics-ttm/{symbol}?apikey={FMP_KEY}"
    metrics_res = requests.get(metrics_url).json()
    metrics = metrics_res[0] if metrics_res else {}

    # 3. Cash Flow Statement (Most recent annual Free Cash Flow)
    cf_url = f"https://financialmodelingprep.com/api/v3/cash-flow-statement/{symbol}?limit=1&apikey={FMP_KEY}"
    cf_res = requests.get(cf_url).json()
    cash_flow = cf_res[0] if cf_res else {}

    # 4. Income Statement (Revenue growth reference)
    inc_url = f"https://financialmodelingprep.com/api/v3/income-statement/{symbol}?limit=2&apikey={FMP_KEY}"
    inc_res = requests.get(inc_url).json()
    
    rev_growth = 0.05  # fallback
    if len(inc_res) >= 2:
        rev_curr = inc_res[0].get("revenue", 0)
        rev_prev = inc_res[1].get("revenue", 1)
        if rev_prev > 0:
            rev_growth = round((rev_curr - rev_prev) / rev_prev, 4)

    payload = {
        "symbol": symbol,
        "company_name": profile.get("companyName"),
        "price": profile.get("price"),
        "market_cap": profile.get("mktCap"),
        "sector": profile.get("sector"),
        "pe_ratio": metrics.get("peRatioTTM"),
        "debt_to_equity": metrics.get("debtToEquityTTM"),
        "free_cash_flow": cash_flow.get("freeCashFlow"),
        "revenue_growth_yoy": rev_growth,
    }
    return json.dumps(payload, indent=2)

@tool
def calculate_dcf(
    free_cash_flow: float,
    shares_outstanding: float,
    growth_rate: float = 0.08,
    discount_rate: float = 0.09,
    terminal_growth_rate: float = 0.025,
    years: int = 5
) -> str:
    """
    Calculates intrinsic value per share using a 2-stage Discounted Cash Flow (DCF) model.
    Pass free_cash_flow and total shares_outstanding.
    """
    pv_cash_flows = 0.0
    current_fcf = free_cash_flow

    # Stage 1: Projection Period
    for year in range(1, years + 1):
        current_fcf *= (1 + growth_rate)
        pv_cash_flows += current_fcf / ((1 + discount_rate) ** year)

    # Stage 2: Terminal Value
    terminal_value = (current_fcf * (1 + terminal_growth_rate)) / (discount_rate - terminal_growth_rate)
    pv_terminal_value = terminal_value / ((1 + discount_rate) ** years)

    total_intrinsic_value = pv_cash_flows + pv_terminal_value
    intrinsic_value_per_share = total_intrinsic_value / shares_outstanding if shares_outstanding > 0 else 0.0

    return json.dumps({
        "pv_discounted_cash_flows": round(pv_cash_flows, 2),
        "pv_terminal_value": round(pv_terminal_value, 2),
        "total_intrinsic_equity_value": round(total_intrinsic_value, 2),
        "intrinsic_value_per_share": round(intrinsic_value_per_share, 2),
        "assumptions": {
            "growth_rate": growth_rate,
            "discount_rate_wacc": discount_rate,
            "terminal_growth_rate": terminal_growth_rate,
            "projection_years": years
        }
    }, indent=2)


