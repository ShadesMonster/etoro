"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import Link from "next/link";
import { useFinanceStore } from "@/lib/store";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import StatCard from "@/components/StatCard";
import Pagination from "@/components/Pagination";
import { useLivePrices } from "@/lib/use-live-prices";
import { useEtoroSync } from "@/lib/use-etoro-sync";

const COLORS = [
  "#6366f1", "#22c55e", "#f97316", "#ec4899", "#14b8a6",
  "#eab308", "#8b5cf6", "#3b82f6", "#ef4444", "#a855f7",
];

const PAGE_SIZE = 25;

type StatusFilter = "all" | "open" | "closed";

/** UK financial year: April–March. e.g. June 2025 → "25/26", Feb 2026 → "25/26" */
function getFinancialYear(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth(); // 0-indexed
  const year = d.getFullYear();
  if (month >= 3) {
    return `${(year % 100).toString().padStart(2, "0")}/${((year + 1) % 100).toString().padStart(2, "0")}`;
  }
  return `${((year - 1) % 100).toString().padStart(2, "0")}/${(year % 100).toString().padStart(2, "0")}`;
}

export default function InvestmentsPage() {
  const { etoroPositions, etoroTransactions, etoroDividends } = useFinanceStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [txPage, setTxPage] = useState(1);
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());

  // Live data from eToro API
  const { prices: livePrices, etoroPortfolio, unmapped, loading: pricesLoading, error: pricesError, lastUpdated, fetchPrices, fetchPortfolio } = useLivePrices();

  // Auto-sync positions from eToro API (replaces need for CSV upload)
  const { sync: syncPositions, syncing, syncError, lastSynced } = useEtoroSync();

  const hasData = etoroPositions.length > 0 || etoroTransactions.length > 0 || etoroDividends.length > 0 || etoroPortfolio?.connected === true;

  // Available financial years from position data
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const p of etoroPositions) {
      const date = p.closeDate || p.openDate;
      if (date) years.add(getFinancialYear(date));
    }
    return [...years].sort();
  }, [etoroPositions]);

  const handleYearClick = useCallback((year: string, e: React.MouseEvent) => {
    if (year === "all") {
      setSelectedYears(new Set());
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedYears((prev) => {
        const next = new Set(prev);
        if (next.has(year)) next.delete(year);
        else next.add(year);
        return next;
      });
    } else {
      setSelectedYears(new Set([year]));
    }
  }, []);

  // Filter positions by status and financial year
  const filteredPositions = useMemo(() => {
    let positions = etoroPositions;
    if (statusFilter !== "all") {
      positions = positions.filter((p) => (p.status || "closed") === statusFilter);
    }
    if (selectedYears.size > 0) {
      positions = positions.filter((p) => {
        const date = p.closeDate || p.openDate;
        return date ? selectedYears.has(getFinancialYear(date)) : false;
      });
    }
    return positions;
  }, [etoroPositions, statusFilter, selectedYears]);

  // Dividend summary - prefer dedicated dividend data, fall back to transactions
  const dividendStats = useMemo(() => {
    if (etoroDividends.length > 0) {
      const totalUSD = etoroDividends.reduce((s, d) => s + d.netDividendUSD, 0);
      const totalGBP = etoroDividends.reduce((s, d) => s + d.netDividendGBP, 0);
      const totalWithholdingUSD = etoroDividends.reduce((s, d) => s + d.withholdingTaxUSD, 0);

      const monthlyDivs: Record<string, number> = {};
      for (const d of etoroDividends) {
        const m = d.date.slice(0, 7);
        monthlyDivs[m] = (monthlyDivs[m] || 0) + d.netDividendUSD;
      }
      const divMonths = Object.keys(monthlyDivs).length;
      const avgMonthlyDiv = divMonths > 0 ? totalUSD / divMonths : 0;

      return {
        totalDividends: totalUSD,
        totalDividendsGBP: totalGBP,
        totalWithholdingTax: totalWithholdingUSD,
        count: etoroDividends.length,
        avgMonthlyDiv,
        projectedAnnual: avgMonthlyDiv * 12,
        hasDedicatedData: true,
      };
    }

    // Fallback: derive from transactions
    const txDividends = etoroTransactions.filter(
      (tx) =>
        tx.type.toLowerCase().includes("dividend") ||
        tx.detail.toLowerCase().includes("dividend")
    );
    const totalDividends = txDividends.reduce((s, tx) => s + tx.amount, 0);

    const monthlyDivs: Record<string, number> = {};
    for (const d of txDividends) {
      const m = d.date.slice(0, 7);
      monthlyDivs[m] = (monthlyDivs[m] || 0) + d.amount;
    }
    const divMonths = Object.keys(monthlyDivs).length;
    const avgMonthlyDiv = divMonths > 0 ? totalDividends / divMonths : 0;

    return {
      totalDividends,
      totalDividendsGBP: 0,
      totalWithholdingTax: 0,
      count: txDividends.length,
      avgMonthlyDiv,
      projectedAnnual: avgMonthlyDiv * 12,
      hasDedicatedData: false,
    };
  }, [etoroDividends, etoroTransactions]);

  // Open positions from the positions CSV (if uploaded)
  const openPositionsFromCSV = useMemo(
    () => etoroPositions.filter((p) => (p.status || "closed") === "open"),
    [etoroPositions]
  );

  // Derive currently-open positions from transactions:
  // "Open Position" entries without a matching "Position closed" by positionId
  const derivedOpenPositions = useMemo(() => {
    if (etoroTransactions.length === 0) return [];

    const openedByPosId: Record<string, { instrument: string; amount: number; date: string }> = {};
    const closedPosIds = new Set<string>();

    for (const tx of etoroTransactions) {
      const type = tx.type.toLowerCase().trim();
      if (type === "open position" && tx.positionId) {
        openedByPosId[tx.positionId] = {
          instrument: tx.detail || "Unknown",
          amount: Math.abs(tx.amount),
          date: tx.date,
        };
      } else if (type === "position closed" && tx.positionId) {
        closedPosIds.add(tx.positionId);
      }
    }

    // Positions that were opened but never closed = currently open
    return Object.entries(openedByPosId)
      .filter(([posId]) => !closedPosIds.has(posId))
      .map(([posId, data]) => ({ positionId: posId, ...data }));
  }, [etoroTransactions]);

  // Auto-fetch live prices for derived open positions
  const derivedInstrumentNames = useMemo(
    () => [...new Set(derivedOpenPositions.map((p) => p.instrument))],
    [derivedOpenPositions]
  );

  const handleRefreshPrices = useCallback(() => {
    // Skip cache on manual refresh so we always hit the API
    fetchPortfolio(true);
    syncPositions(true);
  }, [fetchPortfolio, syncPositions]);

  // Auto-fetch portfolio value + sync positions on first load
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  useEffect(() => {
    if (!hasFetchedOnce) {
      setHasFetchedOnce(true);
      fetchPortfolio();       // Fast: portfolio value + rates
      syncPositions();         // Background: positions + history + instrument names
    }
  }, [hasFetchedOnce, fetchPortfolio, syncPositions]);

  // Use CSV open positions if available, otherwise use derived ones
  const hasOpenFromCSV = openPositionsFromCSV.length > 0;
  const openPositionCount = hasOpenFromCSV ? openPositionsFromCSV.length : derivedOpenPositions.length;
  const openPositionsCostBasis = hasOpenFromCSV
    ? openPositionsFromCSV.reduce((sum, p) => sum + p.units * p.openRate, 0)
    : derivedOpenPositions.reduce((sum, p) => sum + p.amount, 0);

  // Calculate live value of derived open positions using market prices
  const livePriceData = useMemo(() => {
    if (Object.keys(livePrices).length === 0 || derivedOpenPositions.length === 0) {
      return { liveValue: 0, hasLivePrices: false, priceCount: 0 };
    }

    // For derived positions, we only know the $ amount invested, not units.
    // We can't directly compute units * livePrice. But we CAN compute the
    // aggregate value by instrument: total invested × (currentPrice / avgBuyPrice).
    // However we don't know avgBuyPrice per instrument from transactions alone.
    //
    // Simpler approach: count how many instruments we have prices for.
    // The actual portfolio value is still best derived from: deposits - withdrawals + P/L.
    // But we can show unrealized P/L change since open by tracking live price changes.
    //
    // For now: just count matched prices so we can show them in the holdings table.
    let priceCount = 0;
    for (const name of derivedInstrumentNames) {
      if (livePrices[name]) priceCount++;
    }

    return { liveValue: 0, hasLivePrices: priceCount > 0, priceCount };
  }, [livePrices, derivedOpenPositions, derivedInstrumentNames]);

  // Derive portfolio metrics from all available data
  const portfolio = useMemo(() => {
    const hasApiData = etoroPortfolio?.connected === true;
    const hasTransactions = etoroTransactions.length > 0;

    // Deposits & withdrawals from transaction history (CSV)
    const csvDeposits = etoroTransactions
      .filter((tx) => tx.type.toLowerCase().includes("deposit"))
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const csvWithdrawals = etoroTransactions
      .filter((tx) => tx.type.toLowerCase().includes("withdraw"))
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);

    // Use CSV transactions for net invested when available, otherwise fall back to API data
    const deposits = hasTransactions ? csvDeposits : (etoroPortfolio?.depositSummary ?? 0);
    const withdrawals = hasTransactions ? csvWithdrawals : 0;
    const netInvested = hasTransactions
      ? csvDeposits - csvWithdrawals
      : (etoroPortfolio?.totalInvested ?? 0);

    // Realized P/L from all closed positions
    const realizedPL = etoroPositions
      .filter((p) => (p.status || "closed") === "closed")
      .reduce((sum, p) => sum + p.profit, 0);

    // Unrealized P/L from open positions
    const openPositions = etoroPositions.filter((p) => (p.status || "closed") === "open");
    const unrealizedPL = openPositions.reduce((sum, p) => sum + p.profit, 0);

    // Total dividends
    const totalDividends = etoroDividends.length > 0
      ? etoroDividends.reduce((s, d) => s + d.netDividendUSD, 0)
      : etoroTransactions
          .filter((tx) => tx.type.toLowerCase().includes("dividend") || tx.detail.toLowerCase().includes("dividend"))
          .reduce((s, tx) => s + tx.amount, 0);

    // Open positions value
    let openValue: number;
    if (openPositionsFromCSV.length > 0) {
      openValue = openPositionsFromCSV.reduce((sum, p) => {
        return sum + (p.currentRate > 0 ? p.units * p.currentRate : (p.amount || p.units * p.openRate));
      }, 0);
    } else {
      openValue = openPositionsCostBasis;
    }

    // Portfolio value: prefer API equity, then compute from available data
    const apiEquity = etoroPortfolio?.netEquity;
    const estimatedValue = apiEquity ?? (netInvested + realizedPL + totalDividends + unrealizedPL);

    // P/L: prefer API P/L when we have API data but no CSV transactions
    let totalPL: number;
    let plPercent: number;
    if (hasApiData && !hasTransactions && etoroPortfolio?.totalPL !== undefined) {
      // Use API-computed P/L (more accurate when we don't have CSV deposit data)
      totalPL = etoroPortfolio.totalPL;
      plPercent = etoroPortfolio.totalPLPercent ?? (netInvested > 0 ? (totalPL / netInvested) * 100 : 0);
    } else {
      totalPL = estimatedValue - netInvested;
      plPercent = netInvested > 0 ? (totalPL / netInvested) * 100 : 0;
    }

    // Estimated cash = portfolio value - open positions value
    const estimatedCash = hasApiData
      ? (etoroPortfolio?.credit ?? 0)
      : estimatedValue - openValue;

    return {
      estimatedValue,
      netInvested,
      deposits,
      withdrawals,
      realizedPL,
      unrealizedPL,
      totalDividends,
      totalPL,
      plPercent,
      openValue,
      estimatedCash,
      hasOpenPositions: openPositionCount > 0,
      hasOpenFromCSV: openPositionsFromCSV.length > 0,
      hasTransactions,
      hasApiData,
    };
  }, [etoroPositions, etoroTransactions, etoroDividends, openPositionsFromCSV, openPositionsCostBasis, openPositionCount, etoroPortfolio]);

  const stats = useMemo(() => {
    // P/L and win/loss from the filtered set (respects all/open/closed filter)
    const filteredProfit = filteredPositions.reduce((sum, p) => sum + p.profit, 0);
    const winners = filteredPositions.filter((p) => p.profit > 0).length;
    const losers = filteredPositions.filter((p) => p.profit < 0).length;

    // Allocation: aggregate positions by instrument, group small slices into "Other"
    const allocByInstrument: Record<string, number> = {};
    const openPositions = etoroPositions.filter((p) => (p.status || "closed") === "open");
    if (openPositions.length > 0) {
      for (const p of openPositions) {
        const val = p.currentRate > 0 ? p.units * p.currentRate : (p.amount || p.units * p.openRate);
        allocByInstrument[p.instrument] = (allocByInstrument[p.instrument] || 0) + val;
      }
    } else if (derivedOpenPositions.length > 0) {
      for (const p of derivedOpenPositions) {
        allocByInstrument[p.instrument] = (allocByInstrument[p.instrument] || 0) + p.amount;
      }
    } else {
      for (const p of filteredPositions) {
        const amt = p.amount || p.units * p.openRate;
        allocByInstrument[p.instrument] = (allocByInstrument[p.instrument] || 0) + amt;
      }
    }

    // Sort by value, group anything under 3% into "Other"
    const sortedAlloc = Object.entries(allocByInstrument)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    const totalAlloc = sortedAlloc.reduce((s, e) => s + e.value, 0);
    const THRESHOLD = 0.03; // 3%
    const major = sortedAlloc.filter((e) => totalAlloc > 0 && e.value / totalAlloc >= THRESHOLD);
    const minorValue = sortedAlloc
      .filter((e) => totalAlloc === 0 || e.value / totalAlloc < THRESHOLD)
      .reduce((s, e) => s + e.value, 0);

    let allocation: { name: string; value: number }[];
    if (minorValue > 0) {
      allocation = [...major, { name: "Other", value: Math.round(minorValue * 100) / 100 }];
    } else {
      allocation = major;
    }

    // P/L aggregated by instrument (top 20 by absolute P/L)
    const plByInstrument: Record<string, number> = {};
    for (const p of filteredPositions) {
      plByInstrument[p.instrument] = (plByInstrument[p.instrument] || 0) + p.profit;
    }
    const plData = Object.entries(plByInstrument)
      .map(([name, profit]) => ({
        name: name.length > 20 ? name.slice(0, 20) + "..." : name,
        profit: Math.round(profit * 100) / 100,
      }))
      .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
      .slice(0, 20);

    return {
      filteredProfit,
      winners,
      losers,
      allocation,
      plData,
    };
  }, [filteredPositions, etoroPositions, derivedOpenPositions]);

  // Portfolio value over time (estimated from deposits, realized P/L, dividends)
  const portfolioValueOverTime = useMemo(() => {
    const monthlyData: Record<string, { deposits: number; withdrawals: number; pl: number; dividends: number }> = {};

    for (const tx of etoroTransactions) {
      const month = tx.date.slice(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { deposits: 0, withdrawals: 0, pl: 0, dividends: 0 };
      const type = tx.type.toLowerCase();
      if (type.includes("deposit")) monthlyData[month].deposits += Math.abs(tx.amount);
      else if (type.includes("withdraw")) monthlyData[month].withdrawals += Math.abs(tx.amount);
    }

    for (const p of etoroPositions) {
      if ((p.status || "closed") === "closed" && p.closeDate) {
        const month = p.closeDate.slice(0, 7);
        if (!monthlyData[month]) monthlyData[month] = { deposits: 0, withdrawals: 0, pl: 0, dividends: 0 };
        monthlyData[month].pl += p.profit;
      }
    }

    for (const d of etoroDividends) {
      const month = d.date.slice(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { deposits: 0, withdrawals: 0, pl: 0, dividends: 0 };
      monthlyData[month].dividends += d.netDividendUSD;
    }

    const sortedMonths = Object.keys(monthlyData).sort();
    let cumValue = 0;
    return sortedMonths.map((month) => {
      const d = monthlyData[month];
      cumValue += d.deposits - d.withdrawals + d.pl + d.dividends;
      return { month, Value: Math.round(cumValue * 100) / 100 };
    });
  }, [etoroTransactions, etoroPositions, etoroDividends]);

  // Paginated transactions
  const totalTxPages = Math.ceil(etoroTransactions.length / PAGE_SIZE);
  const paginatedTxs = useMemo(
    () =>
      etoroTransactions.slice(
        (txPage - 1) * PAGE_SIZE,
        txPage * PAGE_SIZE
      ),
    [etoroTransactions, txPage]
  );

  if (!hasData && !pricesLoading && !syncing) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-3">Investments</h1>
        <p className="text-[var(--muted)] mb-6">
          No eToro data yet. Configure API keys in .env.local for live data,
          or upload your account statement CSV.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { fetchPortfolio(); syncPositions(true); }} className="btn-primary inline-block">
            Connect to eToro API
          </button>
          <Link href="/upload" className="btn-primary inline-block opacity-70">
            Upload CSV
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Investments (eToro)</h1>
        <div className="flex gap-1">
          {(["all", "open", "closed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-white hover:bg-white/5"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Financial year filter */}
      {availableYears.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[var(--muted)] mr-1">Tax Year:</span>
          <button
            onClick={(e) => handleYearClick("all", e)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedYears.size === 0
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:text-white hover:bg-white/5"
            }`}
          >
            All
          </button>
          {availableYears.map((year) => (
            <button
              key={year}
              onClick={(e) => handleYearClick(year, e)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedYears.has(year)
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-white hover:bg-white/5"
              }`}
            >
              {year}
            </button>
          ))}
          {selectedYears.size > 0 && (
            <span className="text-xs text-[var(--muted)] ml-2">Ctrl+click to select multiple</span>
          )}
        </div>
      )}

      {/* eToro API connection status - always visible */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
        pricesError
          ? "bg-red-500/10 border border-red-500/20"
          : pricesLoading
            ? "bg-yellow-500/10 border border-yellow-500/20"
            : portfolio.hasApiData
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-gray-500/10 border border-gray-500/20"
      }`}>
        <span className={`inline-block w-2 h-2 rounded-full ${
          pricesError ? "bg-red-400" : pricesLoading ? "bg-yellow-400 animate-pulse" : portfolio.hasApiData ? "bg-green-400" : "bg-gray-400"
        }`} />
        <span className={pricesError ? "text-red-400" : pricesLoading ? "text-yellow-400" : portfolio.hasApiData ? "text-green-400" : "text-gray-400"}>
          {pricesError
            ? `eToro API error: ${pricesError}`
            : pricesLoading || syncing
              ? "Connecting to eToro API..."
              : portfolio.hasApiData
                ? `eToro API connected · Updated ${lastUpdated?.toLocaleTimeString() ?? ""}${lastSynced ? ` · Synced ${lastSynced.toLocaleTimeString()}` : ""}`
                : "eToro API not connected"}
          {syncError && !pricesError && <span className="text-red-400 ml-2">Sync: {syncError}</span>}
        </span>
        <button
          onClick={handleRefreshPrices}
          disabled={pricesLoading || syncing}
          className="ml-auto text-xs text-[var(--muted)] hover:text-white underline disabled:opacity-50"
        >
          {pricesError ? "Retry" : pricesLoading || syncing ? "Syncing..." : portfolio.hasApiData ? "Refresh" : "Test Connection"}
        </button>
      </div>

      {/* Stats - matching eToro layout */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Portfolio Value"
          value={formatCurrency(portfolio.estimatedValue, "USD")}
          subtitle={
            portfolio.hasApiData
              ? "Live from eToro API"
              : portfolio.hasOpenFromCSV
                ? `${openPositionCount} open positions`
                : portfolio.hasOpenPositions
                  ? `${openPositionCount} open (at cost basis)`
                  : portfolio.hasTransactions
                    ? "From transactions"
                    : "Upload transactions for accuracy"
          }
        />
        <StatCard
          label="Net Invested"
          value={formatCurrency(portfolio.netInvested, "USD")}
          subtitle={portfolio.withdrawals > 0
            ? `${formatCurrency(portfolio.deposits, "USD")} in / ${formatCurrency(portfolio.withdrawals, "USD")} out`
            : portfolio.hasApiData && !portfolio.hasTransactions
              ? "From eToro API"
              : undefined}
        />
        <StatCard
          label="Total P/L"
          value={formatCurrency(portfolio.totalPL, "USD")}
          subtitle={formatPercent(portfolio.plPercent)}
          trend={portfolio.totalPL >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Win / Loss"
          value={`${stats.winners} / ${stats.losers}`}
          subtitle={`${filteredPositions.length} ${statusFilter === "closed" ? "closed" : statusFilter === "open" ? "open" : ""} positions`}
        />
        <StatCard
          label="Dividends"
          value={formatCurrency(dividendStats.totalDividends, "USD")}
          subtitle={`~${formatCurrency(dividendStats.projectedAnnual, "USD")}/yr projected`}
          trend={dividendStats.totalDividends > 0 ? "up" : "neutral"}
        />
      </div>

      {/* Open positions derived from transactions - with live prices */}
      {!portfolio.hasOpenFromCSV && derivedOpenPositions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">
              Current Holdings ({derivedOpenPositions.length} open positions)
            </h2>
            <button
              onClick={handleRefreshPrices}
              disabled={pricesLoading}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent)]/80 disabled:opacity-50 transition-colors"
            >
              {pricesLoading ? "Fetching..." : "Refresh Prices"}
            </button>
          </div>
          {pricesError && (
            <p className="text-xs text-red-400 mb-2">Price fetch error: {pricesError}</p>
          )}
          {lastUpdated && (
            <p className="text-xs text-[var(--muted)] mb-3">
              Live data from eToro API. Updated {lastUpdated.toLocaleTimeString()}.
              {livePriceData.priceCount > 0 && ` Matched ${livePriceData.priceCount}/${derivedInstrumentNames.length} instruments.`}
              {unmapped.length > 0 && ` ${unmapped.length} unresolved.`}
            </p>
          )}
          {!lastUpdated && (
            <p className="text-xs text-[var(--muted)] mb-3">
              Derived from account activity. Click &quot;Refresh Prices&quot; for live market data.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Instrument</th>
                  <th className="pb-2 pr-4 text-right">Invested</th>
                  {livePriceData.hasLivePrices && (
                    <>
                      <th className="pb-2 pr-4 text-right">Live Price</th>
                      <th className="pb-2 pr-4 text-right">Day Change</th>
                    </>
                  )}
                  <th className="pb-2 text-right">Date Opened</th>
                </tr>
              </thead>
              <tbody>
                {derivedOpenPositions
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 50)
                  .map((p) => {
                    const lp = livePrices[p.instrument];
                    return (
                      <tr
                        key={p.positionId}
                        className="border-b border-[var(--card-border)]/50 hover:bg-white/5"
                      >
                        <td className="py-2 pr-4">
                          <span className="text-white font-medium">{p.instrument}</span>
                          {lp && (
                            <span className="text-xs text-[var(--muted)] ml-2">{lp.symbol}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right">{formatCurrency(p.amount, "USD")}</td>
                        {livePriceData.hasLivePrices && (
                          <>
                            <td className="py-2 pr-4 text-right">
                              {lp ? formatCurrency(lp.price, lp.currency) : <span className="text-[var(--muted)]">--</span>}
                            </td>
                            <td className={`py-2 pr-4 text-right ${lp ? (lp.changePercent >= 0 ? "positive" : "negative") : ""}`}>
                              {lp ? (
                                <>
                                  {lp.changePercent >= 0 ? "+" : ""}{lp.changePercent.toFixed(2)}%
                                </>
                              ) : (
                                <span className="text-[var(--muted)]">--</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="py-2 text-right text-[var(--muted)]">{formatDate(p.date)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {derivedOpenPositions.length > 50 && (
            <p className="text-xs text-[var(--muted)] mt-2">
              Showing top 50 of {derivedOpenPositions.length} open positions by value.
            </p>
          )}
        </div>
      )}

      {/* Performance Benchmark */}
      {portfolio.plPercent !== 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-3">
            Performance Benchmark
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-[var(--background)]">
              <p className="text-xs text-[var(--muted)] mb-1">Your Return</p>
              <p className={`text-xl font-bold ${portfolio.plPercent >= 0 ? "positive" : "negative"}`}>
                {formatPercent(portfolio.plPercent)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--background)]">
              <p className="text-xs text-[var(--muted)] mb-1">S&P 500 (avg annual)</p>
              <p className="text-xl font-bold text-white">+10.00%</p>
              <p className={`text-xs ${portfolio.plPercent > 10 ? "positive" : "negative"}`}>
                {portfolio.plPercent > 10 ? "Outperforming" : "Underperforming"} by {Math.abs(portfolio.plPercent - 10).toFixed(2)}%
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--background)]">
              <p className="text-xs text-[var(--muted)] mb-1">FTSE 100 (avg annual)</p>
              <p className="text-xl font-bold text-white">+7.50%</p>
              <p className={`text-xs ${portfolio.plPercent > 7.5 ? "positive" : "negative"}`}>
                {portfolio.plPercent > 7.5 ? "Outperforming" : "Underperforming"} by {Math.abs(portfolio.plPercent - 7.5).toFixed(2)}%
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">
            Note: Benchmark figures are historical averages for reference only.
            Your return is calculated from your actual eToro data.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* P/L bar chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Profit / Loss by Instrument
          </h2>
          {stats.plData.length > 0 ? (
            <ResponsiveContainer
              width="100%"
              height={Math.max(300, stats.plData.length * 35)}
            >
              <BarChart data={stats.plData} layout="vertical">
                <XAxis
                  type="number"
                  stroke="#6b7280"
                  fontSize={12}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#6b7280"
                  fontSize={11}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e",
                    border: "1px solid #2e2e3e",
                    borderRadius: 8,
                    color: "#e5e7eb",
                  }}
                  formatter={(value) => formatCurrency(Number(value), "USD")}
                />
                <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                  {stats.plData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.profit >= 0 ? "#22c55e" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[var(--muted)] text-sm">No position data.</p>
          )}
        </div>

        {/* Right column: pie chart + portfolio value */}
        <div className="flex flex-col gap-6">
          {/* Portfolio allocation */}
          <div className="card flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4">
              {portfolio.hasOpenPositions ? "Current Holdings Allocation" : "Capital Allocation by Instrument"}
            </h2>
            {stats.allocation.length > 0 ? (
              <div className="flex-1 flex flex-col lg:flex-row items-center gap-4 min-h-0">
                {/* Donut chart */}
                <div className="flex-shrink-0" style={{ width: 220, height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.allocation}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={55}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {stats.allocation.map((_, index) => (
                          <Cell
                            key={index}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#1e1e2e",
                          border: "1px solid #2e2e3e",
                          borderRadius: 8,
                          color: "#e5e7eb",
                        }}
                        formatter={(value) => formatCurrency(Number(value), "USD")}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend list */}
                <div className="flex flex-col gap-2 text-sm min-w-0 flex-1">
                  {stats.allocation.map((item, index) => {
                    const total = stats.allocation.reduce((s, a) => s + a.value, 0);
                    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                    return (
                      <div key={item.name} className="flex items-center gap-2">
                        <span
                          className="flex-shrink-0 w-3 h-3 rounded-full"
                          style={{ background: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-[var(--muted)] truncate" title={item.name}>
                          {item.name}
                        </span>
                        <span className="ml-auto flex-shrink-0 text-white font-medium">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[var(--muted)] text-sm">No data.</p>
            )}
          </div>

          {/* Portfolio value over time */}
          {portfolioValueOverTime.length > 1 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-white mb-4">
                Portfolio Value Over Time
              </h2>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={portfolioValueOverTime}>
                  <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1e1e2e",
                      border: "1px solid #2e2e3e",
                      borderRadius: 8,
                      color: "#e5e7eb",
                    }}
                    formatter={(value) => formatCurrency(Number(value), "USD")}
                  />
                  <Area
                    type="monotone"
                    dataKey="Value"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Positions table */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Positions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="pb-2 pr-4">Instrument</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4 text-right">Units</th>
                <th className="pb-2 pr-4 text-right">Open Price</th>
                <th className="pb-2 pr-4 text-right">Current/Close</th>
                <th className="pb-2 pr-4 text-right">P/L</th>
                <th className="pb-2 text-right">P/L %</th>
              </tr>
            </thead>
            <tbody>
              {filteredPositions.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--card-border)]/50 hover:bg-white/5"
                >
                  <td className="py-2 pr-4 text-white font-medium">
                    {p.instrument}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        p.type === "buy"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {p.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        (p.status || "closed") === "open"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {(p.status || "closed").toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {p.units.toFixed(4)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatCurrency(p.openRate, "USD")}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatCurrency(p.currentRate, "USD")}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right ${
                      p.profit >= 0 ? "positive" : "negative"
                    }`}
                  >
                    {p.profit >= 0 ? "▲ " : "▼ "}
                    {formatCurrency(Math.abs(p.profit), "USD")}
                  </td>
                  <td
                    className={`py-2 text-right ${
                      p.profitPercent >= 0 ? "positive" : "negative"
                    }`}
                  >
                    {formatPercent(p.profitPercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dividend history - dedicated dividend data */}
      {etoroDividends.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Dividend History
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Instrument</th>
                  <th className="pb-2 pr-4 text-right">Net (USD)</th>
                  <th className="pb-2 pr-4 text-right">Net (GBP)</th>
                  <th className="pb-2 pr-4 text-right">Tax Withheld</th>
                  <th className="pb-2 text-right">Tax Rate</th>
                </tr>
              </thead>
              <tbody>
                {etoroDividends.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-[var(--card-border)]/50 hover:bg-white/5"
                  >
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {formatDate(d.date)}
                    </td>
                    <td className="py-2 pr-4 text-white">{d.instrument}</td>
                    <td className="py-2 pr-4 text-right positive">
                      +{formatCurrency(d.netDividendUSD, "USD")}
                    </td>
                    <td className="py-2 pr-4 text-right positive">
                      +{formatCurrency(d.netDividendGBP, "GBP")}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--muted)]">
                      {formatCurrency(d.withholdingTaxUSD, "USD")}
                    </td>
                    <td className="py-2 text-right text-[var(--muted)]">
                      {d.withholdingTaxRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dividend history fallback - from transaction data */}
      {etoroDividends.length === 0 && etoroTransactions.filter(
        (tx) => tx.type.toLowerCase().includes("dividend") || tx.detail.toLowerCase().includes("dividend")
      ).length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Dividend History
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Details</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {etoroTransactions
                  .filter((tx) => tx.type.toLowerCase().includes("dividend") || tx.detail.toLowerCase().includes("dividend"))
                  .map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-[var(--card-border)]/50 hover:bg-white/5"
                    >
                      <td className="py-2 pr-4 text-[var(--muted)]">
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-2 pr-4 text-white">{tx.detail}</td>
                      <td className="py-2 text-right positive">
                        +{formatCurrency(tx.amount, "USD")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction history */}
      {etoroTransactions.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Transaction History
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Details</th>
                  <th className="pb-2 pr-4 text-right">Amount</th>
                  <th className="pb-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTxs.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-[var(--card-border)]/50 hover:bg-white/5"
                  >
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {formatDate(tx.date)}
                    </td>
                    <td className="py-2 pr-4 text-white">{tx.type}</td>
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {tx.detail}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right ${
                        tx.amount >= 0 ? "positive" : "negative"
                      }`}
                    >
                      {tx.amount >= 0 ? "▲ " : "▼ "}
                      {formatCurrency(Math.abs(tx.amount), "USD")}
                    </td>
                    <td className="py-2 text-right">
                      {formatCurrency(tx.balance, "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={txPage}
            totalPages={totalTxPages}
            onPageChange={setTxPage}
            totalItems={etoroTransactions.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}
    </div>
  );
}
