"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import {
  Transaction, EtoroPosition, EtoroTransaction, EtoroDividend, RetirementFund,
  Budget, CategoryRule, SavingsGoal, UserSettings, SpendingCategory,
  Debt, DashboardWidget, DEFAULT_WIDGETS,
} from "./types";

// ─── IndexedDB Storage Adapter ──────────────────────────────────────────────
const DB_NAME = "finance-tracker-db";
const STORE_NAME = "keyval";
const STORAGE_KEY = "finance-tracker-storage";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
  });
}

const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // Try IndexedDB first
    try {
      const db = await openDB();
      const result = await new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
      if (result !== null) return result;
    } catch {
      // IndexedDB not available, fall through
    }

    // Migrate from localStorage if data exists there
    try {
      const localData = localStorage.getItem(name);
      if (localData) {
        // Migrate to IndexedDB and clear localStorage
        try {
          const db = await openDB();
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(localData, name);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
          });
          localStorage.removeItem(name);
        } catch {
          // If migration fails, still return the data
        }
        return localData;
      }
    } catch {
      // localStorage not available
    }

    return null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(value, name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      // Clean up localStorage if it had old data
      try { localStorage.removeItem(name); } catch {}
    } catch {
      // Fallback to localStorage if IndexedDB fails
      localStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch {}
    try { localStorage.removeItem(name); } catch {}
  },
};

// ─── Store Interface ────────────────────────────────────────────────────────

interface FinanceStore {
  transactions: Transaction[];
  addTransactions: (txs: Transaction[]) => void;
  clearTransactions: () => void;
  etoroPositions: EtoroPosition[];
  etoroTransactions: EtoroTransaction[];
  etoroDividends: EtoroDividend[];
  addEtoroPositions: (positions: EtoroPosition[]) => void;
  addEtoroTransactions: (txs: EtoroTransaction[]) => void;
  addEtoroDividends: (dividends: EtoroDividend[]) => void;
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
  // Instrument name → ticker symbol mappings (for live price lookups)
  tickerMappings: Record<string, string>;
  setTickerMapping: (instrument: string, ticker: string) => void;
  setTickerMappings: (mappings: Record<string, string>) => void;
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
      etoroDividends: [],
      addEtoroPositions: (p) =>
        set((s) => ({ etoroPositions: dedup([...s.etoroPositions, ...p]) })),
      addEtoroTransactions: (txs) =>
        set((s) => ({ etoroTransactions: dedup([...s.etoroTransactions, ...txs]) })),
      addEtoroDividends: (divs) =>
        set((s) => ({ etoroDividends: dedup([...s.etoroDividends, ...divs]) })),
      clearEtoro: () => set({ etoroPositions: [], etoroTransactions: [], etoroDividends: [] }),
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
      tickerMappings: {},
      setTickerMapping: (instrument, ticker) =>
        set((s) => ({ tickerMappings: { ...s.tickerMappings, [instrument]: ticker } })),
      setTickerMappings: (mappings) =>
        set((s) => ({ tickerMappings: { ...s.tickerMappings, ...mappings } })),
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
          etoroDividends: [], retirementFunds: [], categoryOverrides: {},
          categoryRules: [], budgets: [], savingsGoals: [], debts: [],
          dashboardWidgets: DEFAULT_WIDGETS, dismissedAlerts: [],
          tickerMappings: {}, settings: DEFAULT_SETTINGS,
        }),
      exportData: () => {
        const s = get();
        return JSON.stringify({
          transactions: s.transactions, etoroPositions: s.etoroPositions,
          etoroTransactions: s.etoroTransactions, etoroDividends: s.etoroDividends,
          retirementFunds: s.retirementFunds,
          categoryOverrides: s.categoryOverrides, categoryRules: s.categoryRules,
          budgets: s.budgets, savingsGoals: s.savingsGoals, debts: s.debts,
          dashboardWidgets: s.dashboardWidgets, tickerMappings: s.tickerMappings,
          settings: s.settings,
        });
      },
      importData: (json) => {
        try {
          const d = JSON.parse(json);
          set({
            transactions: d.transactions || [], etoroPositions: d.etoroPositions || [],
            etoroTransactions: d.etoroTransactions || [],
            etoroDividends: d.etoroDividends || [],
            retirementFunds: d.retirementFunds || [],
            categoryOverrides: d.categoryOverrides || {}, categoryRules: d.categoryRules || [],
            budgets: d.budgets || [], savingsGoals: d.savingsGoals || [],
            debts: d.debts || [], dashboardWidgets: d.dashboardWidgets || DEFAULT_WIDGETS,
            tickerMappings: d.tickerMappings || {},
            settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
          });
          return true;
        } catch { return false; }
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => indexedDBStorage),
    }
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
