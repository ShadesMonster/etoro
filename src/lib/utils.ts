import {
  Transaction, SpendingCategory, RecurringTransaction,
  SpendingForecast, CategoryTrend, UpcomingBill,
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
  const spending = transactions.filter((t) => t.amount < 0);
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
    .filter((t) => t.date.startsWith(thisMonth) && t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  let totalSpending = 0;
  let totalDays = 0;
  for (let i = 1; i <= 3; i++) {
    const d = new Date(year, month - i, 1);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const mDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const mSpend = transactions
      .filter((t) => t.date.startsWith(mKey) && t.amount < 0)
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
  const header = "Date,Description,Amount,Category,Balance";
  const rows = transactions.map(
    (t) => `${t.date},"${t.description.replace(/"/g, '""')}",${t.amount},${t.category},${t.balance ?? ""}`
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
