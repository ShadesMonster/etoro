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
import {
  formatCurrency,
  formatDate,
  formatPercent,
  getEffectiveCategory,
  isSpending,
  detectRecurringTransactions,
  calculateSpendingForecast,
  calculateSpendingTrends,
  getUpcomingBills,
  getMerchantInsights,
  detectAnomalies,
} from "@/lib/utils";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SpendingCategory,
  ALL_CATEGORIES,
} from "@/lib/types";
import StatCard from "@/components/StatCard";
import Pagination from "@/components/Pagination";

const PAGE_SIZE = 25;
const BANK_LABELS: Record<string, string> = {
  barclays: "Barclays", monzo: "Monzo", revolut: "Revolut",
  starling: "Starling", generic: "Other",
};

export default function SpendingPage() {
  const { transactions, categoryOverrides, setTransactionCategory, budgets } =
    useFinanceStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Get unique bank sources
  const sources = useMemo(() => {
    const s = new Set(transactions.map((t) => t.source));
    return Array.from(s);
  }, [transactions]);

  // Apply category overrides and source filter
  const txsWithCategory = useMemo(
    () => {
      let txs = transactions;
      if (sourceFilter !== "all") txs = txs.filter((t) => t.source === sourceFilter);
      return txs.map((t) => ({
        ...t,
        effectiveCategory: getEffectiveCategory(t, categoryOverrides || {}),
      }));
    },
    [transactions, categoryOverrides, sourceFilter]
  );

  // Filter by date range
  const dateFiltered = useMemo(() => {
    let result = txsWithCategory;
    if (dateFrom) result = result.filter((t) => t.date >= dateFrom);
    if (dateTo) result = result.filter((t) => t.date <= dateTo);
    return result;
  }, [txsWithCategory, dateFrom, dateTo]);

  // Filter by search
  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return dateFiltered;
    const q = searchQuery.toLowerCase();
    return dateFiltered.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        CATEGORY_LABELS[t.effectiveCategory].toLowerCase().includes(q)
    );
  }, [dateFiltered, searchQuery]);

  const spending = useMemo(
    () => searchFiltered.filter((t) => t.amount < 0 && t.effectiveCategory !== "transfers"),
    [searchFiltered]
  );

  const income = useMemo(
    () => searchFiltered.filter((t) => t.amount > 0),
    [searchFiltered]
  );

  const stats = useMemo(() => {
    const totalSpent = spending.reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalIncome = income.reduce((s, t) => s + t.amount, 0);

    const categoryTotals: Record<string, number> = {};
    spending.forEach((t) => {
      categoryTotals[t.effectiveCategory] =
        (categoryTotals[t.effectiveCategory] || 0) + Math.abs(t.amount);
    });
    const categoryData = Object.entries(categoryTotals)
      .map(([cat, total]) => ({
        category: cat,
        name: CATEGORY_LABELS[cat as SpendingCategory],
        value: Math.round(total * 100) / 100,
        color: CATEGORY_COLORS[cat as SpendingCategory],
      }))
      .sort((a, b) => b.value - a.value);

    const monthlyTotals: Record<string, { spent: number; earned: number }> = {};
    searchFiltered.forEach((t) => {
      const month = t.date.slice(0, 7);
      if (!monthlyTotals[month]) monthlyTotals[month] = { spent: 0, earned: 0 };
      if (t.amount < 0 && t.effectiveCategory !== "transfers") monthlyTotals[month].spent += Math.abs(t.amount);
      else if (t.amount > 0) monthlyTotals[month].earned += t.amount;
    });
    const monthlyData = Object.entries(monthlyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        Spending: Math.round(data.spent * 100) / 100,
        Income: Math.round(data.earned * 100) / 100,
      }));

    return { totalSpent, totalIncome, categoryData, monthlyData };
  }, [spending, income, searchFiltered]);

  // Budget progress for current month
  const budgetProgress = useMemo(() => {
    if (!budgets || budgets.length === 0) return [];
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return budgets.map((b) => {
      const spent = txsWithCategory
        .filter(
          (t) =>
            t.date.startsWith(thisMonth) &&
            t.amount < 0 &&
            t.effectiveCategory === b.category
        )
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      return {
        ...b,
        spent,
        percent: b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0,
      };
    });
  }, [budgets, txsWithCategory]);

  // Spending forecast
  const forecast = useMemo(
    () => calculateSpendingForecast(transactions),
    [transactions]
  );

  // Spending trends (month-over-month)
  const trends = useMemo(
    () => calculateSpendingTrends(transactions, categoryOverrides || {}),
    [transactions, categoryOverrides]
  );

  // Recurring transactions
  const recurring = useMemo(
    () => detectRecurringTransactions(transactions),
    [transactions]
  );

  // Upcoming bills
  const upcomingBills = useMemo(
    () => getUpcomingBills(recurring),
    [recurring]
  );

  // Anomalies
  const anomalies = useMemo(
    () => detectAnomalies(transactions, categoryOverrides || {}),
    [transactions, categoryOverrides]
  );

  // Top merchants
  const merchants = useMemo(
    () => getMerchantInsights(transactions, categoryOverrides || {}).slice(0, 10),
    [transactions, categoryOverrides]
  );

  // Paginated + filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!selectedCategory) return spending;
    return spending.filter((t) => t.effectiveCategory === selectedCategory);
  }, [spending, selectedCategory]);

  const totalPages = Math.ceil(filteredTransactions.length / PAGE_SIZE);
  const paginatedTxs = useMemo(
    () =>
      filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTransactions, page]
  );

  const handleCategoryChange = (cat: string | null) => {
    setSelectedCategory(cat);
    setPage(1);
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-3">Spending</h1>
        <p className="text-[var(--muted)] mb-6">
          No bank data imported yet. Upload a CSV to get started.
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
        <h1 className="text-2xl font-bold text-white">Spending</h1>
        <button
          onClick={() => window.print()}
          className="btn-secondary text-sm no-print"
        >
          Print / PDF
        </button>
      </div>

      {/* Filters */}
      <div className="card no-print">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-56"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {sources.length > 1 && (
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">
                Account
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
                className="w-36"
              >
                <option value="all">All Accounts</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {BANK_LABELS[s] || s}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(searchQuery || dateFrom || dateTo || sourceFilter !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setDateFrom("");
                setDateTo("");
                setSourceFilter("all");
                setPage(1);
              }}
              className="btn-secondary text-sm"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

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

      {/* Spending Forecast */}
      {forecast.spentSoFar > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            This Month&apos;s Forecast
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Spent so far</p>
              <p className="text-lg font-semibold text-white">
                {formatCurrency(forecast.spentSoFar)}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {forecast.daysElapsed} days elapsed
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Projected remaining</p>
              <p className="text-lg font-semibold text-white">
                {formatCurrency(forecast.projectedRemaining)}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {forecast.daysRemaining} days left
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Projected total</p>
              <p className="text-lg font-semibold text-white">
                {formatCurrency(forecast.projectedTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)] mb-1">Avg daily spend</p>
              <p className="text-lg font-semibold text-white">
                {formatCurrency(forecast.avgDailySpending)}
              </p>
            </div>
          </div>
          <div className="mt-3 budget-bar">
            <div
              className="budget-bar-fill"
              style={{
                width: `${Math.min(
                  (forecast.daysElapsed / (forecast.daysElapsed + forecast.daysRemaining)) * 100,
                  100
                )}%`,
                background: "var(--accent)",
              }}
            />
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">
            Month progress: {forecast.daysElapsed} of {forecast.daysElapsed + forecast.daysRemaining} days
          </p>
        </div>
      )}

      {/* Budget progress */}
      {budgetProgress.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Monthly Budgets
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgetProgress.map((b) => (
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
                    {formatCurrency(b.spent)} / {formatCurrency(b.monthlyLimit)}{" "}
                    ({Math.round(b.percent)}%)
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

      {/* Spending Trends (Month over Month) */}
      {trends.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Spending Trends (vs Last Month)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4 text-right">This Month</th>
                  <th className="pb-2 pr-4 text-right">Last Month</th>
                  <th className="pb-2 pr-4 text-right">Change</th>
                  <th className="pb-2 text-right">% Change</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t) => (
                  <tr
                    key={t.category}
                    className="border-b border-[var(--card-border)]/50 hover:bg-[var(--card-border)]/30"
                  >
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ background: CATEGORY_COLORS[t.category] }}
                        />
                        <span className="text-white">
                          {CATEGORY_LABELS[t.category]}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right text-white">
                      {formatCurrency(t.thisMonth)}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--muted)]">
                      {formatCurrency(t.lastMonth)}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right ${
                        t.change > 0 ? "negative" : t.change < 0 ? "positive" : ""
                      }`}
                    >
                      {t.change > 0 ? "+" : ""}
                      {formatCurrency(Math.abs(t.change))}
                      {t.change > 0 ? " \u25B2" : t.change < 0 ? " \u25BC" : ""}
                    </td>
                    <td
                      className={`py-2 text-right ${
                        t.changePercent > 0 ? "negative" : t.changePercent < 0 ? "positive" : ""
                      }`}
                    >
                      {formatPercent(t.changePercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
          <h2 className="text-lg font-semibold text-white mb-4">By Category</h2>
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
                  handleCategoryChange(
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

      {/* Upcoming Bills */}
      {upcomingBills.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Upcoming Bills (next 30 days)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Description</th>
                  <th className="pb-2 pr-4">Expected Date</th>
                  <th className="pb-2 pr-4">Frequency</th>
                  <th className="pb-2 text-right">Expected Amount</th>
                </tr>
              </thead>
              <tbody>
                {upcomingBills.map((bill, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--card-border)]/50 hover:bg-[var(--card-border)]/30"
                  >
                    <td className="py-2 pr-4 text-white">{bill.description}</td>
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {formatDate(bill.expectedDate)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">
                        {bill.frequency}
                      </span>
                    </td>
                    <td className="py-2 text-right negative">
                      -{formatCurrency(bill.expectedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anomalies + Merchant Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {anomalies.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">
              Unusual Transactions
            </h2>
            <div className="space-y-2">
              {anomalies.slice(0, 5).map((a, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{
                    background: a.severity === "alert"
                      ? "rgba(239,68,68,0.06)"
                      : "rgba(234,179,8,0.06)",
                    borderLeft: `3px solid ${a.severity === "alert" ? "#ef4444" : "#eab308"}`,
                  }}
                >
                  <div>
                    <p className="text-sm text-white">{a.transaction.description}</p>
                    <p className="text-xs text-[var(--muted)]">{a.reason}</p>
                  </div>
                  <span className="text-sm negative">
                    -{formatCurrency(Math.abs(a.transaction.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {merchants.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">
              Top Merchants
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                    <th className="pb-2 pr-4">Merchant</th>
                    <th className="pb-2 pr-4 text-right">Total</th>
                    <th className="pb-2 pr-4 text-right">Avg</th>
                    <th className="pb-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((m, i) => (
                    <tr key={i} className="border-b border-[var(--card-border)]/50">
                      <td className="py-1.5 pr-4 text-white capitalize">{m.merchant}</td>
                      <td className="py-1.5 pr-4 text-right negative">
                        -{formatCurrency(m.totalSpent)}
                      </td>
                      <td className="py-1.5 pr-4 text-right text-[var(--muted)]">
                        {formatCurrency(m.avgAmount)}
                      </td>
                      <td className="py-1.5 text-right text-[var(--muted)]">{m.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Transaction list */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {selectedCategory
              ? `${CATEGORY_LABELS[selectedCategory as SpendingCategory]} Transactions`
              : "Transactions"}
          </h2>
          {selectedCategory && (
            <button
              onClick={() => handleCategoryChange(null)}
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
              {paginatedTxs.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-[var(--card-border)]/50 hover:bg-[var(--card-border)]/30"
                >
                  <td className="py-2 pr-4 text-[var(--muted)]">
                    {formatDate(tx.date)}
                  </td>
                  <td className="py-2 pr-4 text-white">{tx.description}</td>
                  <td className="py-2 pr-4">
                    <select
                      className="category-select"
                      value={tx.effectiveCategory}
                      onChange={(e) =>
                        setTransactionCategory(
                          tx.id,
                          e.target.value as SpendingCategory
                        )
                      }
                      style={{
                        background: `${CATEGORY_COLORS[tx.effectiveCategory]}15`,
                        color: CATEGORY_COLORS[tx.effectiveCategory],
                        borderColor: `${CATEGORY_COLORS[tx.effectiveCategory]}40`,
                      }}
                    >
                      {ALL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right negative">
                    -{formatCurrency(Math.abs(tx.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={filteredTransactions.length}
          pageSize={PAGE_SIZE}
        />
      </div>

      {/* Recurring Transactions */}
      {recurring.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Recurring Payments
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Description</th>
                  <th className="pb-2 pr-4 text-right">Avg Amount</th>
                  <th className="pb-2 pr-4">Frequency</th>
                  <th className="pb-2 pr-4">Last Charged</th>
                  <th className="pb-2 text-right">Occurrences</th>
                </tr>
              </thead>
              <tbody>
                {recurring.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--card-border)]/50 hover:bg-[var(--card-border)]/30"
                  >
                    <td className="py-2 pr-4 text-white">{r.description}</td>
                    <td className="py-2 pr-4 text-right negative">
                      -{formatCurrency(r.averageAmount)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">
                        {r.frequency}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {formatDate(r.lastDate)}
                    </td>
                    <td className="py-2 text-right text-[var(--muted)]">
                      {r.count}
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
