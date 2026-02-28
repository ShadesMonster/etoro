"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import Link from "next/link";
import { useFinanceStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { CATEGORY_LABELS, CATEGORY_COLORS, SpendingCategory } from "@/lib/types";
import StatCard from "@/components/StatCard";

export default function Dashboard() {
  const { transactions, etoroPositions, retirementFunds } = useFinanceStore();

  const hasData =
    transactions.length > 0 ||
    etoroPositions.length > 0 ||
    retirementFunds.length > 0;

  const stats = useMemo(() => {
    // Bank balance: latest balance from transactions, or sum of amounts
    const latestTx = transactions.find((t) => t.balance !== undefined);
    const bankBalance = latestTx?.balance ?? 0;

    // Investment value
    const investmentValue = etoroPositions.reduce(
      (sum, p) => sum + p.units * p.currentRate,
      0
    );
    const investmentProfit = etoroPositions.reduce((sum, p) => sum + p.profit, 0);

    // Retirement
    const latestRetirement = retirementFunds[0];
    const retirementValue = latestRetirement?.totalValue ?? 0;

    // Total net worth
    const netWorth = bankBalance + investmentValue + retirementValue;

    // Spending this month
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlySpending = transactions
      .filter((t) => t.date.startsWith(thisMonth) && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Category breakdown for spending
    const categoryTotals: Record<string, number> = {};
    transactions
      .filter((t) => t.amount < 0)
      .forEach((t) => {
        categoryTotals[t.category] =
          (categoryTotals[t.category] || 0) + Math.abs(t.amount);
      });

    const categoryData = Object.entries(categoryTotals)
      .map(([category, total]) => ({
        name: CATEGORY_LABELS[category as SpendingCategory],
        value: Math.round(total * 100) / 100,
        color: CATEGORY_COLORS[category as SpendingCategory],
      }))
      .sort((a, b) => b.value - a.value);

    return {
      bankBalance,
      investmentValue,
      investmentProfit,
      retirementValue,
      netWorth,
      monthlySpending,
      categoryData,
    };
  }, [transactions, etoroPositions, retirementFunds]);

  // Net worth over time data (from retirement fund snapshots)
  const netWorthOverTime = useMemo(() => {
    if (retirementFunds.length === 0 && transactions.length === 0) return [];

    const months: Record<string, { bank: number; invest: number; retire: number }> = {};

    // Group transactions by month for bank balance
    for (const tx of transactions) {
      const month = tx.date.slice(0, 7);
      if (!months[month]) months[month] = { bank: 0, invest: 0, retire: 0 };
      if (tx.balance !== undefined) {
        months[month].bank = Math.max(months[month].bank, tx.balance);
      }
    }

    // Add retirement data
    for (const fund of retirementFunds) {
      const month = fund.date.slice(0, 7);
      if (!months[month]) months[month] = { bank: 0, invest: 0, retire: 0 };
      months[month].retire = fund.totalValue;
    }

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        "Bank Balance": data.bank,
        Investments: data.invest || stats.investmentValue,
        Retirement: data.retire,
        Total: data.bank + (data.invest || stats.investmentValue) + data.retire,
      }));
  }, [transactions, retirementFunds, stats.investmentValue]);

  if (!hasData) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-white mb-3">
          Welcome to FinTracker
        </h1>
        <p className="text-[var(--muted)] mb-6 max-w-md mx-auto">
          Track your Barclays spending, eToro investments, and Standard Life
          pension all in one place. Start by uploading your CSV exports.
        </p>
        <Link href="/upload" className="btn-primary inline-block">
          Upload Your Data
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Net Worth"
          value={formatCurrency(stats.netWorth)}
          trend={stats.netWorth >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Bank Balance"
          value={formatCurrency(stats.bankBalance)}
          subtitle="Barclays"
        />
        <StatCard
          label="Investments"
          value={formatCurrency(stats.investmentValue, "USD")}
          subtitle={`P/L: ${formatCurrency(stats.investmentProfit, "USD")}`}
          trend={stats.investmentProfit >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Retirement"
          value={formatCurrency(stats.retirementValue)}
          subtitle="Standard Life"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Net worth chart */}
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4">
            Net Worth Over Time
          </h2>
          {netWorthOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={netWorthOverTime}>
                <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e",
                    border: "1px solid #2e2e3e",
                    borderRadius: 8,
                    color: "#e5e7eb",
                  }}
                  formatter={(value) => formatCurrency(Number(value))}
                />
                <Area
                  type="monotone"
                  dataKey="Total"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[var(--muted)] text-sm">
              Upload data with balance information to see trends.
            </p>
          )}
        </div>

        {/* Spending breakdown pie */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Spending Breakdown
          </h2>
          {stats.categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {stats.categoryData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e",
                    border: "1px solid #2e2e3e",
                    borderRadius: 8,
                    color: "#e5e7eb",
                  }}
                  formatter={(value) => formatCurrency(Number(value))}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#9ca3af" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[var(--muted)] text-sm">
              No spending data yet.
            </p>
          )}
        </div>
      </div>

      {/* Monthly spending stat */}
      {stats.monthlySpending > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-2">This Month</h2>
          <p className="text-3xl font-bold negative">
            -{formatCurrency(stats.monthlySpending)}
          </p>
          <p className="text-sm text-[var(--muted)]">Total spending this month</p>
        </div>
      )}
    </div>
  );
}
