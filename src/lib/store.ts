"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Transaction,
  EtoroPosition,
  EtoroTransaction,
  RetirementFund,
  Budget,
  UserSettings,
  SpendingCategory,
} from "./types";

interface FinanceStore {
  // Barclays
  transactions: Transaction[];
  addTransactions: (txs: Transaction[]) => void;
  clearTransactions: () => void;

  // eToro
  etoroPositions: EtoroPosition[];
  etoroTransactions: EtoroTransaction[];
  addEtoroPositions: (positions: EtoroPosition[]) => void;
  addEtoroTransactions: (txs: EtoroTransaction[]) => void;
  clearEtoro: () => void;

  // Standard Life
  retirementFunds: RetirementFund[];
  addRetirementFunds: (funds: RetirementFund[]) => void;
  clearRetirement: () => void;

  // Category overrides
  categoryOverrides: Record<string, SpendingCategory>;
  setTransactionCategory: (txId: string, category: SpendingCategory) => void;
  clearCategoryOverrides: () => void;

  // Budgets
  budgets: Budget[];
  addBudget: (budget: Budget) => void;
  removeBudget: (id: string) => void;
  updateBudget: (id: string, monthlyLimit: number) => void;

  // Settings
  settings: UserSettings;
  updateSettings: (settings: Partial<UserSettings>) => void;

  // All
  clearAll: () => void;

  // Backup
  exportData: () => string;
  importData: (json: string) => boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  preferredCurrency: "GBP",
  exchangeRateGBPtoUSD: 1.27,
  exchangeRateUSDtoGBP: 0.79,
};

export const useFinanceStore = create<FinanceStore>()(
  persist(
    (set, get) => ({
      transactions: [],
      addTransactions: (txs) =>
        set((state) => ({
          transactions: deduplicateById([...state.transactions, ...txs]),
        })),
      clearTransactions: () => set({ transactions: [], categoryOverrides: {} }),

      etoroPositions: [],
      etoroTransactions: [],
      addEtoroPositions: (positions) =>
        set((state) => ({
          etoroPositions: deduplicateById([...state.etoroPositions, ...positions]),
        })),
      addEtoroTransactions: (txs) =>
        set((state) => ({
          etoroTransactions: deduplicateById([...state.etoroTransactions, ...txs]),
        })),
      clearEtoro: () => set({ etoroPositions: [], etoroTransactions: [] }),

      retirementFunds: [],
      addRetirementFunds: (funds) =>
        set((state) => ({
          retirementFunds: [...state.retirementFunds, ...funds],
        })),
      clearRetirement: () => set({ retirementFunds: [] }),

      // Category overrides
      categoryOverrides: {},
      setTransactionCategory: (txId, category) =>
        set((state) => ({
          categoryOverrides: { ...state.categoryOverrides, [txId]: category },
        })),
      clearCategoryOverrides: () => set({ categoryOverrides: {} }),

      // Budgets
      budgets: [],
      addBudget: (budget) =>
        set((state) => ({
          budgets: [...state.budgets.filter((b) => b.category !== budget.category), budget],
        })),
      removeBudget: (id) =>
        set((state) => ({
          budgets: state.budgets.filter((b) => b.id !== id),
        })),
      updateBudget: (id, monthlyLimit) =>
        set((state) => ({
          budgets: state.budgets.map((b) =>
            b.id === id ? { ...b, monthlyLimit } : b
          ),
        })),

      // Settings
      settings: DEFAULT_SETTINGS,
      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),

      clearAll: () =>
        set({
          transactions: [],
          etoroPositions: [],
          etoroTransactions: [],
          retirementFunds: [],
          categoryOverrides: {},
          budgets: [],
          settings: DEFAULT_SETTINGS,
        }),

      // Backup / restore
      exportData: () => {
        const state = get();
        return JSON.stringify({
          transactions: state.transactions,
          etoroPositions: state.etoroPositions,
          etoroTransactions: state.etoroTransactions,
          retirementFunds: state.retirementFunds,
          categoryOverrides: state.categoryOverrides,
          budgets: state.budgets,
          settings: state.settings,
        });
      },
      importData: (json) => {
        try {
          const data = JSON.parse(json);
          set({
            transactions: data.transactions || [],
            etoroPositions: data.etoroPositions || [],
            etoroTransactions: data.etoroTransactions || [],
            retirementFunds: data.retirementFunds || [],
            categoryOverrides: data.categoryOverrides || {},
            budgets: data.budgets || [],
            settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    { name: "finance-tracker-storage" }
  )
);

function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
