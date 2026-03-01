import {
  Transaction, SpendingCategory, RecurringTransaction,
  SpendingForecast, CategoryTrend, UpcomingBill,
  MerchantInsight, AnomalyTransaction, FinancialAlert,
  Budget, Debt,
} from "./types";

export function formatCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** True spending = negative amount AND not a transfer (transfers are money moving between your own accounts) */
export function isSpending(tx: Transaction, overrides?: Record<string, SpendingCategory>): boolean {
  if (tx.amount >= 0) return false;
  const cat = overrides ? getEffectiveCategory(tx, overrides) : tx.category;
  return cat !== "transfers" && cat !== "income";
}

export function groupByMonth(
  items: Array<{ date: string; amount?: number; totalValue?: number }>
): Record<string, typeof items> {
  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const key = item.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function getEffectiveCategory(
  tx: Transaction, overrides: Record<string, SpendingCategory>
): SpendingCategory {
  return overrides[tx.id] || tx.category;
}

export function convertCurrency(
  amount: number, from: "GBP" | "USD", to: "GBP" | "USD",
  rates: { exchangeRateGBPtoUSD: number; exchangeRateUSDtoGBP: number }
): number {
  if (from === to) return amount;
  if (from === "GBP" && to === "USD") return amount * rates.exchangeRateGBPtoUSD;
  return amount * rates.exchangeRateUSDtoGBP;
}

export function detectRecurringTransactions(transactions: Transaction[]): RecurringTransaction[] {
  const spending = transactions.filter((t) => isSpending(t));
  const groups: Record<string, Transaction[]> = {};
  for (const tx of spending) {
    const key = tx.description.toLowerCase().trim()
      .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, "")
      .replace(/ref:?\s*\w+/gi, "")
      .replace(/\s{2,}/g, " ").trim();
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }
  const recurring: RecurringTransaction[] = [];
  for (const [, txs] of Object.entries(groups)) {
    if (txs.length < 2) continue;
    const sorted = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let totalDays = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalDays += (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
    }
    const avgDays = totalDays / (sorted.length - 1);
    let frequency: "weekly" | "monthly" | "quarterly" | null = null;
    if (avgDays >= 5 && avgDays <= 10) frequency = "weekly";
    else if (avgDays >= 20 && avgDays <= 40) frequency = "monthly";
    else if (avgDays >= 75 && avgDays <= 105) frequency = "quarterly";
    if (!frequency) continue;
    const avgAmount = txs.reduce((s, t) => s + Math.abs(t.amount), 0) / txs.length;
    const lastTx = sorted[sorted.length - 1];
    recurring.push({
      description: txs[0].description,
      averageAmount: Math.round(avgAmount * 100) / 100,
      frequency, lastDate: lastTx.date, count: txs.length,
      expectedDay: new Date(lastTx.date).getDate(),
    });
  }
  return recurring.sort((a, b) => b.averageAmount - a.averageAmount);
}

export function calculateSpendingForecast(transactions: Transaction[]): SpendingForecast {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const thisMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const spentSoFar = transactions
    .filter((t) => t.date.startsWith(thisMonth) && isSpending(t))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  let totalSpending = 0;
  let totalDays = 0;
  for (let i = 1; i <= 3; i++) {
    const d = new Date(year, month - i, 1);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const mDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const mSpend = transactions
      .filter((t) => t.date.startsWith(mKey) && isSpending(t))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    if (mSpend > 0) { totalSpending += mSpend; totalDays += mDays; }
  }
  const avgDailySpending = totalDays > 0 ? totalSpending / totalDays : 0;
  const projectedRemaining = avgDailySpending * daysRemaining;
  return {
    spentSoFar,
    projectedRemaining: Math.round(projectedRemaining * 100) / 100,
    projectedTotal: Math.round((spentSoFar + projectedRemaining) * 100) / 100,
    avgDailySpending: Math.round(avgDailySpending * 100) / 100,
    daysRemaining, daysElapsed: dayOfMonth,
  };
}

