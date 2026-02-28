"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Transaction, EtoroPosition, EtoroTransaction, RetirementFund,
  Budget, CategoryRule, SavingsGoal, UserSettings, SpendingCategory,
  Debt, DashboardWidget, DEFAULT_WIDGETS,
} from "./types";

interface FinanceStore {
  transactions: Transaction[];
  addTransactions: (txs: Transaction[]) => void;
  clearTransactions: () => void;
  etoroPositions: EtoroPosition[];
  etoroTransactions: EtoroTransaction[];
  addEtoroPositions: (positions: EtoroPosition[]) => void;
  addEtoroTransactions: (txs: EtoroTransaction[]) => void;
  clearEtoro: () => void;
  retirementFunds: RetirementFund[];
  addRetirementFunds: (funds: RetirementFund[]) => void;
  clearRetirement: () => void;
  categoryOverrides: Record<string, SpendingCategory>;
  setTransactionCategory: (txId: string, category: SpendingCategory) => void;
  bulkSetCategory: (txIds: string[], category: SpendingCategory) => void;
  clearCategoryOverrides: () => void;
  categoryRules: CategoryRule[];
  addCategoryRule: (rule: CategoryRule) => void;
  removeCategoryRule: (id: string) => void;
  budgets: Budget[];
  addBudget: (budget: Budget) => void;
  removeBudget: (id: string) => void;
  updateBudget: (id: string, monthlyLimit: number) => void;
  savingsGoals: SavingsGoal[];
  addSavingsGoal: (goal: SavingsGoal) => void;
  removeSavingsGoal: (id: string) => void;
  updateSavingsGoal: (id: string, updates: Partial<SavingsGoal>) => void;
  debts: Debt[];
  addDebt: (debt: Debt) => void;
  removeDebt: (id: string) => void;
  updateDebt: (id: string, updates: Partial<Debt>) => void;
  dashboardWidgets: DashboardWidget[];
  setDashboardWidgets: (widgets: DashboardWidget[]) => void;
  dismissedAlerts: string[];
  dismissAlert: (id: string) => void;
  clearDismissedAlerts: () => void;
  settings: UserSettings;
  updateSettings: (settings: Partial<UserSettings>) => void;
  removeTransactions: (ids: string[]) => void;
  mergeTransactions: (keepId: string, removeIds: string[]) => void;
  clearAll: () => void;
  exportData: () => string;
  importData: (json: string) => boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  preferredCurrency: "GBP",
  exchangeRateGBPtoUSD: 1.27,
  exchangeRateUSDtoGBP: 0.79,
  theme: "dark",
};

