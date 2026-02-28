"use client";

import { useMemo } from "react";
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
} from "recharts";
import Link from "next/link";
import { useFinanceStore } from "@/lib/store";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import StatCard from "@/components/StatCard";

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#8b5cf6",
  "#3b82f6",
  "#ef4444",
  "#a855f7",
];

export default function InvestmentsPage() {
  const { etoroPositions, etoroTransactions } = useFinanceStore();

  const hasData = etoroPositions.length > 0 || etoroTransactions.length > 0;

  const stats = useMemo(() => {
    const totalValue = etoroPositions.reduce(
      (sum, p) => sum + p.units * p.currentRate,
      0
    );
    const totalInvested = etoroPositions.reduce(
      (sum, p) => sum + p.units * p.openRate,
      0
    );
    const totalProfit = etoroPositions.reduce((sum, p) => sum + p.profit, 0);
    const profitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

    const winners = etoroPositions.filter((p) => p.profit > 0).length;
    const losers = etoroPositions.filter((p) => p.profit < 0).length;

    // Portfolio allocation
    const allocation = etoroPositions.map((p) => ({
      name: p.instrument,
      value: Math.round(p.units * p.currentRate * 100) / 100,
    }));

    // P/L by position
    const plData = etoroPositions
      .map((p) => ({
        name: p.instrument.length > 12 ? p.instrument.slice(0, 12) + "..." : p.instrument,
        profit: Math.round(p.profit * 100) / 100,
      }))
      .sort((a, b) => b.profit - a.profit);

    return {
      totalValue,
      totalInvested,
      totalProfit,
      profitPercent,
      winners,
      losers,
      allocation,
      plData,
    };
  }, [etoroPositions]);

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
      <h1 className="text-2xl font-bold text-white">Investments (eToro)</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Portfolio Value"
          value={formatCurrency(stats.totalValue, "USD")}
        />
        <StatCard
          label="Total Invested"
          value={formatCurrency(stats.totalInvested, "USD")}
        />
        <StatCard
          label="Total P/L"
          value={formatCurrency(stats.totalProfit, "USD")}
          subtitle={formatPercent(stats.profitPercent)}
          trend={stats.totalProfit >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Win / Loss"
          value={`${stats.winners} / ${stats.losers}`}
          subtitle={`${etoroPositions.length} total positions`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* P/L bar chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Profit / Loss by Position
          </h2>
          {stats.plData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(300, stats.plData.length * 35)}>
              <BarChart data={stats.plData} layout="vertical">
                <XAxis type="number" stroke="#6b7280" fontSize={12} tickFormatter={(v) => `$${v}`} />
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
            Portfolio Allocation
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

      {/* Positions table */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Positions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="pb-2 pr-4">Instrument</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4 text-right">Units</th>
                <th className="pb-2 pr-4 text-right">Open Price</th>
                <th className="pb-2 pr-4 text-right">Current/Close</th>
                <th className="pb-2 pr-4 text-right">P/L</th>
                <th className="pb-2 text-right">P/L %</th>
              </tr>
            </thead>
            <tbody>
              {etoroPositions.map((p) => (
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
                  <td className="py-2 pr-4 text-right">{p.units.toFixed(4)}</td>
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
                    {formatCurrency(p.profit, "USD")}
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
                {etoroTransactions.slice(0, 50).map((tx) => (
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
                      {formatCurrency(tx.amount, "USD")}
                    </td>
                    <td className="py-2 text-right">
                      {formatCurrency(tx.balance, "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
