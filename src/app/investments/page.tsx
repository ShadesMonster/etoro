"use client";

import { useMemo, useState } from "react";
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

const COLORS = [
  "#6366f1", "#22c55e", "#f97316", "#ec4899", "#14b8a6",
  "#eab308", "#8b5cf6", "#3b82f6", "#ef4444", "#a855f7",
];

const PAGE_SIZE = 25;

type StatusFilter = "all" | "open" | "closed";

export default function InvestmentsPage() {
  const { etoroPositions, etoroTransactions, etoroDividends } = useFinanceStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [txPage, setTxPage] = useState(1);

  const hasData = etoroPositions.length > 0 || etoroTransactions.length > 0 || etoroDividends.length > 0;

  // Filter positions by status
  const filteredPositions = useMemo(() => {
    if (statusFilter === "all") return etoroPositions;
    return etoroPositions.filter((p) => (p.status || "closed") === statusFilter);
  }, [etoroPositions, statusFilter]);

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

  // Open positions (actual current holdings)
  const openPositions = useMemo(
    () => etoroPositions.filter((p) => (p.status || "closed") === "open"),
    [etoroPositions]
  );

  // Account balance from latest transaction (realized equity)
  const accountBalance = useMemo(() => {
    if (etoroTransactions.length === 0) return null;
    const sorted = [...etoroTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const withBalance = sorted.find((tx) => tx.balance > 0);
    return withBalance?.balance ?? null;
  }, [etoroTransactions]);

  // Total deposited / withdrawn from transactions
  const depositStats = useMemo(() => {
    const deposits = etoroTransactions.filter(
      (tx) => tx.type.toLowerCase().includes("deposit")
    );
    const withdrawals = etoroTransactions.filter(
      (tx) => tx.type.toLowerCase().includes("withdraw")
    );
    return {
      totalDeposited: deposits.reduce((s, tx) => s + Math.abs(tx.amount), 0),
      totalWithdrawn: withdrawals.reduce((s, tx) => s + Math.abs(tx.amount), 0),
    };
  }, [etoroTransactions]);

  const stats = useMemo(() => {
    // Portfolio value from open positions (actual current holdings)
    const openValue = openPositions.reduce(
      (sum, p) => sum + p.units * p.currentRate,
      0
    );
    const openInvested = openPositions.reduce(
      (sum, p) => sum + p.units * p.openRate,
      0
    );

    // P/L and win/loss from the filtered set (respects all/open/closed filter)
    const totalProfit = filteredPositions.reduce((sum, p) => sum + p.profit, 0);
    const totalAmountTraded = filteredPositions.reduce(
      (sum, p) => sum + (p.amount || p.units * p.openRate),
      0
    );
    const profitPercent =
      totalAmountTraded > 0 ? (totalProfit / totalAmountTraded) * 100 : 0;

    const winners = filteredPositions.filter((p) => p.profit > 0).length;
    const losers = filteredPositions.filter((p) => p.profit < 0).length;

    // Allocation: open positions if available, otherwise aggregate closed P/L by instrument
    let allocation: { name: string; value: number }[];
    if (openPositions.length > 0) {
      allocation = openPositions.map((p) => ({
        name: p.instrument,
        value: Math.round(p.units * p.currentRate * 100) / 100,
      }));
    } else {
      // Aggregate amount traded by instrument for closed positions
      const byInstrument: Record<string, number> = {};
      for (const p of filteredPositions) {
        const amt = p.amount || p.units * p.openRate;
        byInstrument[p.instrument] = (byInstrument[p.instrument] || 0) + amt;
      }
      allocation = Object.entries(byInstrument)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15);
    }

    // P/L aggregated by instrument (top 20 by absolute P/L)
    const plByInstrument: Record<string, number> = {};
    for (const p of filteredPositions) {
      plByInstrument[p.instrument] = (plByInstrument[p.instrument] || 0) + p.profit;
    }
    const plData = Object.entries(plByInstrument)
      .map(([name, profit]) => ({
        name: name.length > 12 ? name.slice(0, 12) + "..." : name,
        profit: Math.round(profit * 100) / 100,
      }))
      .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
      .slice(0, 20);

    return {
      openValue,
      openInvested,
      totalProfit,
      totalAmountTraded,
      profitPercent,
      winners,
      losers,
      allocation,
      plData,
      hasOpenPositions: openPositions.length > 0,
    };
  }, [filteredPositions, openPositions]);

  // Account balance over time (from transactions)
  const balanceOverTime = useMemo(() => {
    if (etoroTransactions.length === 0) return [];
    const sorted = [...etoroTransactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const monthly: Record<string, number> = {};
    for (const tx of sorted) {
      const month = tx.date.slice(0, 7);
      if (tx.balance > 0) monthly[month] = tx.balance;
    }
    return Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, balance]) => ({ month, Balance: balance }));
  }, [etoroTransactions]);

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

  if (!hasData) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-3">Investments</h1>
        <p className="text-[var(--muted)] mb-6">
          No eToro data imported yet. Upload your account statement CSV.
        </p>
        <Link href="/upload" className="btn-primary inline-block">
          Upload CSV
        </Link>
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Account Balance"
          value={accountBalance !== null ? formatCurrency(accountBalance, "USD") : (stats.hasOpenPositions ? formatCurrency(stats.openValue, "USD") : "N/A")}
          subtitle={accountBalance !== null ? "From latest transaction" : (stats.hasOpenPositions ? `${openPositions.length} open positions` : "Upload transactions CSV")}
        />
        <StatCard
          label="Total Deposited"
          value={depositStats.totalDeposited > 0 ? formatCurrency(depositStats.totalDeposited, "USD") : (stats.hasOpenPositions ? formatCurrency(stats.openInvested, "USD") : "N/A")}
          subtitle={depositStats.totalWithdrawn > 0 ? `${formatCurrency(depositStats.totalWithdrawn, "USD")} withdrawn` : undefined}
        />
        <StatCard
          label={statusFilter === "all" ? "Realized P/L" : `P/L (${statusFilter})`}
          value={formatCurrency(stats.totalProfit, "USD")}
          subtitle={formatPercent(stats.profitPercent)}
          trend={stats.totalProfit >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Win / Loss"
          value={`${stats.winners} / ${stats.losers}`}
          subtitle={`${filteredPositions.length} trades`}
        />
        <StatCard
          label="Dividends"
          value={formatCurrency(dividendStats.totalDividends, "USD")}
          subtitle={`~${formatCurrency(dividendStats.projectedAnnual, "USD")}/yr projected`}
          trend={dividendStats.totalDividends > 0 ? "up" : "neutral"}
        />
      </div>

      {/* Performance Benchmark */}
      {stats.profitPercent !== 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-3">
            Performance Benchmark
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-[var(--background)]">
              <p className="text-xs text-[var(--muted)] mb-1">Your Return</p>
              <p className={`text-xl font-bold ${stats.profitPercent >= 0 ? "positive" : "negative"}`}>
                {formatPercent(stats.profitPercent)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--background)]">
              <p className="text-xs text-[var(--muted)] mb-1">S&P 500 (avg annual)</p>
              <p className="text-xl font-bold text-white">+10.00%</p>
              <p className={`text-xs ${stats.profitPercent > 10 ? "positive" : "negative"}`}>
                {stats.profitPercent > 10 ? "Outperforming" : "Underperforming"} by {Math.abs(stats.profitPercent - 10).toFixed(2)}%
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--background)]">
              <p className="text-xs text-[var(--muted)] mb-1">FTSE 100 (avg annual)</p>
              <p className="text-xl font-bold text-white">+7.50%</p>
              <p className={`text-xs ${stats.profitPercent > 7.5 ? "positive" : "negative"}`}>
                {stats.profitPercent > 7.5 ? "Outperforming" : "Underperforming"} by {Math.abs(stats.profitPercent - 7.5).toFixed(2)}%
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">
            Note: Benchmark figures are historical averages for reference only.
            Your return is calculated from your actual eToro positions.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Portfolio allocation */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            {stats.hasOpenPositions ? "Portfolio Allocation" : "Capital Allocation by Instrument"}
          </h2>
          {stats.allocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={stats.allocation}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={1}
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                  fontSize={11}
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
          ) : (
            <p className="text-[var(--muted)] text-sm">No data.</p>
          )}
        </div>
      </div>

      {/* Account balance over time */}
      {balanceOverTime.length > 1 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Account Balance Over Time
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={balanceOverTime}>
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
                dataKey="Balance"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

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
