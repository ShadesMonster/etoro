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
import {
  formatCurrency,
  convertCurrency,
  getEffectiveCategory,
} from "@/lib/utils";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SpendingCategory,
} from "@/lib/types";
import StatCard from "@/components/StatCard";

export default function Dashboard() {
  const {
    transactions,
    etoroPositions,
    retirementFunds,
    settings,
    categoryOverrides,
    budgets,
  } = useFinanceStore();

  const cur = settings?.preferredCurrency || "GBP";
  const rates = settings || {
    exchangeRateGBPtoUSD: 1.27,
    exchangeRateUSDtoGBP: 0.79,
  };

  const hasData =
    transactions.length > 0 ||
    etoroPositions.length > 0 ||
    retirementFunds.length > 0;

  const stats = useMemo(() => {
    const latestTx = transactions.find((t) => t.balance !== undefined);
    const bankBalanceGBP = latestTx?.balance ?? 0;
    const bankBalance = convertCurrency(bankBalanceGBP, "GBP", cur, rates);

    const investmentValueUSD = etoroPositions.reduce(
      (sum, p) => sum + p.units * p.currentRate,
      0
    );
    const investmentProfitUSD = etoroPositions.reduce(
      (sum, p) => sum + p.profit,
      0
    );
    const investmentValue = convertCurrency(investmentValueUSD, "USD", cur, rates);
    const investmentProfit = convertCurrency(investmentProfitUSD, "USD", cur, rates);

    const latestRetirement = retirementFunds[0];
    const retirementValueGBP = latestRetirement?.totalValue ?? 0;
    const retirementValue = convertCurrency(retirementValueGBP, "GBP", cur, rates);

    const netWorth = bankBalance + investmentValue + retirementValue;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlySpending = transactions
      .filter((t) => t.date.startsWith(thisMonth) && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const categoryTotals: Record<string, number> = {};
    transactions
      .filter((t) => t.amount < 0)
      .forEach((t) => {
        const cat = getEffectiveCategory(t, categoryOverrides || {});
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount);
      });

    const categoryData = Object.entries(categoryTotals)
      .map(([category, total]) => ({
        name: CATEGORY_LABELS[category as SpendingCategory],
        value: Math.round(total * 100) / 100,
        color: CATEGORY_COLORS[category as SpendingCategory],
      }))
      .sort((a, b) => b.value - a.value);

    const monthBudgets = (budgets || []).map((b) => {
      const spent = transactions
        .filter((t) => {
          const cat = getEffectiveCategory(t, categoryOverrides || {});
          return t.date.startsWith(thisMonth) && t.amount < 0 && cat === b.category;
        })
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      return {
        ...b,
        spent,
        percent: b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0,
      };
    });

    return {
      bankBalance,
      investmentValue,
      investmentProfit,
      retirementValue,
      netWorth,
      monthlySpending,
      categoryData,
      monthBudgets,
    };
  }, [transactions, etoroPositions, retirementFunds, settings, cur, rates, categoryOverrides, budgets]);

  const netWorthOverTime = useMemo(() => {
    if (retirementFunds.length === 0 && transactions.length === 0) return [];

    const months: Record<string, { bank: number; invest: number; retire: number }> = {};

    for (const tx of transactions) {
      const month = tx.date.slice(0, 7);
      if (!months[month]) months[month] = { bank: 0, invest: 0, retire: 0 };
      if (tx.balance !== undefined) {
        months[month].bank = Math.max(months[month].bank, tx.balance);
      }
    }

    for (const fund of retirementFunds) {
      const month = fund.date.slice(0, 7);
      if (!months[month]) months[month] = { bank: 0, invest: 0, retire: 0 };
      months[month].retire = fund.totalValue;
    }

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        Total:
          Math.round(
            (convertCurrency(data.bank, "GBP", cur, rates) +
              convertCurrency(data.invest || 0, "USD", cur, rates) +
              convertCurrency(data.retire, "GBP", cur, rates)) *
              100
          ) / 100,
      }));
  }, [transactions, retirementFunds, cur, rates]);

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Net Worth"
          value={formatCurrency(stats.netWorth, cur)}
          trend={stats.netWorth >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Bank Balance"
          value={formatCurrency(stats.bankBalance, cur)}
          subtitle="Barclays"
        />
        <StatCard
          label="Investments"
          value={formatCurrency(stats.investmentValue, cur)}
          subtitle={`P/L: ${formatCurrency(stats.investmentProfit, cur)}`}
          trend={stats.investmentProfit >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Retirement"
          value={formatCurrency(stats.retirementValue, cur)}
          subtitle="Standard Life"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4">
            Net Worth Over Time
          </h2>
          {netWorthOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={netWorthOverTime}>
                <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                <YAxis
                  stroke="#6b7280"
                  fontSize={12}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e",
                    border: "1px solid #2e2e3e",
                    borderRadius: 8,
                    color: "#e5e7eb",
                  }}
                  formatter={(value) => formatCurrency(Number(value), cur)}
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
                  formatter={(value) => formatCurrency(Number(value), cur)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[var(--muted)] text-sm">No spending data yet.</p>
          )}
        </div>
      </div>

      {/* Budget overview + monthly spending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stats.monthlySpending > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-2">
              This Month
            </h2>
            <p className="text-3xl font-bold negative">
              -{formatCurrency(stats.monthlySpending, cur)}
            </p>
            <p className="text-sm text-[var(--muted)]">
              Total spending this month
            </p>
          </div>
        )}

        {stats.monthBudgets.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">
              Budget Status
            </h2>
            <div className="space-y-3">
              {stats.monthBudgets.map((b) => (
                <div key={b.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[var(--muted)]">
                      {CATEGORY_LABELS[b.category]}
                    </span>
                    <span
                      className={
                        b.percent > 100
                          ? "negative"
                          : b.percent > 80
                          ? "text-[var(--yellow)]"
                          : "text-white"
                      }
                    >
                      {formatCurrency(b.spent, cur)} /{" "}
                      {formatCurrency(b.monthlyLimit, cur)}
                    </span>
                  </div>
                  <div className="budget-bar">
                    <div
                      className="budget-bar-fill"
                      style={{
                        width: `${Math.min(b.percent, 100)}%`,
                        background:
                          b.percent > 100
                            ? "#ef4444"
                            : b.percent > 80
                            ? "#eab308"
                            : "#22c55e",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