export const useFinanceStore = create<FinanceStore>()(
  persist(
    (set, get) => ({
      transactions: [],
      addTransactions: (txs) =>
        set((s) => ({ transactions: dedup([...s.transactions, ...txs]) })),
      clearTransactions: () => set({ transactions: [], categoryOverrides: {} }),
      etoroPositions: [],
      etoroTransactions: [],
      addEtoroPositions: (p) =>
        set((s) => ({ etoroPositions: dedup([...s.etoroPositions, ...p]) })),
      addEtoroTransactions: (txs) =>
        set((s) => ({ etoroTransactions: dedup([...s.etoroTransactions, ...txs]) })),
      clearEtoro: () => set({ etoroPositions: [], etoroTransactions: [] }),
      retirementFunds: [],
      addRetirementFunds: (funds) =>
        set((s) => ({ retirementFunds: [...s.retirementFunds, ...funds] })),
      clearRetirement: () => set({ retirementFunds: [] }),
      categoryOverrides: {},
      setTransactionCategory: (txId, cat) =>
        set((s) => ({ categoryOverrides: { ...s.categoryOverrides, [txId]: cat } })),
      bulkSetCategory: (txIds, cat) =>
        set((s) => {
          const overrides = { ...s.categoryOverrides };
          for (const id of txIds) overrides[id] = cat;
          return { categoryOverrides: overrides };
        }),
      clearCategoryOverrides: () => set({ categoryOverrides: {} }),
      categoryRules: [],
      addCategoryRule: (rule) =>
        set((s) => ({ categoryRules: [...s.categoryRules, rule] })),
      removeCategoryRule: (id) =>
        set((s) => ({ categoryRules: s.categoryRules.filter((r) => r.id !== id) })),
      budgets: [],
      addBudget: (budget) =>
        set((s) => ({ budgets: [...s.budgets.filter((b) => b.category !== budget.category), budget] })),
      removeBudget: (id) =>
        set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) })),
      updateBudget: (id, limit) =>
        set((s) => ({ budgets: s.budgets.map((b) => (b.id === id ? { ...b, monthlyLimit: limit } : b)) })),
      savingsGoals: [],
      addSavingsGoal: (goal) =>
        set((s) => ({ savingsGoals: [...s.savingsGoals, goal] })),
      removeSavingsGoal: (id) =>
        set((s) => ({ savingsGoals: s.savingsGoals.filter((g) => g.id !== id) })),
      updateSavingsGoal: (id, updates) =>
        set((s) => ({ savingsGoals: s.savingsGoals.map((g) => (g.id === id ? { ...g, ...updates } : g)) })),
      debts: [],
      addDebt: (debt) =>
        set((s) => ({ debts: [...s.debts, debt] })),
      removeDebt: (id) =>
        set((s) => ({ debts: s.debts.filter((d) => d.id !== id) })),
      updateDebt: (id, updates) =>
        set((s) => ({ debts: s.debts.map((d) => (d.id === id ? { ...d, ...updates } : d)) })),
      dashboardWidgets: DEFAULT_WIDGETS,
      setDashboardWidgets: (widgets) => set({ dashboardWidgets: widgets }),
      dismissedAlerts: [],
      dismissAlert: (id) =>
        set((s) => ({ dismissedAlerts: [...s.dismissedAlerts, id] })),
      clearDismissedAlerts: () => set({ dismissedAlerts: [] }),
      settings: DEFAULT_SETTINGS,
      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),
      removeTransactions: (ids) =>
        set((s) => {
          const idSet = new Set(ids);
          return { transactions: s.transactions.filter((t) => !idSet.has(t.id)) };
        }),
      mergeTransactions: (keepId, removeIds) =>
        set((s) => {
          const idSet = new Set(removeIds);
          return { transactions: s.transactions.filter((t) => !idSet.has(t.id) || t.id === keepId) };
        }),
      clearAll: () =>
        set({
          transactions: [], etoroPositions: [], etoroTransactions: [],
          retirementFunds: [], categoryOverrides: {}, categoryRules: [],
          budgets: [], savingsGoals: [], debts: [],
          dashboardWidgets: DEFAULT_WIDGETS, dismissedAlerts: [],
          settings: DEFAULT_SETTINGS,
        }),
      exportData: () => {
        const s = get();
        return JSON.stringify({
          transactions: s.transactions, etoroPositions: s.etoroPositions,
          etoroTransactions: s.etoroTransactions, retirementFunds: s.retirementFunds,
          categoryOverrides: s.categoryOverrides, categoryRules: s.categoryRules,
          budgets: s.budgets, savingsGoals: s.savingsGoals, debts: s.debts,
          dashboardWidgets: s.dashboardWidgets, settings: s.settings,
        });
      },
      importData: (json) => {
        try {
          const d = JSON.parse(json);
          set({
            transactions: d.transactions || [], etoroPositions: d.etoroPositions || [],
            etoroTransactions: d.etoroTransactions || [], retirementFunds: d.retirementFunds || [],
            categoryOverrides: d.categoryOverrides || {}, categoryRules: d.categoryRules || [],
            budgets: d.budgets || [], savingsGoals: d.savingsGoals || [],
            debts: d.debts || [], dashboardWidgets: d.dashboardWidgets || DEFAULT_WIDGETS,
            settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
          });
          return true;
        } catch { return false; }
      },
    }),
    { name: "finance-tracker-storage" }
  )
);

function dedup<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
