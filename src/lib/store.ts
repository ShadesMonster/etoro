"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Transaction,
  EtoroPosition,
  EtoroTransaction,
  RetirementFund,
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

  // All
  clearAll: () => void;
}

export const useFinanceStore = create<FinanceStore>()(
  persist(
    (set) => ({
      transactions: [],
      addTransactions: (txs) =>
        set((state) => ({
          transactions: deduplicateById([...state.transactions, ...txs]),
        })),
      clearTransactions: () => set({ transactions: [] }),

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

      clearAll: () =>
        set({
          transactions: [],
          etoroPositions: [],
          etoroTransactions: [],
          retirementFunds: [],
        }),
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
