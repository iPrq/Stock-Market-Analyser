"use client";

import { FormEvent, useMemo, useState } from "react";

type AnalysisResponse = {
  company_name: string;
  ticker: string;
  current_price: number;
  intrinsic_value: number;
  recommendation: "BUY" | "HOLD" | "SELL" | string;
  margin_of_safety_percent: number;
  metrics: {
    market_cap: number;
    pe_ratio: number;
    free_cash_flow: number;
  };
  thesis: {
    summary?: string;
    recommendation_rationale?: string;
    bull_case: string[];
    bear_case: string[];
    sources?: Array<{ title: string; url: string }>;
  };
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);

  const recommendationStyle = useMemo(() => {
    if (!analysis) {
      return "bg-zinc-100 text-zinc-800";
    }

    if (analysis.recommendation === "BUY") {
      return "bg-emerald-100 text-emerald-800";
    }
    if (analysis.recommendation === "SELL") {
      return "bg-rose-100 text-rose-800";
    }
    return "bg-amber-100 text-amber-800";
  }, [analysis]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) {
      setError("Please enter a stock ticker.");
      return;
    }

    setIsLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticker: normalizedTicker }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to analyze the stock.");
      }

      const data = (await response.json()) as AnalysisResponse;
      setAnalysis(data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while fetching analysis.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">
          StockAny - Stock Analyzer
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Enter a ticker to run valuation and market research powered by your
          FastAPI backend.
        </p>

        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={ticker}
            onChange={(event) => setTicker(event.target.value)}
            placeholder="e.g. AAPL"
            className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isLoading ? "Analyzing..." : "Analyze"}
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      {analysis ? (
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">
                {analysis.company_name} ({analysis.ticker})
              </h2>
              <p className="text-sm text-zinc-600">
                Current Price: {formatCurrency(analysis.current_price)}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${recommendationStyle}`}
            >
              {analysis.recommendation}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Intrinsic Value"
              value={formatCurrency(analysis.intrinsic_value)}
            />
            <StatCard
              label="Margin of Safety"
              value={`${analysis.margin_of_safety_percent.toFixed(2)}%`}
            />
            <StatCard
              label="Market Cap"
              value={formatCompactCurrency(analysis.metrics.market_cap)}
            />
            <StatCard
              label="P/E Ratio"
              value={analysis.metrics.pe_ratio.toFixed(2)}
            />
            <StatCard
              label="Free Cash Flow"
              value={formatCompactCurrency(analysis.metrics.free_cash_flow)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ThesisCard title="Bull Case" points={analysis.thesis.bull_case} />
            <ThesisCard title="Bear Case" points={analysis.thesis.bear_case} />
          </div>

          {analysis.thesis.summary || analysis.thesis.recommendation_rationale ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">
                Investment Thesis
              </h3>
              {analysis.thesis.summary ? (
                <p className="mt-2 text-sm leading-6 text-zinc-700">
                  {analysis.thesis.summary}
                </p>
              ) : null}
              {analysis.thesis.recommendation_rationale ? (
                <p className="mt-3 border-t border-zinc-200 pt-3 text-sm leading-6 text-zinc-700">
                  <span className="font-semibold text-zinc-900">Why {analysis.recommendation}: </span>
                  {analysis.thesis.recommendation_rationale}
                </p>
              ) : null}
              {analysis.thesis.sources?.length ? (
                <div className="mt-3 border-t border-zinc-200 pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Google Search sources
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {analysis.thesis.sources.map((source) => (
                      <li key={source.url}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 underline hover:text-blue-900"
                        >
                          {source.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function ThesisCard({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {points.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">No points available.</p>
      )}
    </div>
  );
}
