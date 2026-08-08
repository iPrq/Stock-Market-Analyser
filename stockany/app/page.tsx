"use client";

import { FormEvent, useMemo, useState } from "react";

type AnalysisResponse = {
  company_name: string;
  ticker: string;
  current_price: number;
  intrinsic_value: number;
  recommendation: "BUY" | "HOLD" | "SELL" | string;
  margin_of_safety_percent: number;
  metrics: { market_cap: number; pe_ratio: number; free_cash_flow: number };
  company_profile?: { sector?: string; industry?: string; image?: string };
  thesis: {
    summary?: string;
    recommendation_rationale?: string;
    bull_case: string[];
    bear_case: string[];
    sources?: Array<{ title: string; url: string }>;
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const POPULAR_TICKERS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN"];



function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function getErrorMessage(body: string) {
  try {
    const payload = JSON.parse(body) as { detail?: string };
    return payload.detail ?? body;
  } catch {
    return body;
  }
}

// Custom Premium SVG Logos for Popular Tickers
function StockLogo({ ticker, className }: { ticker: string; className?: string }) {
  const normTicker = ticker.toUpperCase();
  if (normTicker === "AAPL") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.69-1.12 1.83-.98 2.94 1.08.08 2.15-.52 2.81-1.33z"/>
      </svg>
    );
  }
  if (normTicker === "NVDA") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5 1.5.67 1.5 1.5zm-1-4.5c0-.55-.45-1-1-1s-1 .45-1 1v-3c0-.55.45-1 1-1s1 .45 1 1v3zM12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm4 7c0-2.21-1.79-4-4-4s-4 1.79-4 4 1.79 4 4 4 4-1.79 4-4z"/>
      </svg>
    );
  }
  if (normTicker === "MSFT") {
    return (
      <svg className={className} viewBox="0 0 23 23" fill="currentColor">
        <path d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z"/>
      </svg>
    );
  }
  if (normTicker === "TSLA") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.2 8.7h-6.4v.8h6.4v-.8zm0 1.8h-6.4v.8h6.4v-.8zm0 1.8h-6.4v.8h6.4v-.8zM12 6.5L8.5 9h7L12 6.5z"/>
      </svg>
    );
  }
  if (normTicker === "AMZN") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.92 14.73c-.66.52-1.63.79-2.88.79-1.92 0-3.32-.97-3.32-3.13 0-2.45 1.72-3.21 4.54-3.21.6 0 1.15.03 1.66.09v.45c0 1.48-.36 2.56-1.57 3.32v.03c.66.45 1.15 1.09 1.15 2 .03.88.48 1.48 1.03 1.48.24 0 .48-.06.73-.18v1.12c-.36.18-.84.24-1.33.24-1.02-.03-1.66-.72-2.02-2zm-1.22-3.79c-.72-.06-1.54-.06-2.17.09-.76.15-1.12.57-1.12 1.27 0 .82.51 1.27 1.39 1.27.97 0 1.63-.6 1.87-1.63l.03-1zM23.11 18c-3.77 2.82-9.45 4-14.76 4A20.25 20.25 0 011 18.66c-.36-.27-.06-.73.33-.49 4.3 2.62 10.06 3.73 14.88 3.73 4.57 0 9-.94 12.39-3.26.43-.3.82.16.51.36zm-.9-1.84c-.18-.24-.76-.15-1.09.03-.88.48-2.66 1.42-3.83 1.75-.36.09-.45-.06-.15-.27 1.39-.97 3.86-3 4.04-3.27.18-.24.09-.45-.18-.33l-4.14 1.78c-.39.18-.84.09-.69-.27.57-1.27 1.84-4.11 2-4.47.18-.36-.09-.3-.39-.15L12.59 13.9c-.3.15-.45.03-.39-.27.42-2 1.27-6 1.36-6.42.09-.42-.24-.36-.45-.24L7.56 10.45c-.24.12-.39 0-.3-.24l1.51-4c.15-.36-.21-.36-.39-.24L2.83 9.4c-.24.15-.36 0-.24-.21l2-4c.18-.36-.24-.3-.39-.18L.78 7.37C.54 7.55.78 8 .93 7.82c1-.97 2.82-2.59 3.5-.82v.03L2.26 11.23c-.15.3-.06.45.24.33l4.74-2.14c.3-.15.42 0 .33.3L6.2 13.75c-.09.3.06.39.33.27l5.47-2.73c.3-.15.39.06.27.33l-1.69 4.29c-.09.3.09.39.36.21l5.47-3.81c.24-.15.42-.03.3.21l-1.39 3.14c-.12.3.09.36.33.18l4.47-3.24c.24-.15.27-.45.03-.64z"/>
      </svg>
    );
  }
  return (
    <div className={`flex items-center justify-center font-bold text-emerald-300 ${className}`}>
      {normTicker.slice(0, 1)}
    </div>
  );
}

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);

  const recommendation = analysis?.recommendation.toUpperCase() ?? "HOLD";
  const recommendationTheme = useMemo(() => {
    if (recommendation === "BUY") {
      return {
        label: "text-emerald-400",
        badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        bar: "bg-emerald-400",
        bgLight: "bg-emerald-950/20",
        borderLight: "border-emerald-900/40"
      };
    }
    if (recommendation === "SELL") {
      return {
        label: "text-rose-400",
        badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
        bar: "bg-rose-300",
        bgLight: "bg-rose-950/20",
        borderLight: "border-rose-900/40"
      };
    }
    return {
      label: "text-amber-400",
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      bar: "bg-amber-300",
      bgLight: "bg-amber-950/20",
      borderLight: "border-amber-900/40"
    };
  }, [recommendation]);

  async function analyzeStock(symbol = ticker) {
    const normalizedTicker = symbol.trim().toUpperCase();
    if (!normalizedTicker) {
      setError("Enter a stock ticker to begin.");
      return;
    }
    setTicker(normalizedTicker);
    setIsLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: normalizedTicker }),
      });
      
      if (!response.ok) {
        throw new Error(getErrorMessage(await response.text()) || "Unable to analyze this stock.");
      }
      const data = await response.json();
      setAnalysis(data as AnalysisResponse);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong while analyzing this stock.");
    } finally {
      setIsLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void analyzeStock();
  }

  if (analysis) {
    // Dual Progress bar math
    const intrinsic = analysis.intrinsic_value;
    const current = analysis.current_price;
    const valuationRatio = Math.max(10, Math.min(90, (intrinsic / (intrinsic + current)) * 100));

    return (
      <div className="min-h-screen bg-black text-[#e5e2e1] font-sans selection:bg-emerald-500/30">
        {/* Upper Header */}
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <button onClick={() => setAnalysis(null)} className="text-xl font-extrabold tracking-tight text-emerald-400 hover:opacity-80 transition flex items-center gap-1">
            StockAny <span className="text-white">AI</span>
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl px-6 pb-16 pt-2">
          {/* Back Navigation */}
          <button 
            onClick={() => setAnalysis(null)} 
            className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-neutral-400 hover:text-white transition duration-200"
          >
            <span className="text-sm">←</span> Back to Search
          </button>

          {/* Company Details Row */}
          <section className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/60 text-white p-3.5">
                <StockLogo ticker={analysis.ticker} className="size-full text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
                  {analysis.company_name} <span className="text-neutral-500 font-medium">({analysis.ticker})</span>
                </h1>
                <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                  SECTOR: {analysis.company_profile?.sector || "Technology"}
                </p>
              </div>
            </div>
            
            {/* Price & Recommendation Card */}
            <div className="flex items-center justify-between gap-6 rounded-2xl border border-neutral-800 bg-[#131313] px-6 py-4 md:min-w-[240px]">
              <div className="flex flex-col">
                <span className="font-mono text-3xl font-extrabold text-white tracking-tight">{formatCurrency(analysis.current_price)}</span>
                <span className="text-[10px] font-bold text-neutral-500 mt-1 uppercase tracking-wider">Current Market Price</span>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`rounded-full border px-4 py-1.5 text-xs font-extrabold tracking-widest ${recommendationTheme.badge}`}>
                  {recommendation}
                </span>
                <p className="text-[10px] font-medium text-neutral-500">◷ Updated just now</p>
              </div>
            </div>
          </section>

          {/* Core Metrics Grid */}
          <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Current Price" value={formatCurrency(analysis.current_price)} />
            <MetricCard 
              label="Intrinsic Value" 
              value={formatCurrency(analysis.intrinsic_value)} 
              accent="emerald"
            />
            <MetricCard 
              label="Margin of Safety" 
              value={`${analysis.margin_of_safety_percent >= 0 ? "+" : ""}${analysis.margin_of_safety_percent.toFixed(1)}%`} 
              accent={analysis.margin_of_safety_percent >= 0 ? "emerald" : "rose"} 
            />
            <MetricCard label="Market Cap" value={formatCompactCurrency(analysis.metrics.market_cap)} />
            <MetricCard label="P/E Ratio" value={analysis.metrics.pe_ratio.toFixed(1)} />
            <MetricCard label="Free Cash Flow" value={formatCompactCurrency(analysis.metrics.free_cash_flow)} />
          </section>

          {/* Valuation Gap & Investment Thesis Cards */}
          <section className="mt-6 grid gap-6 lg:grid-cols-12">
            {/* Valuation Gap Visual representation */}
            <article className="flex flex-col justify-between rounded-2xl border border-neutral-800 bg-[#131313] p-6 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white tracking-tight">Valuation Gap</h2>
                  <svg className="size-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                </div>
                <p className="mt-1 text-xs text-neutral-400">Comparison of intrinsic value against market price.</p>
              </div>

              {/* Progress bar split visual */}
              <div className="my-8">
                <div className="h-3.5 w-full overflow-hidden rounded-full bg-neutral-800 flex">
                  <div className="h-full bg-emerald-400" style={{ width: `${valuationRatio}%` }} />
                  <div className="h-full bg-rose-400" style={{ width: `${100 - valuationRatio}%` }} />
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-neutral-800/60 pt-4">
                <div>
                  <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Intrinsic</p>
                  <p className="mt-1 font-mono text-lg font-bold text-emerald-400">{formatCurrency(analysis.intrinsic_value)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Market Price</p>
                  <p className="mt-1 font-mono text-lg font-bold text-rose-400">{formatCurrency(analysis.current_price)}</p>
                </div>
              </div>
            </article>

            {/* Investment Thesis Narrative */}
            <article className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-[#131313] p-6 lg:col-span-7">
              {/* Subtle green ambient light */}
              <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-emerald-500/5 blur-3xl" />
              
              <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Investment Thesis</h2>
                  <p className={`mt-1 text-[11px] font-extrabold uppercase tracking-widest ${recommendationTheme.label}`}>
                    WHY {recommendation}?
                  </p>
                </div>
                <span className="w-fit rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                  AI research summary
                </span>
              </div>

              <div className="relative mt-6 space-y-4 text-xs leading-relaxed text-neutral-300 sm:text-sm">
                <p>{analysis.thesis.summary}</p>
                <p className="border-l-2 border-neutral-800 pl-4 py-1">
                  <span className="font-semibold text-white">Why {recommendation}: </span>
                  {analysis.thesis.recommendation_rationale}
                </p>
              </div>

              <div className="mt-8 border-t border-neutral-800/60 pt-4">
                <a href="#report" className="inline-flex items-center gap-1 text-xs font-bold text-neutral-400 hover:text-emerald-400 transition duration-200">
                  Read full institutional report <span className="text-sm">→</span>
                </a>
              </div>
            </article>
          </section>

          {/* Bull & Bear Cases side by side */}
          <section className="mt-6 grid gap-6 md:grid-cols-2">
            <ThesisCard title="Bull Case" icon="↗" points={analysis.thesis.bull_case} tone="emerald" />
            <ThesisCard title="Bear Case" icon="↘" points={analysis.thesis.bear_case} tone="rose" />
          </section>

          {/* Research Sources links */}
          {analysis.thesis.sources?.length ? (
            <section className="mt-6 rounded-2xl border border-neutral-800 bg-[#131313] p-6">
              <h2 className="text-base font-bold text-white tracking-tight">Research Sources</h2>
              <p className="text-xs text-neutral-400 mt-1">Grounding references compiled from SEC files and primary research.</p>
              
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {analysis.thesis.sources.map((source) => (
                  <a 
                    className="group flex items-center justify-between rounded-xl border border-neutral-800/80 bg-black/40 px-4 py-3.5 text-xs text-neutral-300 transition duration-200 hover:border-emerald-500/50 hover:text-white hover:bg-neutral-900/20" 
                    href={source.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    key={source.url}
                  >
                    <span className="truncate pr-4 font-medium">{source.title}</span>
                    <span className="text-xs text-neutral-500 group-hover:text-emerald-400 transition duration-200">↗</span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </main>
        
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-black text-[#e5e2e1] font-sans selection:bg-emerald-500/30">
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover pointer-events-none z-0 opacity-45"
      >
        <source src="/16377047_3840_2160_50fps.mp4" type="video/mp4" />
      </video>

      {/* Dark Ambient overlay to ensure contrast and let video show through */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/25 to-black/90 z-10 pointer-events-none" />

      {/* Header */}
      <header className="relative mx-auto w-full max-w-7xl px-6 py-6 md:px-8 z-20">
        <span className="text-xl font-extrabold tracking-tight text-white">StockAny</span>
      </header>

      {/* Main Container */}
      <main className="relative mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-12 md:px-8 lg:py-24 z-20">
        
        {/* Hero Content Centered */}
        <section className="flex flex-col items-center text-center w-full">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl text-white">
            Understand a stock before you invest.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-400 sm:text-lg">
            Get AI-powered valuation, current company research, and a clear investment thesis.
          </p>

          {/* Analyze Form input bar */}
          <form 
            onSubmit={onSubmit} 
            className="mt-8 flex w-full max-w-xl rounded-full border border-neutral-800 bg-neutral-950/70 backdrop-blur-md p-1.5 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400/20 transition-all duration-300"
          >
            <div className="flex items-center pl-4 pr-2 text-neutral-500">
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              aria-label="Stock ticker"
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              placeholder="Enter a ticker, e.g. AAPL"
              disabled={isLoading}
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-neutral-600 sm:text-base disabled:opacity-60 font-medium"
            />
            <button 
              type="submit"
              disabled={isLoading} 
              className="rounded-full bg-emerald-400 hover:bg-emerald-300 px-6 py-3 text-xs font-bold uppercase tracking-wider text-black transition duration-200 disabled:cursor-wait disabled:opacity-70"
            >
              {isLoading ? "Analyzing..." : "Analyze Stock"}
            </button>
          </form>

          {/* Popular Tickers row */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <span className="text-[11px] font-bold tracking-wider text-neutral-500">POPULAR:</span>
            {POPULAR_TICKERS.map((symbol) => (
              <button 
                onClick={() => void analyzeStock(symbol)} 
                disabled={isLoading} 
                className="rounded-full border border-neutral-800 bg-[#131313]/90 backdrop-blur-sm px-4 py-2 text-xs font-bold text-neutral-300 transition duration-200 hover:border-emerald-400 hover:text-emerald-300 hover:bg-black disabled:opacity-50" 
                key={symbol}
              >
                {symbol}
              </button>
            ))}
          </div>

          {error ? (
            <p className="mt-6 w-full max-w-xl rounded-2xl border border-rose-500/20 bg-rose-500/5 px-5 py-4 text-xs text-rose-300 sm:text-sm">
              {error}
            </p>
          ) : null}
        </section>
      </main>

      <Footer transparent />
    </div>
  );
}

// Sub components
function MetricCard({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "rose" }) {
  const theme = useMemo(() => {
    if (accent === "rose") return "border-rose-500/30 text-rose-400 bg-rose-950/5";
    if (accent === "emerald") return "border-emerald-500/30 text-emerald-400 bg-emerald-950/5";
    return "border-neutral-800 text-white bg-[#131313]";
  }, [accent]);

  return (
    <article className={`flex min-h-[108px] flex-col justify-between rounded-2xl border p-4.5 transition duration-200 hover:border-neutral-700 ${theme}`}>
      <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">{label}</p>
      <p className="mt-3 font-mono text-xl font-extrabold tracking-tight tabular-nums">{value}</p>
    </article>
  );
}

function ThesisCard({ title, icon, points, tone }: { title: string; icon: string; points: string[]; tone: "emerald" | "rose" }) {
  const isEmerald = tone === "emerald";
  const textAccent = isEmerald ? "text-emerald-400" : "text-rose-400";
  const bgAccent = isEmerald ? "bg-emerald-400" : "bg-rose-400";

  return (
    <article className="rounded-2xl border border-neutral-800 bg-[#131313] p-6 transition duration-200 hover:border-neutral-800/80">
      <h2 className="flex items-center gap-2 text-lg font-bold text-white tracking-tight">
        <span className={`${textAccent} text-xl`}>{icon}</span>
        {title}
      </h2>
      <ul className="mt-4 space-y-3.5">
        {points.map((point, index) => (
          <li key={index} className="flex gap-3 text-xs leading-relaxed text-neutral-400 sm:text-sm">
            <span className={`mt-2 size-1.5 shrink-0 rounded-full ${bgAccent} opacity-80`} />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Footer({ transparent }: { transparent?: boolean }) {
  return (
    <footer className={`mt-auto border-t border-neutral-900/50 ${transparent ? 'bg-transparent' : 'bg-black'} z-20 relative`}>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-6 md:px-8 md:flex-row text-xs text-neutral-500">
        <span className="text-base font-extrabold text-white tracking-tight">
          StockAny <span className="text-emerald-400">AI</span>
        </span>
        <div className="flex flex-wrap justify-center gap-5 font-semibold text-[11px] text-neutral-400">
          <span className="hover:text-emerald-400 transition cursor-pointer">Privacy Policy</span>
          <span className="hover:text-emerald-400 transition cursor-pointer">Terms of Service</span>
          <span className="hover:text-emerald-400 transition cursor-pointer">Legal Disclaimer</span>
          <span className="hover:text-emerald-400 transition cursor-pointer">Contact</span>
        </div>
        <span className="text-[11px]">© 2026 StockAny AI. All rights reserved.</span>
      </div>
    </footer>
  );
}