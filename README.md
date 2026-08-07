# StockAny AI

**AI-powered equity research and valuation terminal.** Enter any stock ticker to instantly get an intrinsic value estimate, margin of safety, and a grounded investment thesis written by Gemini using live web research.

---

## What it does

StockAny combines real financial data with generative AI to give you a clear picture of whether a stock is worth buying.

For any ticker you submit, it:

1. **Fetches live financial data** — stock price, market cap, P/E ratio, and free cash flow from Financial Modeling Prep.
2. **Calculates intrinsic value** — using a 2-stage Discounted Cash Flow (DCF) model.
3. **Computes the Margin of Safety** — comparing the intrinsic value against the current market price.
4. **Generates an investment thesis** — Gemini uses **Tavily Search** to look up recent earnings, business developments, competitive risks, and catalysts, then writes a structured BUY / HOLD / SELL recommendation with bull and bear cases and source links.

---

## How it works

```
User enters ticker
       │
       ▼
Next.js frontend  ──POST /api/analyze──▶  FastAPI backend
                                                │
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                            FMP API (live data)      2-Stage DCF model
                            price, FCF, P/E,         intrinsic value
                            market cap, sector        per share
                                    │                       │
                                    └───────────┬───────────┘
                                                ▼
                                   Gemini 2.5 Flash Lite
                                   + Tavily Search
                                   (recent news, earnings, risks)
                                                │
                                                ▼
                                    Structured JSON response
                                    { recommendation, thesis,
                                      bull_case, bear_case, sources }
                                                │
                                                ▼
                                 Next.js renders the results page
```

### DCF model (simplified)

The backend uses a 2-stage model:

- **Stage 1 (years 1–5):** Projects free cash flow forward at the supplied growth rate (default 8%), discounted at 9%.
- **Stage 2 (terminal value):** Uses a terminal growth rate of 2.5% to value the business in perpetuity, discounted back to today.
- **Intrinsic value per share** = (PV of cash flows + PV of terminal value) ÷ shares outstanding.

Margin of safety = `(intrinsic_value − current_price) / current_price × 100`

---

## Project structure

```
Stock Market Analyser/
├── app/                    # Python FastAPI backend
│   ├── main.py             # API routes, LangChain tools, DCF logic
│   ├── .env                # API keys (not committed)
│   ├── pyproject.toml
│   └── requirements.txt
│
└── stockany/               # Next.js frontend
    ├── app/
    │   ├── page.tsx        # Main UI — landing page + results page
    │   ├── layout.tsx
    │   └── globals.css
    ├── public/
    │   └── *.mp4           # Background video for hero section
    ├── next.config.ts
    └── package.json
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS v4 |
| Backend | Python, FastAPI, Uvicorn |
| AI model | Gemini 2.5 Flash Lite via LangChain |
| Web search | Tavily Search API |
| Financial data | Financial Modeling Prep (FMP) API |
| Typography | Inter (Google Fonts) |

---

## Setup

### Requirements

- Python 3.10+
- Node.js 18+
- A [Financial Modeling Prep](https://financialmodelingprep.com/) API key (free tier works)
- A [Google AI Studio](https://aistudio.google.com/) API key (Gemini)
- A [Tavily](https://tavily.com/) API key (free tier available)

### 1. Configure backend API keys

Create `app/.env`:

```env
FMP_API_KEY=your_fmp_key_here
GOOGLE_API_KEY=your_gemini_key_here
TAVILY_API_KEY=your_tavily_key_here
```

### 2. Start the backend

```bash
cd app
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`.  
You can verify it's running by visiting `http://localhost:8000/docs`.

### 3. Start the frontend

In a new terminal:

```bash
cd stockany
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. Type a stock ticker (e.g. `AAPL`, `NVDA`, `MSFT`) into the search bar and press **Analyze Stock**, or click one of the popular ticker buttons.
2. Wait ~10–20 seconds while the backend fetches data, runs the DCF, and queries Gemini.
3. The results page shows:
   - Current price vs. intrinsic value with a visual valuation gap bar
   - BUY / HOLD / SELL badge with colour-coded metrics
   - Full AI-written investment thesis with bull and bear cases
   - Clickable source links from Gemini's web research

---

## Environment variables

| Variable | Where | Description |
|---|---|---|
| `FMP_API_KEY` | `app/.env` | Financial Modeling Prep key |
| `GOOGLE_API_KEY` | `app/.env` | Gemini API key |
| `TAVILY_API_KEY` | `app/.env` | Tavily search API key |
| `NEXT_PUBLIC_API_BASE_URL` | `stockany/.env.local` | Override backend URL (default: `http://localhost:8000`) |

---

## Disclaimer

StockAny AI is for informational and educational purposes only. Nothing in this application constitutes personalised financial advice. Always do your own research before making investment decisions.
