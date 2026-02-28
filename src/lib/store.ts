"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Transaction, EtoroPosition, EtoroTransaction, RetirementFund,
  Budget, CategoryRule, SavingsGoal, UserSettings, SpendingCategory,
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
  settings: UserSettings;
  updateSettings: (settings: Partial<UserSettings>) => void;
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
      settings: DEFAULT_SETTINGS,
      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),
      clearAll: () =>
        set({
          transactions: [], etoroPositions: [], etoroTransactions: [],
          retirementFunds: [], categoryOverrides: {}, categoryRules: [],
          budgets: [], savingsGoals: [], settings: DEFAULT_SETTINGS,
        }),
      exportData: () => {
        const s = get();
        return JSON.stringify({
          transactions: s.transactions, etoroPositions: s.etoroPositions,
          etoroTransactions: s.etoroTransactions, retirementFunds: s.retirementFunds,
          categoryOverrides: s.categoryOverrides, categoryRules: s.categoryRules,
          budgets: s.budgets, savingsGoals: s.savingsGoals, settings: s.settings,
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
