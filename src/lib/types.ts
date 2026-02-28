export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  category: SpendingCategory;
  source: "barclays";
}

export type SpendingCategory =
  | "groceries"
  | "eating-out"
  | "transport"
  | "bills"
  | "shopping"
  | "entertainment"
  | "health"
  | "transfers"
  | "income"
  | "cash"
  | "subscriptions"
  | "other";

export const CATEGORY_LABELS: Record<SpendingCategory, string> = {
  groceries: "Groceries",
  "eating-out": "Eating Out",
  transport: "Transport",
  bills: "Bills & Utilities",
  shopping: "Shopping",
  entertainment: "Entertainment",
  health: "Health & Fitness",
  transfers: "Transfers",
  income: "Income",
  cash: "Cash",
  subscriptions: "Subscriptions",
  other: "Other",
};

export const CATEGORY_COLORS: Record<SpendingCategory, string> = {
  groceries: "#22c55e",
  "eating-out": "#f97316",
  transport: "#3b82f6",
  bills: "#ef4444",
  shopping: "#a855f7",
  entertainment: "#ec4899",
  health: "#14b8a6",
  transfers: "#6b7280",
  income: "#10b981",
  cash: "#eab308",
  subscriptions: "#8b5cf6",
  other: "#9ca3af",
};

export const ALL_CATEGORIES: SpendingCategory[] = [
  "groceries",
  "eating-out",
  "transport",
  "bills",
  "shopping",
  "entertainment",
  "health",
  "transfers",
  "income",
  "cash",
  "subscriptions",
  "other",
];

export interface EtoroPosition {
  id: string;
  instrument: string;
  units: number;
  openRate: number;
  currentRate: number;
  profit: number;
  profitPercent: number;
  openDate: string;
  closeDate?: string;
  type: "buy" | "sell";
  status?: "open" | "closed";
}

export interface EtoroTransaction {
  id: string;
  date: string;
  type: string;
  detail: string;
  amount: number;
  realizedEquityChange: number;
  balance: number;
}

export interface RetirementFund {
  date: string;
  totalValue: number;
  contributions: number;
  employerContributions: number;
  growthAmount: number;
  fundName: string;
}

export interface NetWorthSnapshot {
  date: string;
  bankBalance: number;
  investmentValue: number;
  retirementValue: number;
  total: number;
}

export interface Budget {
  id: string;
  category: SpendingCategory;
  monthlyLimit: number;
}

export interface UserSettings {
  preferredCurrency: "GBP" | "USD";
  exchangeRateGBPtoUSD: number;
  exchangeRateUSDtoGBP: number;
}

export interface ParseResult<T> {
  data: T[];
  warnings: string[];
}

export interface RecurringTransaction {
  description: string;
  averageAmount: number;
  frequency: "weekly" | "monthly" | "quarterly";
  lastDate: string;
  count: number;
}
