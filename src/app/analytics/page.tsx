"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import { useFinanceStore } from "@/lib/store";
import {
  formatCurrency,
  convertCurrency,
  isSpending,
  getEffectiveCategory,
  detectRecurringTransactions,
  calculateSavingsRate,
  getMerchantInsights,
} from "@/lib/utils";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SpendingCategory,
} from "@/lib/types";
import StatCard from "@/components/StatCard";

const CHART_COLORS = [
  "#6366f1", "#22c55e", "#f97316", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#eab308", "#3b82f6", "#a855f7",
];

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--card-border)",
    borderRadius: "8px",
    fontSize: "13px",
  },
};

export default function AnalyticsPage() {
  const {
    transactions,
    etoroPositions,
    etoroTransactions,
    etoroDividends,
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
  const overrides = categoryOverrides || {};
  const fmt = (n: number) => formatCurrency(n, cur);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtTooltip = (value: any) => formatCurrency(Number(value), cur);

  // ─── Core calculations ──────────────────────────────────────────────────────

  const monthlyFinancials = useMemo(() => {
    const months: Record<
      string,
      {
        income: number;
        spending: number;
        investmentPL: number;
        dividends: number;
        pensionContrib: number;
        employerContrib: number;
        bankBalance: number;
      }
    > = {};

    const ensure = (m: string) => {
      if (!months[m])
        months[m] = {
          income: 0,
          spending: 0,
          investmentPL: 0,
          dividends: 0,
          pensionContrib: 0,
          employerContrib: 0,
          bankBalance: 0,
        };
    };

    // Bank transactions
    for (const tx of transactions) {
      const m = tx.date.slice(0, 7);
      ensure(m);
      if (tx.amount > 0 && getEffectiveCategory(tx, overrides) === "income") {
        months[m].income += tx.amount;
      } else if (isSpending(tx, overrides)) {
        months[m].spending += Math.abs(tx.amount);
      }
      if (tx.balance !== undefined) {
        // keep latest balance per month
        months[m].bankBalance = tx.balance;
      }
    }

    // Investment P/L from closed positions by close month
    for (const p of etoroPositions) {
      if ((p.status || "closed") === "closed" && p.closeDate) {
        const m = p.closeDate.slice(0, 7);
        ensure(m);
        months[m].investmentPL += convertCurrency(p.profit, "USD", cur, rates);
      }
    }

    // Dividends
    for (const d of etoroDividends) {
      const m = d.date.slice(0, 7);
      ensure(m);
      months[m].dividends += convertCurrency(d.netDividendUSD, "USD", cur, rates);
    }

    // Retirement contributions (incremental, not cumulative)
    const sortedRetirement = [...retirementFunds].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    let prevContrib = 0;
    let prevEmployer = 0;
    for (const f of sortedRetirement) {
      const m = f.date.slice(0, 7);
      ensure(m);
      months[m].pensionContrib = f.contributions - prevContrib;
      months[m].employerContrib = f.employerContributions - prevEmployer;
      prevContrib = f.contributions;
      prevEmployer = f.employerContributions;
    }

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, ...d, net: d.income - d.spending }));
  }, [transactions, etoroPositions, etoroDividends, retirementFunds, cur, rates, overrides]);

  // ─── Financial Health Score ─────────────────────────────────────────────────

  const healthScore = useMemo(() => {
    let score = 0;
    let factors = 0;

    // 1. Savings rate (0-25 pts) — last 3 months average
    const recent3 = monthlyFinancials.slice(-3);
    if (recent3.length > 0) {
      const avgIncome = recent3.reduce((s, m) => s + m.income, 0) / recent3.length;
      const avgSpending = recent3.reduce((s, m) => s + m.spending, 0) / recent3.length;
      if (avgIncome > 0) {
        const savingsRate = ((avgIncome - avgSpending) / avgIncome) * 100;
        score += Math.min(25, Math.max(0, savingsRate));
        factors++;
      }
    }

    // 2. Budget adherence (0-25 pts)
    if ((budgets || []).length > 0) {
      const currentMonth = monthlyFinancials[monthlyFinancials.length - 1]?.month || "";
      const monthTxs = transactions.filter((t) => t.date.startsWith(currentMonth));
      let withinBudget = 0;
      for (const b of budgets || []) {
        const spent = monthTxs
          .filter((t) => getEffectiveCategory(t, overrides) === b.category && t.amount < 0)
          .reduce((s, t) => s + Math.abs(t.amount), 0);
        if (spent <= b.monthlyLimit) withinBudget++;
      }
      score += (withinBudget / (budgets || []).length) * 25;
      factors++;
    } else {
      score += 15; // neutral if no budgets set
      factors++;
    }

    // 3. Investment diversification (0-25 pts)
    const openPositions = etoroPositions.filter((p) => (p.status || "closed") === "open");
    if (openPositions.length > 0) {
      const instruments = new Set(openPositions.map((p) => p.instrument));
      const diversityScore = Math.min(25, instruments.size * 3);
      score += diversityScore;
      factors++;
    } else if (etoroPositions.length === 0) {
      score += 10;
      factors++;
    } else {
      score += 15;
      factors++;
    }

    // 4. Wealth growth trajectory (0-25 pts)
    if (monthlyFinancials.length >= 3) {
      const last6 = monthlyFinancials.slice(-6);
      let growthMonths = 0;
      for (let i = 1; i < last6.length; i++) {
        const prevNet = last6[i - 1].net + last6[i - 1].investmentPL + last6[i - 1].dividends;
        const currNet = last6[i].net + last6[i].investmentPL + last6[i].dividends;
        if (currNet >= prevNet * 0.9) growthMonths++;
      }
      const ratio = last6.length > 1 ? growthMonths / (last6.length - 1) : 0;
      score += ratio * 25;
      factors++;
    } else {
      score += 12;
      factors++;
    }

    return Math.round(factors > 0 ? score : 50);
  }, [monthlyFinancials, budgets, transactions, etoroPositions, overrides]);

  // ─── Wealth composition over time ──────────────────────────────────────────

  const wealthComposition = useMemo(() => {
    const months: Record<string, { bank: number; invest: number; retire: number }> = {};

    // Bank balances from transactions
    const sortedTxs = [...transactions]
      .filter((t) => t.balance !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const tx of sortedTxs) {
      const m = tx.date.slice(0, 7);
      months[m] = months[m] || { bank: 0, invest: 0, retire: 0 };
      months[m].bank = convertCurrency(tx.balance!, "GBP", cur, rates);
    }

    // Retirement values
    for (const f of retirementFunds) {
      const m = f.date.slice(0, 7);
      months[m] = months[m] || { bank: 0, invest: 0, retire: 0 };
      months[m].retire = convertCurrency(f.totalValue, "GBP", cur, rates);
    }

    // Investment value: accumulate closed P/L + dividends over time
    const closedByMonth: Record<string, number> = {};
    for (const p of etoroPositions.filter((p) => (p.status || "closed") === "closed")) {
      if (p.closeDate) {
        const m = p.closeDate.slice(0, 7);
        closedByMonth[m] = (closedByMonth[m] || 0) + p.profit;
      }
    }

    const etoroDeposits = etoroTransactions
      .filter((tx) => tx.type.toLowerCase().includes("deposit"))
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const etoroWithdrawals = etoroTransactions
      .filter((tx) => tx.type.toLowerCase().includes("withdraw"))
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const netDeposited = etoroDeposits - etoroWithdrawals;

    let cumulativePL = 0;
    const allMonths = new Set([
      ...Object.keys(months),
      ...Object.keys(closedByMonth),
    ]);
    const sorted = Array.from(allMonths).sort();

    let lastBank = 0;
    let lastRetire = 0;

    return sorted.map((m) => {
      if (months[m]?.bank) lastBank = months[m].bank;
      if (months[m]?.retire) lastRetire = months[m].retire;
      cumulativePL += closedByMonth[m] ? convertCurrency(closedByMonth[m], "USD", cur, rates) : 0;
      const investVal = netDeposited > 0
        ? convertCurrency(netDeposited + cumulativePL, "USD", cur, rates)
        : 0;

      return {
        month: m,
        Bank: Math.round(lastBank),
        Investments: Math.round(Math.max(0, investVal)),
        Retirement: Math.round(lastRetire),
      };
    });
  }, [transactions, etoroPositions, etoroTransactions, retirementFunds, cur, rates]);

  // ─── Income sources breakdown ──────────────────────────────────────────────

  const incomeSources = useMemo(() => {
    const totalSalary = transactions
      .filter((t) => t.amount > 0 && getEffectiveCategory(t, overrides) === "income")
      .reduce((s, t) => s + t.amount, 0);

    const totalDividends = etoroDividends.reduce(
      (s, d) => s + convertCurrency(d.netDividendUSD, "USD", cur, rates),
      0
    );

    const totalEmployerPension = retirementFunds.length > 0
      ? convertCurrency(retirementFunds[0].employerContributions, "GBP", cur, rates)
      : 0;

    const totalInvestmentGains = etoroPositions
      .filter((p) => (p.status || "closed") === "closed" && p.profit > 0)
      .reduce((s, p) => s + convertCurrency(p.profit, "USD", cur, rates), 0);

    return [
      { name: "Salary / Income", value: Math.round(totalSalary), color: "#22c55e" },
      { name: "Dividends", value: Math.round(totalDividends), color: "#6366f1" },
      { name: "Employer Pension", value: Math.round(totalEmployerPension), color: "#8b5cf6" },
      { name: "Investment Gains", value: Math.round(totalInvestmentGains), color: "#f97316" },
    ].filter((s) => s.value > 0);
  }, [transactions, etoroDividends, retirementFunds, etoroPositions, overrides, cur, rates]);

  // ─── Category spending radar (last 3 months vs prior 3) ────────────────────

  const spendingRadar = useMemo(() => {
    const allMonths = monthlyFinancials.map((m) => m.month);
    if (allMonths.length < 2) return [];

    const recentMonths = new Set(allMonths.slice(-3));
    const priorMonths = new Set(allMonths.slice(-6, -3));

    const recentCats: Record<string, number> = {};
    const priorCats: Record<string, number> = {};

    for (const tx of transactions) {
      if (!isSpending(tx, overrides)) continue;
      const m = tx.date.slice(0, 7);
      const cat = getEffectiveCategory(tx, overrides);
      if (cat === "transfers" || cat === "income") continue;
      const amount = Math.abs(tx.amount);

      if (recentMonths.has(m)) {
        recentCats[cat] = (recentCats[cat] || 0) + amount;
      } else if (priorMonths.has(m)) {
        priorCats[cat] = (priorCats[cat] || 0) + amount;
      }
    }

    const allCats = new Set([...Object.keys(recentCats), ...Object.keys(priorCats)]);
    const recentDivisor = recentMonths.size || 1;
    const priorDivisor = priorMonths.size || 1;

    return Array.from(allCats)
      .map((cat) => ({
        category: CATEGORY_LABELS[cat as SpendingCategory] || cat,
        Recent: Math.round((recentCats[cat] || 0) / recentDivisor),
        Prior: Math.round((priorCats[cat] || 0) / priorDivisor),
      }))
      .filter((d) => d.Recent > 0 || d.Prior > 0)
      .sort((a, b) => b.Recent - a.Recent)
      .slice(0, 8);
  }, [transactions, monthlyFinancials, overrides]);

  // ─── Investment performance by instrument ──────────────────────────────────

  const instrumentPerformance = useMemo(() => {
    const instruments: Record<string, { invested: number; profit: number; count: number }> = {};

    for (const p of etoroPositions) {
      const name = p.instrument;
      if (!instruments[name]) instruments[name] = { invested: 0, profit: 0, count: 0 };
      instruments[name].invested += p.units * p.openRate;
      instruments[name].profit += p.profit;
      instruments[name].count++;
    }

    return Object.entries(instruments)
      .map(([name, d]) => ({
        name,
        invested: convertCurrency(d.invested, "USD", cur, rates),
        profit: convertCurrency(d.profit, "USD", cur, rates),
        returnPct: d.invested > 0 ? (d.profit / d.invested) * 100 : 0,
        count: d.count,
      }))
      .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
      .slice(0, 15);
  }, [etoroPositions, cur, rates]);

  // ─── Projected net worth (linear extrapolation from last 6 months) ─────────

  const projectedNetWorth = useMemo(() => {
    if (wealthComposition.length < 3) return [];

    const historical = wealthComposition.map((d) => ({
      month: d.month,
      total: d.Bank + d.Investments + d.Retirement,
      isProjected: false,
    }));

    // Use last 6 data points for trend
    const recent = historical.slice(-6);
    if (recent.length < 2) return historical;

    const n = recent.length;
    const xMean = (n - 1) / 2;
    const yMean = recent.reduce((s, d) => s + d.total, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (recent[i].total - yMean);
      den += (i - xMean) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;

    // Project 12 months forward
    const lastMonth = historical[historical.length - 1].month;
    const [lastY, lastM] = lastMonth.split("-").map(Number);
    const projections = [];

    for (let i = 1; i <= 12; i++) {
      const futureDate = new Date(lastY, lastM - 1 + i, 1);
      const m = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}`;
      const projected = intercept + slope * (n - 1 + i);
      projections.push({
        month: m,
        total: Math.round(Math.max(0, projected)),
        isProjected: true,
      });
    }

    return [...historical, ...projections];
  }, [wealthComposition]);

  // ─── Year-over-year comparison ─────────────────────────────────────────────

  const yearComparison = useMemo(() => {
    const years: Record<
      string,
      { income: number; spending: number; saved: number; investPL: number; dividends: number }
    > = {};

    for (const m of monthlyFinancials) {
      const y = m.month.slice(0, 4);
      if (!years[y])
        years[y] = { income: 0, spending: 0, saved: 0, investPL: 0, dividends: 0 };
      years[y].income += m.income;
      years[y].spending += m.spending;
      years[y].saved += m.net;
      years[y].investPL += m.investmentPL;
      years[y].dividends += m.dividends;
    }

    return Object.entries(years)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, d]) => ({
        year,
        ...d,
        savingsRate: d.income > 0 ? ((d.income - d.spending) / d.income) * 100 : 0,
      }));
  }, [monthlyFinancials]);

  // ─── Monthly cash flow (income vs spending vs net) ─────────────────────────

  const cashFlowData = useMemo(() => {
    return monthlyFinancials.slice(-12).map((m) => ({
      month: m.month,
      Income: Math.round(m.income),
      Spending: Math.round(m.spending),
      Net: Math.round(m.net),
    }));
  }, [monthlyFinancials]);

  // ─── Spending efficiency: essential vs discretionary ───────────────────────

  const spendingEfficiency = useMemo(() => {
    const essential = new Set<SpendingCategory>(["groceries", "bills", "transport", "health"]);
    const discretionary = new Set<SpendingCategory>(["eating-out", "shopping", "entertainment", "subscriptions"]);

    const monthMap: Record<string, { essential: number; discretionary: number; other: number }> = {};

    for (const tx of transactions) {
      if (!isSpending(tx, overrides)) continue;
      const m = tx.date.slice(0, 7);
      const cat = getEffectiveCategory(tx, overrides) as SpendingCategory;
      if (!monthMap[m]) monthMap[m] = { essential: 0, discretionary: 0, other: 0 };

      const amount = Math.abs(tx.amount);
      if (essential.has(cat)) monthMap[m].essential += amount;
      else if (discretionary.has(cat)) monthMap[m].discretionary += amount;
      else if (cat !== "transfers" && cat !== "income") monthMap[m].other += amount;
    }

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, d]) => ({
        month,
        Essential: Math.round(d.essential),
        Discretionary: Math.round(d.discretionary),
        Other: Math.round(d.other),
      }));
  }, [transactions, overrides]);

  // ─── Dividend income trend ─────────────────────────────────────────────────

  const dividendTrend = useMemo(() => {
    const monthMap: Record<string, number> = {};
    for (const d of etoroDividends) {
      const m = d.date.slice(0, 7);
      monthMap[m] = (monthMap[m] || 0) + convertCurrency(d.netDividendUSD, "USD", cur, rates);
    }
    let cumulative = 0;
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => {
        cumulative += amount;
        return {
          month,
          Monthly: Math.round(amount * 100) / 100,
          Cumulative: Math.round(cumulative * 100) / 100,
        };
      });
  }, [etoroDividends, cur, rates]);

  // ─── Top spending changes (biggest movers month-over-month) ────────────────

  const spendingMovers = useMemo(() => {
    const months = monthlyFinancials.map((m) => m.month);
    if (months.length < 2) return [];

    const currentMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];

    const catSpending = (m: string) => {
      const result: Record<string, number> = {};
      for (const tx of transactions) {
        if (!tx.date.startsWith(m) || !isSpending(tx, overrides)) continue;
        const cat = getEffectiveCategory(tx, overrides);
        if (cat === "transfers" || cat === "income") continue;
        result[cat] = (result[cat] || 0) + Math.abs(tx.amount);
      }
      return result;
    };

    const curr = catSpending(currentMonth);
    const prev = catSpending(prevMonth);
    const allCats = new Set([...Object.keys(curr), ...Object.keys(prev)]);

    return Array.from(allCats)
      .map((cat) => {
        const c = curr[cat] || 0;
        const p = prev[cat] || 0;
        const change = c - p;
        const changePct = p > 0 ? (change / p) * 100 : c > 0 ? 100 : 0;
        return {
          category: CATEGORY_LABELS[cat as SpendingCategory] || cat,
          current: c,
          previous: p,
          change,
          changePct,
        };
      })
      .filter((d) => Math.abs(d.change) > 1)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }, [transactions, monthlyFinancials, overrides]);

  // ─── Recurring cost analysis ───────────────────────────────────────────────

  const recurringCosts = useMemo(() => {
    const recurring = detectRecurringTransactions(transactions);
    const monthly = recurring
      .filter((r) => r.frequency === "monthly")
      .sort((a, b) => b.averageAmount - a.averageAmount);
    const totalMonthly = monthly.reduce((s, r) => s + r.averageAmount, 0);
    return { monthly, totalMonthly, annualized: totalMonthly * 12 };
  }, [transactions]);

  // ─── Summary stats ─────────────────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    const latestWealth = wealthComposition[wealthComposition.length - 1];
    const totalNetWorth = latestWealth
      ? latestWealth.Bank + latestWealth.Investments + latestWealth.Retirement
      : 0;

    const totalIncome = monthlyFinancials.reduce((s, m) => s + m.income, 0);
    const totalSpending = monthlyFinancials.reduce((s, m) => s + m.spending, 0);
    const avgMonthlySavings =
      monthlyFinancials.length > 0
        ? (totalIncome - totalSpending) / monthlyFinancials.length
        : 0;

    const totalDividends = etoroDividends.reduce(
      (s, d) => s + convertCurrency(d.netDividendUSD, "USD", cur, rates),
      0
    );
    const investmentPL = etoroPositions.reduce(
      (s, p) => s + convertCurrency(p.profit, "USD", cur, rates),
      0
    );

    const savingsRateData = calculateSavingsRate(transactions, 6);
    const avgSavingsRate =
      savingsRateData.length > 0
        ? savingsRateData.reduce((s, d) => s + d.rate, 0) / savingsRateData.length
        : 0;

    return {
      totalNetWorth,
      avgMonthlySavings,
      totalDividends,
      investmentPL,
      avgSavingsRate,
      totalIncome,
      totalSpending,
    };
  }, [wealthComposition, monthlyFinancials, etoroDividends, etoroPositions, transactions, cur, rates]);

  // ─── Spending vs passive income ────────────────────────────────────────────

  const passiveVsSpending = useMemo(() => {
    return monthlyFinancials.slice(-12).map((m) => ({
      month: m.month,
      Spending: Math.round(m.spending),
      "Passive Income": Math.round(m.dividends + m.investmentPL),
    }));
  }, [monthlyFinancials]);

  const hasData =
    transactions.length > 0 ||
    etoroPositions.length > 0 ||
    retirementFunds.length > 0;

  if (!hasData) {
    return (
      <div className="text-center py-20 text-[var(--muted)]">
        <p className="text-4xl mb-4 opacity-50">~</p>
        <p className="text-lg">No data available yet.</p>
        <p className="text-sm mt-2">
          Upload bank statements, eToro exports, or Standard Life data to see analytics.
        </p>
      </div>
    );
  }

  const scoreColor =
    healthScore >= 70 ? "#22c55e" : healthScore >= 45 ? "#eab308" : "#ef4444";
  const scoreLabel =
    healthScore >= 80
      ? "Excellent"
      : healthScore >= 65
      ? "Good"
      : healthScore >= 45
      ? "Fair"
      : "Needs Work";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-1">Analytics</h1>
        <p className="text-[var(--muted)]">
          Cross-referencing all your financial data in one place
        </p>
      </div>

      {/* ── Financial Health Score + Key Stats ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card flex flex-col items-center justify-center py-6">
          <p className="text-sm text-[var(--muted)] mb-2">Financial Health</p>
          <div
            className="relative w-28 h-28 rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(${scoreColor} ${healthScore * 3.6}deg, var(--card-border) 0deg)`,
            }}
          >
            <div className="absolute inset-2 rounded-full bg-[var(--card)] flex items-center justify-center flex-col">
              <span className="text-3xl font-bold" style={{ color: scoreColor }}>
                {healthScore}
              </span>
              <span className="text-xs text-[var(--muted)]">{scoreLabel}</span>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] mt-3 text-center">
            Based on savings rate, budgets,
            <br />
            diversification & growth
          </p>
        </div>

        <StatCard
          label="Net Worth"
          value={fmt(summaryStats.totalNetWorth)}
          trend={summaryStats.totalNetWorth > 0 ? "up" : "neutral"}
        />
        <StatCard
          label="Avg Monthly Savings"
          value={fmt(summaryStats.avgMonthlySavings)}
          subtitle={`${summaryStats.avgSavingsRate.toFixed(1)}% savings rate`}
          trend={summaryStats.avgMonthlySavings > 0 ? "up" : "down"}
        />
        <StatCard
          label="Investment Returns"
          value={fmt(summaryStats.investmentPL)}
          subtitle={`${fmt(summaryStats.totalDividends)} in dividends`}
          trend={summaryStats.investmentPL >= 0 ? "up" : "down"}
        />
      </div>

      {/* ── Wealth Composition Over Time ──────────────────────────────────── */}
      {wealthComposition.length > 1 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Wealth Composition Over Time</h2>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={wealthComposition}>
              <XAxis
                dataKey="month"
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => v.slice(2)}
              />
              <YAxis
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={fmtTooltip}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="Bank"
                stackId="1"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.3}
              />
              <Area
                type="monotone"
                dataKey="Investments"
                stackId="1"
                stroke="#f97316"
                fill="#f97316"
                fillOpacity={0.3}
              />
              <Area
                type="monotone"
                dataKey="Retirement"
                stackId="1"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Monthly Cash Flow ─────────────────────────────────────────────── */}
      {cashFlowData.length > 1 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Monthly Cash Flow</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={cashFlowData}>
              <XAxis
                dataKey="month"
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => v.slice(2)}
              />
              <YAxis
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip {...tooltipStyle} formatter={fmtTooltip} />
              <Legend />
              <Bar dataKey="Income" fill="#22c55e" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Spending" fill="#ef4444" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
              <Line
                type="monotone"
                dataKey="Net"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ fill: "#6366f1", r: 3 }}
              />
              <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Income Sources ──────────────────────────────────────────────── */}
        {incomeSources.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Income Sources (All Time)</h2>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={incomeSources}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name || ""} ${((percent || 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                  fontSize={11}
                >
                  {incomeSources.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  {...tooltipStyle}
                  formatter={fmtTooltip}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Spending Radar ──────────────────────────────────────────────── */}
        {spendingRadar.length > 2 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">
              Spending Pattern (Recent vs Prior 3 Months)
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={spendingRadar}>
                <PolarGrid stroke="var(--card-border)" />
                <PolarAngleAxis
                  dataKey="category"
                  stroke="var(--muted)"
                  fontSize={11}
                />
                <PolarRadiusAxis stroke="var(--muted)" fontSize={10} />
                <Radar
                  name="Recent 3mo avg"
                  dataKey="Recent"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.3}
                />
                <Radar
                  name="Prior 3mo avg"
                  dataKey="Prior"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.15}
                />
                <Legend />
                <Tooltip {...tooltipStyle} formatter={fmtTooltip} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Essential vs Discretionary Spending ───────────────────────────── */}
      {spendingEfficiency.length > 1 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">
            Essential vs Discretionary Spending
          </h2>
          <p className="text-xs text-[var(--muted)] mb-4">
            Essential: Groceries, Bills, Transport, Health | Discretionary:
            Eating Out, Shopping, Entertainment, Subscriptions
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={spendingEfficiency}>
              <XAxis
                dataKey="month"
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => v.slice(2)}
              />
              <YAxis
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip {...tooltipStyle} formatter={fmtTooltip} />
              <Legend />
              <Bar
                dataKey="Essential"
                stackId="a"
                fill="#3b82f6"
                fillOpacity={0.8}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Discretionary"
                stackId="a"
                fill="#f97316"
                fillOpacity={0.8}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Other"
                stackId="a"
                fill="#6b7280"
                fillOpacity={0.6}
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Passive Income vs Spending ────────────────────────────────────── */}
      {passiveVsSpending.some((d) => d["Passive Income"] !== 0) && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">
            Passive Income vs Monthly Spending
          </h2>
          <p className="text-xs text-[var(--muted)] mb-4">
            How much of your spending could be covered by investment returns and
            dividends
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={passiveVsSpending}>
              <XAxis
                dataKey="month"
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => v.slice(2)}
              />
              <YAxis
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip {...tooltipStyle} formatter={fmtTooltip} />
              <Legend />
              <Bar dataKey="Spending" fill="#ef4444" fillOpacity={0.4} radius={[2, 2, 0, 0]} />
              <Line
                type="monotone"
                dataKey="Passive Income"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: "#22c55e", r: 3 }}
              />
              <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Net Worth Projection ──────────────────────────────────────────── */}
      {projectedNetWorth.length > 3 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">Net Worth Projection</h2>
          <p className="text-xs text-[var(--muted)] mb-4">
            Linear extrapolation based on last 6 months trend
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={projectedNetWorth}>
              <XAxis
                dataKey="month"
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => v.slice(2)}
              />
              <YAxis
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={fmtTooltip}
              />
              <defs>
                <linearGradient id="projGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="50%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="total"
                stroke="url(#projGrad)"
                fill="#6366f1"
                fillOpacity={0.15}
                strokeWidth={2}
                strokeDasharray="0"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Investment Performance by Instrument ────────────────────────── */}
        {instrumentPerformance.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">
              Investment Performance by Instrument
            </h2>
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--muted)] text-left">
                    <th className="pb-2">Instrument</th>
                    <th className="pb-2 text-right">Invested</th>
                    <th className="pb-2 text-right">P/L</th>
                    <th className="pb-2 text-right">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {instrumentPerformance.map((p) => (
                    <tr
                      key={p.name}
                      className="border-t border-[var(--card-border)]/50 hover:bg-[var(--card-border)]/20"
                    >
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="py-2 text-right text-[var(--muted)]">
                        {fmt(p.invested)}
                      </td>
                      <td
                        className={`py-2 text-right font-medium ${
                          p.profit >= 0 ? "positive" : "negative"
                        }`}
                      >
                        {p.profit >= 0 ? "+" : ""}
                        {fmt(p.profit)}
                      </td>
                      <td
                        className={`py-2 text-right ${
                          p.returnPct >= 0 ? "positive" : "negative"
                        }`}
                      >
                        {p.returnPct >= 0 ? "+" : ""}
                        {p.returnPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Dividend Income Trend ───────────────────────────────────────── */}
        {dividendTrend.length > 1 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Dividend Income Trend</h2>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={dividendTrend}>
                <XAxis
                  dataKey="month"
                  stroke="var(--muted)"
                  fontSize={12}
                  tickFormatter={(v) => v.slice(2)}
                />
                <YAxis
                  yAxisId="left"
                  stroke="var(--muted)"
                  fontSize={12}
                  tickFormatter={(v) => fmt(v)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="var(--muted)"
                  fontSize={12}
                  tickFormatter={(v) => fmt(v)}
                />
                <Tooltip {...tooltipStyle} formatter={fmtTooltip} />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="Monthly"
                  fill="#22c55e"
                  fillOpacity={0.6}
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Cumulative"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Year-over-Year Comparison ─────────────────────────────────────── */}
      {yearComparison.length > 1 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Year-over-Year Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-left">
                  <th className="pb-2">Year</th>
                  <th className="pb-2 text-right">Income</th>
                  <th className="pb-2 text-right">Spending</th>
                  <th className="pb-2 text-right">Saved</th>
                  <th className="pb-2 text-right">Savings Rate</th>
                  <th className="pb-2 text-right">Investment P/L</th>
                  <th className="pb-2 text-right">Dividends</th>
                </tr>
              </thead>
              <tbody>
                {yearComparison.map((y, i) => {
                  const prev = yearComparison[i - 1];
                  return (
                    <tr
                      key={y.year}
                      className="border-t border-[var(--card-border)]/50"
                    >
                      <td className="py-2 font-medium">{y.year}</td>
                      <td className="py-2 text-right">
                        {fmt(y.income)}
                        {prev && prev.income > 0 && (
                          <span
                            className={`text-xs ml-1 ${
                              y.income >= prev.income ? "positive" : "negative"
                            }`}
                          >
                            {y.income >= prev.income ? "+" : ""}
                            {(((y.income - prev.income) / prev.income) * 100).toFixed(0)}
                            %
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">{fmt(y.spending)}</td>
                      <td
                        className={`py-2 text-right font-medium ${
                          y.saved >= 0 ? "positive" : "negative"
                        }`}
                      >
                        {fmt(y.saved)}
                      </td>
                      <td className="py-2 text-right">
                        {y.savingsRate.toFixed(1)}%
                      </td>
                      <td
                        className={`py-2 text-right ${
                          y.investPL >= 0 ? "positive" : "negative"
                        }`}
                      >
                        {y.investPL >= 0 ? "+" : ""}
                        {fmt(y.investPL)}
                      </td>
                      <td className="py-2 text-right positive">
                        {fmt(y.dividends)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Spending Movers + Recurring Costs ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Biggest spending changes */}
        {spendingMovers.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">
              Spending Changes (vs Last Month)
            </h2>
            <div className="space-y-2">
              {spendingMovers.slice(0, 8).map((m) => (
                <div
                  key={m.category}
                  className="flex items-center justify-between py-1.5 border-b border-[var(--card-border)]/30"
                >
                  <span className="text-sm">{m.category}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-[var(--muted)]">
                      {fmt(m.previous)} &rarr; {fmt(m.current)}
                    </span>
                    <span
                      className={`font-medium min-w-[70px] text-right ${
                        m.change > 0 ? "negative" : "positive"
                      }`}
                    >
                      {m.change > 0 ? "+" : ""}
                      {fmt(m.change)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recurring costs */}
        {recurringCosts.monthly.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-2">
              Recurring Monthly Costs
            </h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              Total: {fmt(recurringCosts.totalMonthly)}/mo (
              {fmt(recurringCosts.annualized)}/yr)
            </p>
            <div className="space-y-1.5 overflow-auto max-h-[300px]">
              {recurringCosts.monthly.slice(0, 12).map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-[var(--card-border)]/30"
                >
                  <span className="text-sm truncate max-w-[200px]">
                    {r.description}
                  </span>
                  <span className="text-sm font-medium text-[var(--muted)]">
                    {fmt(r.averageAmount)}/mo
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Key Ratios & Metrics ──────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Key Financial Ratios</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(() => {
            const latestMonth = monthlyFinancials[monthlyFinancials.length - 1];
            const avgMonthlyIncome =
              monthlyFinancials.length > 0
                ? monthlyFinancials.reduce((s, m) => s + m.income, 0) /
                  monthlyFinancials.length
                : 0;
            const avgMonthlySpending =
              monthlyFinancials.length > 0
                ? monthlyFinancials.reduce((s, m) => s + m.spending, 0) /
                  monthlyFinancials.length
                : 0;
            const monthsOfRunway =
              avgMonthlySpending > 0
                ? summaryStats.totalNetWorth / avgMonthlySpending
                : 0;

            const investmentRatio =
              summaryStats.totalNetWorth > 0
                ? ((wealthComposition[wealthComposition.length - 1]?.Investments || 0) /
                    summaryStats.totalNetWorth) *
                  100
                : 0;

            const retirementRatio =
              summaryStats.totalNetWorth > 0
                ? ((wealthComposition[wealthComposition.length - 1]?.Retirement || 0) /
                    summaryStats.totalNetWorth) *
                  100
                : 0;

            const essentialRatio = (() => {
              const latest = spendingEfficiency[spendingEfficiency.length - 1];
              if (!latest) return 0;
              const total = latest.Essential + latest.Discretionary + latest.Other;
              return total > 0 ? (latest.Essential / total) * 100 : 0;
            })();

            return (
              <>
                <div className="text-center p-3 rounded-lg bg-[var(--card-border)]/20">
                  <p className="text-2xl font-bold text-white">
                    {monthsOfRunway.toFixed(1)}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Months of Runway
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-[var(--card-border)]/20">
                  <p className="text-2xl font-bold text-white">
                    {investmentRatio.toFixed(0)}%
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Invested (of Net Worth)
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-[var(--card-border)]/20">
                  <p className="text-2xl font-bold text-white">
                    {retirementRatio.toFixed(0)}%
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    In Retirement Fund
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-[var(--card-border)]/20">
                  <p className="text-2xl font-bold text-white">
                    {essentialRatio.toFixed(0)}%
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Essential Spending
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
