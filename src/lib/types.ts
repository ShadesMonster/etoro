export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  category: SpendingCategory;
  source: "barclays" | "monzo" | "revolut" | "starling" | "generic";
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
  "groceries", "eating-out", "transport", "bills", "shopping",
  "entertainment", "health", "transfers", "income", "cash",
  "subscriptions", "other",
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
  positionId?: string;
  amount?: number;
  leverage?: number;
  spreadFees?: number;
  marketSpread?: number;
  profitGBP?: number;
  fxRateOpen?: number;
  fxRateClose?: number;
  takeProfitRate?: number;
  stopLossRate?: number;
  overnightFees?: number;
  isin?: string;
  longShort?: "long" | "short";
}

export interface EtoroTransaction {
  id: string;
  date: string;
  type: string;
  detail: string;
  amount: number;
  realizedEquityChange: number;
  balance: number;
  positionId?: string;
  assetType?: string;
}

export interface EtoroDividend {
  id: string;
  date: string;
  instrument: string;
  netDividendUSD: number;
  netDividendGBP: number;
  withholdingTaxRate: number;
  withholdingTaxUSD: number;
  withholdingTaxGBP: number;
  positionId?: string;
  type?: string;
  isin?: string;
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

export interface CategoryRule {
  id: string;
  pattern: string;
  category: SpendingCategory;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
}

export interface UserSettings {
  preferredCurrency: "GBP" | "USD";
  exchangeRateGBPtoUSD: number;
  exchangeRateUSDtoGBP: number;
  theme: "dark" | "light";
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
  expectedDay?: number;
}

export interface SpendingForecast {
  spentSoFar: number;
  projectedRemaining: number;
  projectedTotal: number;
  avgDailySpending: number;
  daysRemaining: number;
  daysElapsed: number;
}

export interface CategoryTrend {
  category: SpendingCategory;
  thisMonth: number;
  lastMonth: number;
  change: number;
  changePercent: number;
}

export interface UpcomingBill {
  description: string;
  expectedDate: string;
  expectedAmount: number;
  frequency: string;
}

// ─── Round 3 types ───────────────────────────────────────────────────────────

export interface Debt {
  id: string;
  name: string;
  type: "credit-card" | "loan" | "mortgage" | "other";
  balance: number;
  interestRate: number;
  minimumPayment: number;
  dueDate?: string;
}

export type DashboardWidget =
  | "net-worth"
  | "net-worth-chart"
  | "spending-breakdown"
  | "this-month"
  | "budget-status"
  | "savings-rate"
  | "alerts"
  | "upcoming-bills"
  | "merchant-insights"
  | "heatmap";

export const ALL_WIDGETS: { id: DashboardWidget; label: string }[] = [
  { id: "net-worth", label: "Net Worth Cards" },
  { id: "net-worth-chart", label: "Net Worth Chart" },
  { id: "spending-breakdown", label: "Spending Breakdown" },
  { id: "this-month", label: "This Month Summary" },
  { id: "budget-status", label: "Budget Status" },
  { id: "savings-rate", label: "Savings Rate" },
  { id: "alerts", label: "Alerts & Notifications" },
  { id: "upcoming-bills", label: "Upcoming Bills" },
  { id: "merchant-insights", label: "Top Merchants" },
  { id: "heatmap", label: "Spending Heatmap" },
];

export const DEFAULT_WIDGETS: DashboardWidget[] = [
  "net-worth", "net-worth-chart", "spending-breakdown",
  "this-month", "budget-status", "savings-rate",
  "alerts", "upcoming-bills", "merchant-insights", "heatmap",
];

export interface MerchantInsight {
  merchant: string;
  totalSpent: number;
  transactionCount: number;
  avgAmount: number;
  lastDate: string;
  category: SpendingCategory;
}

export interface AnomalyTransaction {
  transaction: Transaction;
  reason: string;
  severity: "warning" | "alert";
  averageForCategory: number;
}

export interface FinancialAlert {
  id: string;
  type: "budget-exceeded" | "large-transaction" | "bill-due" | "goal-reached";
  message: string;
  date: string;
}

export interface BankSyncAccount {
  uid: string;
  iban?: string;
  name?: string;
}

export interface BankSyncSession {
  sessionId: string;
  bankName: string;
  bankCountry: string;
  accounts: BankSyncAccount[];
  connectedAt: string;
  lastSyncAt?: string;
  validUntil?: string;
}
