import { Transaction, SpendingCategory, RecurringTransaction } from "./types";

export function formatCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function groupByMonth(
  items: Array<{ date: string; amount?: number; totalValue?: number }>
): Record<string, typeof items> {
  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const key = item.date.slice(0, 7); // YYYY-MM
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function getEffectiveCategory(
  tx: Transaction,
  overrides: Record<string, SpendingCategory>
): SpendingCategory {
  return overrides[tx.id] || tx.category;
}

export function convertCurrency(
  amount: number,
  from: "GBP" | "USD",
  to: "GBP" | "USD",
  rates: { exchangeRateGBPtoUSD: number; exchangeRateUSDtoGBP: number }
): number {
  if (from === to) return amount;
  if (from === "GBP" && to === "USD") return amount * rates.exchangeRateGBPtoUSD;
  return amount * rates.exchangeRateUSDtoGBP;
}

export function detectRecurringTransactions(
  transactions: Transaction[]
): RecurringTransaction[] {
  const spending = transactions.filter((t) => t.amount < 0);

  // Normalize and group by description
  const groups: Record<string, Transaction[]> = {};
  for (const tx of spending) {
    const key = tx.description
      .toLowerCase()
      .trim()
      .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, "")
      .replace(/ref:?\s*\w+/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const recurring: RecurringTransaction[] = [];

  for (const [, txs] of Object.entries(groups)) {
    if (txs.length < 2) continue;

    const sorted = [...txs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let totalDays = 0;
    for (let i = 1; i < sorted.length; i++) {
      const diff =
        new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime();
      totalDays += diff / (1000 * 60 * 60 * 24);
    }
    const avgDays = totalDays / (sorted.length - 1);

    let frequency: "weekly" | "monthly" | "quarterly" | null = null;
    if (avgDays >= 5 && avgDays <= 10) frequency = "weekly";
    else if (avgDays >= 20 && avgDays <= 40) frequency = "monthly";
    else if (avgDays >= 75 && avgDays <= 105) frequency = "quarterly";

    if (!frequency) continue;

    const avgAmount =
      txs.reduce((s, t) => s + Math.abs(t.amount), 0) / txs.length;

    recurring.push({
      description: txs[0].description,
      averageAmount: Math.round(avgAmount * 100) / 100,
      frequency,
      lastDate: sorted[sorted.length - 1].date,
      count: txs.length,
    });
  }

  return recurring.sort((a, b) => b.averageAmount - a.averageAmount);
}

export function exportTransactionsCSV(transactions: Transaction[]): string {
  const header = "Date,Description,Amount,Category,Balance";
  const rows = transactions.map(
    (t) =>
      `${t.date},"${t.description.replace(/"/g, '""')}",${t.amount},${t.category},${t.balance ?? ""}`
  );
  return [header, ...rows].join("\n");
}

export function exportEtoroCSV(
  positions: Array<{
    instrument: string;
    units: number;
    openRate: number;
    currentRate: number;
    profit: number;
    profitPercent: number;
    openDate: string;
    type: string;
    status?: string;
  }>
): string {
  const header =
    "Instrument,Type,Status,Units,Open Rate,Close Rate,Profit,Profit %,Open Date";
  const rows = positions.map(
    (p) =>
      `"${p.instrument}",${p.type},${p.status || "closed"},${p.units},${p.openRate},${p.currentRate},${p.profit},${p.profitPercent.toFixed(2)},${p.openDate}`
  );
  return [header, ...rows].join("\n");
}
