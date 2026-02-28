"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { CATEGORY_LABELS, CATEGORY_COLORS, SpendingCategory } from "@/lib/types";
import StatCard from "@/components/StatCard";

export default function SpendingPage() {
  const { transactions } = useFinanceStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const spending = useMemo(
    () => transactions.filter((t) => t.amount < 0),
    [transactions]
  );

  const income = useMemo(
    () => transactions.filter((t) => t.amount > 0),
    [transactions]
  );

  const stats = useMemo(() => {
    const totalSpent = spending.reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalIncome = income.reduce((s, t) => s + t.amount, 0);

    // By category
    const categoryTotals: Record<string, number> = {};
    spending.forEach((t) => {
      categoryTotals[t.category] =
        (categoryTotals[t.category] || 0) + Math.abs(t.amount);
    });
    const categoryData = Object.entries(categoryTotals)
      .map(([cat, total]) => ({
        category: cat,
        name: CATEGORY_LABELS[cat as SpendingCategory],
        value: Math.round(total * 100) / 100,
        color: CATEGORY_COLORS[cat as SpendingCategory],
      }))
      .sort((a, b) => b.value - a.value);

    // By month
    const monthlyTotals: Record<string, { spent: number; earned: number }> = {};
    transactions.forEach((t) => {
      const month = t.date.slice(0, 7);
      if (!monthlyTotals[month]) monthlyTotals[month] = { spent: 0, earned: 0 };
      if (t.amount < 0) monthlyTotals[month].spent += Math.abs(t.amount);
      else monthlyTotals[month].earned += t.amount;
    });
    const monthlyData = Object.entries(monthlyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        Spending: Math.round(data.spent * 100) / 100,
        Income: Math.round(data.earned * 100) / 100,
      }));

    return { totalSpent, totalIncome, categoryData, monthlyData };
  }, [spending, income, transactions]);

  const filteredTransactions = useMemo(() => {
    if (!selectedCategory) return spending.slice(0, 50);
    return spending
      .filter((t) => t.category === selectedCategory)
      .slice(0, 50);
  }, [spending, selectedCategory]);

  if (transactions.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-3">Spending</h1>
        <p className="text-[var(--muted)] mb-6">
          No Barclays data imported yet. Upload a CSV to get started.
        </p>
        <Link href="/upload" className="btn-primary inline-block">
          Upload CSV
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Spending</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Spent"
          value={formatCurrency(stats.totalSpent)}
          subtitle={`${spending.length} transactions`}
        />
        <StatCard
          label="Total Income"
          value={formatCurrency(stats.totalIncome)}
          trend="up"
        />
        <StatCard
          label="Net"
          value={formatCurrency(stats.totalIncome - stats.totalSpent)}
          trend={stats.totalIncome - stats.totalSpent >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Avg / Transaction"
          value={formatCurrency(
            spending.length > 0 ? stats.totalSpent / spending.length : 0
          )}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly spending bar chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Monthly Spending vs Income
          </h2>
          {stats.monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.monthlyData}>
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
                <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Spending" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[var(--muted)] text-sm">No data to display.</p>
          )}
        </div>

        {/* Category pie chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            By Category
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.categoryData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                dataKey="value"
                paddingAngle={2}
                onClick={(entry) => {
                  setSelectedCategory(
                    selectedCategory === entry.category ? null : entry.category
                  );
                }}
                style={{ cursor: "pointer" }}
              >
                {stats.categoryData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.color}
                    opacity={
                      selectedCategory && selectedCategory !== entry.category
                        ? 0.3
                        : 1
                    }
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
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transaction list */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {selectedCategory
              ? `${CATEGORY_LABELS[selectedCategory as SpendingCategory]} Transactions`
              : "Recent Transactions"}
          </h2>
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Show all
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-[var(--card-border)]/50 hover:bg-white/5"
                >
                  <td className="py-2 pr-4 text-[var(--muted)]">
                    {formatDate(tx.date)}
                  </td>
                  <td className="py-2 pr-4 text-white">{tx.description}</td>
                  <td className="py-2 pr-4">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: `${CATEGORY_COLORS[tx.category]}20`,
                        color: CATEGORY_COLORS[tx.category],
                      }}
                    >
                      {CATEGORY_LABELS[tx.category]}
                    </span>
                  </td>
                  <td className="py-2 text-right negative">
                    -{formatCurrency(Math.abs(tx.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
