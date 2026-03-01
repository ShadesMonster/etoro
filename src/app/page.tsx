"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
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
  convertCurrency,
  getEffectiveCategory,
  isSpending,
  detectRecurringTransactions,
  getUpcomingBills,
  calculateSavingsRate,
  getSpendingHeatmap,
  getMerchantInsights,
  detectAnomalies,
  generateAlerts,
} from "@/lib/utils";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SpendingCategory,
  DashboardWidget,
} from "@/lib/types";
import StatCard from "@/components/StatCard";

export default function Dashboard() {
  const {
    transactions,
    etoroPositions,
    etoroTransactions,
    etoroDividends,
    retirementFunds,
    settings,
    categoryOverrides,
    budgets,
    dashboardWidgets,
    dismissedAlerts,
    dismissAlert,
  } = useFinanceStore();

  const cur = settings?.preferredCurrency || "GBP";
  const rates = settings || {
    exchangeRateGBPtoUSD: 1.27,
    exchangeRateUSDtoGBP: 0.79,
  };
  const widgets = dashboardWidgets || [
    "net-worth", "net-worth-chart", "spending-breakdown",
    "this-month", "budget-status", "savings-rate",
    "alerts", "upcoming-bills", "merchant-insights", "heatmap",
  ];
  const show = (w: DashboardWidget) => widgets.includes(w);

  const hasData =
    transactions.length > 0 ||
    etoroPositions.length > 0 ||
    retirementFunds.length > 0;

  const stats = useMemo(() => {
    const latestTx = transactions.find((t) => t.balance !== undefined);
    const bankBalanceGBP = latestTx?.balance ?? 0;
    const bankBalance = convertCurrency(bankBalanceGBP, "GBP", cur, rates);

    // Investment value: deposits - withdrawals + realized P/L + dividends + unrealized P/L
    const openEtoroPositions = etoroPositions.filter((p) => (p.status || "closed") === "open");
    const closedPL = etoroPositions
      .filter((p) => (p.status || "closed") === "closed")
      .reduce((sum, p) => sum + p.profit, 0);
    const etoroDeposits = etoroTransactions
      .filter((tx) => tx.type.toLowerCase().includes("deposit"))
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const etoroWithdrawals = etoroTransactions
      .filter((tx) => tx.type.toLowerCase().includes("withdraw"))
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const etoroNetInvested = etoroDeposits - etoroWithdrawals;
    const etoroDivTotal = etoroDividends.length > 0
      ? etoroDividends.reduce((s, d) => s + d.netDividendUSD, 0)
      : etoroTransactions
          .filter((tx) => tx.type.toLowerCase().includes("dividend") || tx.detail.toLowerCase().includes("dividend"))
          .reduce((s, tx) => s + tx.amount, 0);

    // Unrealized P/L from open positions (only if we have full position data with prices)
    const unrealizedPL = openEtoroPositions.reduce((sum, p) => sum + p.profit, 0);

    let investmentValueUSD: number;
    if (etoroNetInvested > 0) {
      // Best estimate: net deposits + all P/L + dividends
      investmentValueUSD = etoroNetInvested + closedPL + etoroDivTotal + unrealizedPL;
    } else if (etoroPositions.length > 0) {
      // No transaction data - rough fallback from positions only
      investmentValueUSD = etoroPositions.reduce((sum, p) => sum + p.units * p.currentRate, 0);
    } else {
      investmentValueUSD = 0;
    }
    const investmentProfitUSD = closedPL + etoroDivTotal + unrealizedPL;
    const investmentValue = convertCurrency(investmentValueUSD, "USD", cur, rates);
    const investmentProfit = convertCurrency(investmentProfitUSD, "USD", cur, rates);

    const latestRetirement = retirementFunds[0];
    const retirementValueGBP = latestRetirement?.totalValue ?? 0;
    const retirementValue = convertCurrency(retirementValueGBP, "GBP", cur, rates);

    const netWorth = bankBalance + investmentValue + retirementValue;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlySpending = transactions
      .filter((t) => t.date.startsWith(thisMonth) && isSpending(t, categoryOverrides || {}))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const monthlyIncome = transactions
      .filter((t) => t.date.startsWith(thisMonth) && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const categoryTotals: Record<string, number> = {};
    transactions
      .filter((t) => isSpending(t, categoryOverrides || {}))
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
        ...b, spent,
        percent: b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0,
      };
    });

    return {
      bankBalance, investmentValue, investmentProfit,
      retirementValue, netWorth, monthlySpending, monthlyIncome,
      categoryData, monthBudgets,
    };
  }, [transactions, etoroPositions, retirementFunds, settings, cur, rates, categoryOverrides, budgets]);

  // Stacked net worth over time
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
        Bank: Math.round(convertCurrency(data.bank, "GBP", cur, rates) * 100) / 100,
        Investments: Math.round(convertCurrency(data.invest || 0, "USD", cur, rates) * 100) / 100,
        Retirement: Math.round(convertCurrency(data.retire, "GBP", cur, rates) * 100) / 100,
      }));
  }, [transactions, retirementFunds, cur, rates]);

  // Savings rate
  const savingsRate = useMemo(
    () => calculateSavingsRate(transactions, 6),
    [transactions]
  );

  // Heatmap
  const heatmapData = useMemo(
    () => getSpendingHeatmap(transactions),
    [transactions]
  );

  // Merchant insights (top 5)
  const merchants = useMemo(
    () => getMerchantInsights(transactions, categoryOverrides || {}).slice(0, 5),
    [transactions, categoryOverrides]
  );

  // Alerts
  const recurring = useMemo(() => detectRecurringTransactions(transactions), [transactions]);
  const anomalies = useMemo(() => detectAnomalies(transactions, categoryOverrides || {}), [transactions, categoryOverrides]);
  const upcomingBills = useMemo(() => getUpcomingBills(recurring), [recurring]);

  const alerts = useMemo(() => {
    const all = generateAlerts(transactions, budgets || [], categoryOverrides || {}, recurring, anomalies);
    const dismissed = new Set(dismissedAlerts || []);
    return all.filter((a) => !dismissed.has(a.id));
  }, [transactions, budgets, categoryOverrides, recurring, anomalies, dismissedAlerts]);

  if (!hasData) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-white mb-3">
          Welcome to FinTracker
        </h1>
        <p className="text-[var(--muted)] mb-6 max-w-md mx-auto">
          Track your spending, investments, and pension all in one place.
          Start by uploading your CSV exports.
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

      {/* Alerts */}
      {show("alerts") && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="card flex items-center justify-between py-3"
              style={{
                borderColor:
                  alert.type === "budget-exceeded" ? "rgba(239,68,68,0.4)" :
                  alert.type === "large-transaction" ? "rgba(234,179,8,0.4)" :
                  "rgba(99,102,241,0.4)",
                background:
                  alert.type === "budget-exceeded" ? "rgba(239,68,68,0.06)" :
                  alert.type === "large-transaction" ? "rgba(234,179,8,0.06)" :
                  "rgba(99,102,241,0.06)",
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  {alert.type === "budget-exceeded" ? "\u26A0\uFE0F" :
                   alert.type === "large-transaction" ? "\uD83D\uDCA1" :
                   "\uD83D\uDCC5"}
                </span>
                <div>
                  <p className="text-sm text-white">{alert.message}</p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(alert.date)}</p>
                </div>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="text-xs text-[var(--muted)] hover:text-white"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Net worth cards */}
      {show("net-worth") && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Net Worth"
            value={formatCurrency(stats.netWorth, cur)}
            trend={stats.netWorth >= 0 ? "up" : "down"}
          />
          <StatCard
            label="Bank Balance"
            value={formatCurrency(stats.bankBalance, cur)}
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
          />
        </div>
      )}

      {/* Net worth chart + spending breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {show("net-worth-chart") && (
          <div className="card lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4">
              Net Worth Over Time
            </h2>
            {netWorthOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={netWorthOverTime}>
                  <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                  <YAxis
                    stroke="#6b7280" fontSize={12}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1e1e2e", border: "1px solid #2e2e3e",
                      borderRadius: 8, color: "#e5e7eb",
                    }}
                    formatter={(value) => formatCurrency(Number(value), cur)}
                  />
                  <Area type="monotone" dataKey="Bank" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="Investments" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="Retirement" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[var(--muted)] text-sm">
                Upload data with balance information to see trends.
              </p>
            )}
          </div>
        )}

        {show("spending-breakdown") && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">
              Spending Breakdown
            </h2>
            {stats.categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.categoryData}
                    cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                    dataKey="value" paddingAngle={2}
                  >
                    {stats.categoryData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#1e1e2e", border: "1px solid #2e2e3e",
                      borderRadius: 8, color: "#e5e7eb",
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
        )}
      </div>

      {/* Savings rate + this month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {show("this-month") && stats.monthlySpending > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-2">This Month</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[var(--muted)]">Spending</p>
                <p className="text-2xl font-bold negative">
                  -{formatCurrency(stats.monthlySpending, cur)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--muted)]">Income</p>
                <p className="text-2xl font-bold positive">
                  +{formatCurrency(stats.monthlyIncome, cur)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-sm text-[var(--muted)]">
                Net: <span className={stats.monthlyIncome - stats.monthlySpending >= 0 ? "positive" : "negative"}>
                  {formatCurrency(stats.monthlyIncome - stats.monthlySpending, cur)}
                </span>
              </p>
            </div>
          </div>
        )}

        {show("savings-rate") && savingsRate.length > 0 && savingsRate.some((m) => m.income > 0) && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">
              Savings Rate (6 months)
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={savingsRate}>
                <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e", border: "1px solid #2e2e3e",
                    borderRadius: 8, color: "#e5e7eb",
                  }}
                  formatter={(value, name) =>
                    name === "rate" ? `${value}%` : formatCurrency(Number(value), cur)
                  }
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {savingsRate.map((entry, index) => (
                    <Cell key={index} fill={entry.rate >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Budget status */}
      {show("budget-status") && stats.monthBudgets.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Budget Status</h2>
          <div className="space-y-3">
            {stats.monthBudgets.map((b) => (
              <div key={b.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[var(--muted)]">{CATEGORY_LABELS[b.category]}</span>
                  <span className={
                    b.percent > 100 ? "negative" : b.percent > 80 ? "text-[var(--yellow)]" : "text-white"
                  }>
                    {formatCurrency(b.spent, cur)} / {formatCurrency(b.monthlyLimit, cur)}
                  </span>
                </div>
                <div className="budget-bar">
                  <div className="budget-bar-fill" style={{
                    width: `${Math.min(b.percent, 100)}%`,
                    background: b.percent > 100 ? "#ef4444" : b.percent > 80 ? "#eab308" : "#22c55e",
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming bills + merchant insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {show("upcoming-bills") && upcomingBills.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Upcoming Bills</h2>
            <div className="space-y-2">
              {upcomingBills.slice(0, 5).map((bill, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div>
                    <p className="text-sm text-white">{bill.description}</p>
                    <p className="text-xs text-[var(--muted)]">{formatDate(bill.expectedDate)}</p>
                  </div>
                  <span className="text-sm negative">-{formatCurrency(bill.expectedAmount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {show("merchant-insights") && merchants.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Top Merchants</h2>
            <div className="space-y-2">
              {merchants.map((m, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div>
                    <p className="text-sm text-white capitalize">{m.merchant}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {m.transactionCount} transactions &middot; avg {formatCurrency(m.avgAmount)}
                    </p>
                  </div>
                  <span className="text-sm negative">-{formatCurrency(m.totalSpent)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Spending heatmap */}
      {show("heatmap") && heatmapData.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Spending Heatmap (last 6 months)
          </h2>
          <SpendingHeatmapGrid data={heatmapData} />
        </div>
      )}
    </div>
  );
}

// ─── Inline heatmap component ────────────────────────────────────────────────

function SpendingHeatmapGrid({
  data,
}: {
  data: Array<{ date: string; amount: number; count: number }>;
}) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDate = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth(), 1);

  const lookup: Record<string, { amount: number; count: number }> = {};
  let maxAmount = 0;
  for (const d of data) {
    lookup[d.date] = { amount: d.amount, count: d.count };
    if (d.amount > maxAmount) maxAmount = d.amount;
  }

  const weeks: Array<Array<{ date: string; amount: number; count: number } | null>> = [];
  const current = new Date(startDate);
  const today = new Date();

  // Fill initial empty days
  let currentWeek: Array<{ date: string; amount: number; count: number } | null> = [];
  for (let i = 0; i < current.getDay(); i++) {
    currentWeek.push(null);
  }

  while (current <= today) {
    const key = current.toISOString().slice(0, 10);
    const info = lookup[key];
    currentWeek.push({
      date: key,
      amount: info?.amount || 0,
      count: info?.count || 0,
    });

    if (current.getDay() === 6) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    current.setDate(current.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const getColor = (amount: number) => {
    if (amount === 0) return "rgba(128,128,128,0.1)";
    const intensity = Math.min(amount / (maxAmount * 0.6), 1);
    if (intensity < 0.25) return "rgba(34,197,94,0.3)";
    if (intensity < 0.5) return "rgba(234,179,8,0.4)";
    if (intensity < 0.75) return "rgba(249,115,22,0.5)";
    return "rgba(239,68,68,0.6)";
  };

  return (
    <div>
      <div className="flex gap-0.5 overflow-x-auto pb-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((day, di) => (
              <div
                key={di}
                className="w-3 h-3 rounded-sm"
                style={{ background: day ? getColor(day.amount) : "transparent" }}
                title={
                  day
                    ? `${day.date}: ${formatCurrency(day.amount)} (${day.count} txns)`
                    : ""
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-[var(--muted)]">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{
              background: i === 0
                ? "rgba(128,128,128,0.1)"
                : i < 0.25 ? "rgba(34,197,94,0.3)"
                : i < 0.5 ? "rgba(234,179,8,0.4)"
                : i < 0.75 ? "rgba(249,115,22,0.5)"
                : "rgba(239,68,68,0.6)",
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
