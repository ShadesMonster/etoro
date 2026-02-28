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