export function calculateSpendingTrends(
  transactions: Transaction[], overrides: Record<string, SpendingCategory>
): CategoryTrend[] {
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth: Record<string, number> = {};
  const lastMonth: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const cat = getEffectiveCategory(tx, overrides);
    if (cat === "income" || cat === "transfers") continue;
    const amt = Math.abs(tx.amount);
    if (tx.date.startsWith(thisKey)) thisMonth[cat] = (thisMonth[cat] || 0) + amt;
    else if (tx.date.startsWith(lastKey)) lastMonth[cat] = (lastMonth[cat] || 0) + amt;
  }
  const allCats = new Set([...Object.keys(thisMonth), ...Object.keys(lastMonth)]);
  const trends: CategoryTrend[] = [];
  for (const cat of allCats) {
    const tm = thisMonth[cat] || 0;
    const lm = lastMonth[cat] || 0;
    const change = tm - lm;
    const changePercent = lm > 0 ? (change / lm) * 100 : tm > 0 ? 100 : 0;
    trends.push({
      category: cat as SpendingCategory, thisMonth: Math.round(tm * 100) / 100,
      lastMonth: Math.round(lm * 100) / 100, change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 10) / 10,
    });
  }
  return trends.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

export function getUpcomingBills(recurring: RecurringTransaction[]): UpcomingBill[] {
  const now = new Date();
  const bills: UpcomingBill[] = [];
  for (const r of recurring) {
    const last = new Date(r.lastDate);
    let freqDays = 30;
    if (r.frequency === "weekly") freqDays = 7;
    else if (r.frequency === "quarterly") freqDays = 90;
    const nextDate = new Date(last.getTime() + freqDays * 86400000);
    while (nextDate < now) nextDate.setDate(nextDate.getDate() + freqDays);
    const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / 86400000);
    if (daysUntil <= 30) {
      bills.push({
        description: r.description,
        expectedDate: nextDate.toISOString().slice(0, 10),
        expectedAmount: r.averageAmount, frequency: r.frequency,
      });
    }
  }
  return bills.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

export function exportTransactionsCSV(transactions: Transaction[]): string {
  const header = "Date,Description,Amount,Category,Balance,Source";
  const rows = transactions.map(
    (t) => `${t.date},"${t.description.replace(/"/g, '""')}",${t.amount},${t.category},${t.balance ?? ""},${t.source}`
  );
  return [header, ...rows].join("\n");
}

export function exportEtoroCSV(
  positions: Array<{
    instrument: string; units: number; openRate: number; currentRate: number;
    profit: number; profitPercent: number; openDate: string; type: string; status?: string;
  }>
): string {
  const header = "Instrument,Type,Status,Units,Open Rate,Close Rate,Profit,Profit %,Open Date";
  const rows = positions.map(
    (p) => `"${p.instrument}",${p.type},${p.status || "closed"},${p.units},${p.openRate},${p.currentRate},${p.profit},${p.profitPercent.toFixed(2)},${p.openDate}`
  );
  return [header, ...rows].join("\n");
}

export function getTaxYearOptions(): Array<{ start: string; end: string; label: string }> {
  const now = new Date();
  const years: Array<{ start: string; end: string; label: string }> = [];
  for (let i = 0; i < 5; i++) {
    const y = now.getFullYear() - i;
    years.push({ start: `${y}-04-06`, end: `${y + 1}-04-05`, label: `${y}/${y + 1}` });
  }
  return years;
}

// ─── Round 3: Merchant Insights ──────────────────────────────────────────────

export function getMerchantInsights(
  transactions: Transaction[],
  overrides: Record<string, SpendingCategory>
): MerchantInsight[] {
  const spending = transactions.filter((t) => isSpending(t, overrides));
  const groups: Record<string, { txs: Transaction[]; cat: SpendingCategory }> = {};

  for (const tx of spending) {
    const key = normalizeMerchant(tx.description);
    if (!key) continue;
    if (!groups[key]) {
      groups[key] = { txs: [], cat: getEffectiveCategory(tx, overrides) };
    }
    groups[key].txs.push(tx);
  }

  return Object.entries(groups)
    .filter(([, { txs }]) => txs.length >= 1)
    .map(([merchant, { txs, cat }]) => {
      const totalSpent = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
      const sorted = [...txs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      return {
        merchant,
        totalSpent: Math.round(totalSpent * 100) / 100,
        transactionCount: txs.length,
        avgAmount: Math.round((totalSpent / txs.length) * 100) / 100,
        lastDate: sorted[0].date,
        category: cat,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);
}

function normalizeMerchant(description: string): string {
  return description
    .toLowerCase()
    .trim()
    .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, "")
    .replace(/ref:?\s*\w+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

// ─── Round 3: Anomaly Detection ──────────────────────────────────────────────

export function detectAnomalies(
  transactions: Transaction[],
  overrides: Record<string, SpendingCategory>
): AnomalyTransaction[] {
  const spending = transactions.filter((t) => isSpending(t, overrides));

  // Calculate average + stddev per category
  const catAmounts: Record<string, number[]> = {};
  for (const tx of spending) {
    const cat = getEffectiveCategory(tx, overrides);
    if (!catAmounts[cat]) catAmounts[cat] = [];
    catAmounts[cat].push(Math.abs(tx.amount));
  }

  const catStats: Record<string, { mean: number; stddev: number }> = {};
  for (const [cat, amounts] of Object.entries(catAmounts)) {
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    catStats[cat] = { mean, stddev: Math.sqrt(variance) };
  }

  const anomalies: AnomalyTransaction[] = [];
  // Only flag recent transactions (last 90 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  for (const tx of spending) {
    if (new Date(tx.date) < cutoff) continue;
    const cat = getEffectiveCategory(tx, overrides);
    const stats = catStats[cat];
    if (!stats || stats.stddev === 0) continue;

    const amount = Math.abs(tx.amount);
    const zScore = (amount - stats.mean) / stats.stddev;

    if (zScore > 3) {
      anomalies.push({
        transaction: tx,
        reason: `${formatCurrency(amount)} is unusually high for ${cat} (avg: ${formatCurrency(stats.mean)})`,
        severity: "alert",
        averageForCategory: Math.round(stats.mean * 100) / 100,
      });
    } else if (zScore > 2) {
      anomalies.push({
        transaction: tx,
        reason: `${formatCurrency(amount)} is higher than usual for ${cat} (avg: ${formatCurrency(stats.mean)})`,
        severity: "warning",
        averageForCategory: Math.round(stats.mean * 100) / 100,
      });
    }
  }

  return anomalies.sort(
    (a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime()
  );
}

// ─── Round 3: Savings Rate ───────────────────────────────────────────────────

export function calculateSavingsRate(
  transactions: Transaction[],
  months: number = 6
): Array<{ month: string; income: number; spending: number; saved: number; rate: number }> {
  const now = new Date();
  const result: Array<{ month: string; income: number; spending: number; saved: number; rate: number }> = [];

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthTxs = transactions.filter((t) => t.date.startsWith(mKey));
    const income = monthTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const spending = monthTxs.filter((t) => isSpending(t)).reduce((s, t) => s + Math.abs(t.amount), 0);
    const saved = income - spending;
    const rate = income > 0 ? (saved / income) * 100 : 0;

    result.push({
      month: mKey,
      income: Math.round(income * 100) / 100,
      spending: Math.round(spending * 100) / 100,
      saved: Math.round(saved * 100) / 100,
      rate: Math.round(rate * 10) / 10,
    });
  }

  return result.reverse();
}

// ─── Round 3: Spending Heatmap ───────────────────────────────────────────────

export function getSpendingHeatmap(
  transactions: Transaction[]
): Array<{ date: string; amount: number; count: number }> {
  const daily: Record<string, { amount: number; count: number }> = {};
  for (const tx of transactions) {
    if (!isSpending(tx)) continue;
    const day = tx.date.slice(0, 10);
    if (!daily[day]) daily[day] = { amount: 0, count: 0 };
    daily[day].amount += Math.abs(tx.amount);
    daily[day].count += 1;
  }
  return Object.entries(daily)
    .map(([date, data]) => ({
      date,
      amount: Math.round(data.amount * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Round 3: Financial Alerts ───────────────────────────────────────────────

export function generateAlerts(
  transactions: Transaction[],
  budgets: Budget[],
  overrides: Record<string, SpendingCategory>,
  recurring: RecurringTransaction[],
  anomalies: AnomalyTransaction[]
): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Budget exceeded alerts
  for (const b of budgets) {
    const spent = transactions
      .filter((t) => t.date.startsWith(thisMonth) && isSpending(t, overrides) && getEffectiveCategory(t, overrides) === b.category)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const percent = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
    if (percent > 100) {
      alerts.push({
        id: `budget-${b.category}-${thisMonth}`,
        type: "budget-exceeded",
        message: `${b.category} budget exceeded: ${formatCurrency(spent)} of ${formatCurrency(b.monthlyLimit)} (${Math.round(percent)}%)`,
        date: now.toISOString().slice(0, 10),
      });
    }
  }

  // Large transaction alerts (anomalies)
  for (const a of anomalies.slice(0, 5)) {
    alerts.push({
      id: `anomaly-${a.transaction.id}`,
      type: "large-transaction",
      message: a.reason,
      date: a.transaction.date,
    });
  }

  // Upcoming bill alerts
  const upcomingBills = getUpcomingBills(recurring);
  for (const bill of upcomingBills.filter((b) => {
    const daysUntil = Math.ceil((new Date(b.expectedDate).getTime() - now.getTime()) / 86400000);
    return daysUntil <= 7;
  })) {
    alerts.push({
      id: `bill-${bill.description}-${bill.expectedDate}`,
      type: "bill-due",
      message: `${bill.description} due on ${formatDate(bill.expectedDate)}: ${formatCurrency(bill.expectedAmount)}`,
      date: bill.expectedDate,
    });
  }

  return alerts;
}

// ─── Round 3: FIRE Calculator ────────────────────────────────────────────────

export function calculateFIRE(params: {
  currentSavings: number;
  annualIncome: number;
  annualExpenses: number;
  investmentReturn: number; // annual % (e.g. 7)
  withdrawalRate: number; // % (e.g. 4)
  targetAge?: number;
  currentAge: number;
}): {
  fireNumber: number;
  yearsToFIRE: number;
  fireAge: number;
  projections: Array<{ year: number; age: number; savings: number }>;
} {
  const { currentSavings, annualIncome, annualExpenses, investmentReturn, withdrawalRate, currentAge } = params;
  const fireNumber = annualExpenses / (withdrawalRate / 100);
  const annualSavings = annualIncome - annualExpenses;
  const r = investmentReturn / 100;

  const projections: Array<{ year: number; age: number; savings: number }> = [];
  let savings = currentSavings;
  let years = 0;

  while (savings < fireNumber && years < 60) {
    projections.push({
      year: new Date().getFullYear() + years,
      age: currentAge + years,
      savings: Math.round(savings),
    });
    savings = savings * (1 + r) + annualSavings;
    years++;
  }

  projections.push({
    year: new Date().getFullYear() + years,
    age: currentAge + years,
    savings: Math.round(savings),
  });

  return {
    fireNumber: Math.round(fireNumber),
    yearsToFIRE: years,
    fireAge: currentAge + years,
    projections,
  };
}

// ─── Round 3: Debt Payoff Calculator ─────────────────────────────────────────

export function calculateDebtPayoff(
  debts: Debt[],
  extraMonthly: number = 0
): Array<{
  name: string;
  balance: number;
  monthsToPayoff: number;
  totalInterest: number;
  totalPaid: number;
}> {
  return debts.map((debt) => {
    let balance = debt.balance;
    const monthlyRate = debt.interestRate / 100 / 12;
    const monthlyPayment = debt.minimumPayment + extraMonthly;
    let months = 0;
    let totalInterest = 0;

    while (balance > 0 && months < 600) {
      const interest = balance * monthlyRate;
      totalInterest += interest;
      balance = balance + interest - monthlyPayment;
      if (balance < 0) balance = 0;
      months++;
    }

    return {
      name: debt.name,
      balance: debt.balance,
      monthsToPayoff: months,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPaid: Math.round((debt.balance + totalInterest) * 100) / 100,
    };
  });
}

// ─── Round 3: What-if Scenario ───────────────────────────────────────────────

export function calculateWhatIf(
  recurring: RecurringTransaction[],
  removedDescriptions: string[]
): { monthlySaved: number; annualSaved: number; items: Array<{ description: string; monthly: number }> } {
  const removed = new Set(removedDescriptions.map((d) => d.toLowerCase()));
  const items: Array<{ description: string; monthly: number }> = [];

  for (const r of recurring) {
    if (removed.has(r.description.toLowerCase())) {
      let monthly = r.averageAmount;
      if (r.frequency === "weekly") monthly = r.averageAmount * 4.33;
      else if (r.frequency === "quarterly") monthly = r.averageAmount / 3;
      items.push({ description: r.description, monthly: Math.round(monthly * 100) / 100 });
    }
  }

  const monthlySaved = items.reduce((s, i) => s + i.monthly, 0);
  return {
    monthlySaved: Math.round(monthlySaved * 100) / 100,
    annualSaved: Math.round(monthlySaved * 12 * 100) / 100,
    items,
  };
}

// ─── Round 3: Find Duplicate Transactions ────────────────────────────────────

export function findDuplicateTransactions(
  transactions: Transaction[]
): Array<{ key: string; transactions: Transaction[] }> {
  const groups: Record<string, Transaction[]> = {};

  for (const tx of transactions) {
    const key = `${tx.date}|${tx.amount.toFixed(2)}|${tx.description.toLowerCase().trim()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  return Object.entries(groups)
    .filter(([, txs]) => txs.length > 1)
    .map(([key, txs]) => ({ key, transactions: txs }));
}
