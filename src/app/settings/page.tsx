"use client";

import { useState } from "react";
import { useFinanceStore } from "@/lib/store";
import { useToastStore } from "@/lib/toast";
import {
  CATEGORY_LABELS,
  ALL_CATEGORIES,
  SpendingCategory,
} from "@/lib/types";

export default function SettingsPage() {
  const { settings, updateSettings, budgets, addBudget, removeBudget } =
    useFinanceStore();
  const addToast = useToastStore((s) => s.addToast);

  const [newBudgetCategory, setNewBudgetCategory] =
    useState<SpendingCategory>("groceries");
  const [newBudgetAmount, setNewBudgetAmount] = useState("");

  const cur = settings?.preferredCurrency || "GBP";
  const gbpToUsd = settings?.exchangeRateGBPtoUSD ?? 1.27;
  const usdToGbp = settings?.exchangeRateUSDtoGBP ?? 0.79;

  const budgetedCategories = new Set(
    (budgets || []).map((b) => b.category)
  );
  const availableCategories = ALL_CATEGORIES.filter(
    (c) => !budgetedCategories.has(c) && c !== "income" && c !== "transfers"
  );

  const handleAddBudget = () => {
    const amount = parseFloat(newBudgetAmount);
    if (!amount || amount <= 0) {
      addToast("Enter a valid budget amount", "warning");
      return;
    }
    addBudget({
      id: `budget-${newBudgetCategory}-${Date.now()}`,
      category: newBudgetCategory,
      monthlyLimit: amount,
    });
    setNewBudgetAmount("");
    if (availableCategories.length > 1) {
      const next = availableCategories.find((c) => c !== newBudgetCategory);
      if (next) setNewBudgetCategory(next);
    }
    addToast(
      `Budget set for ${CATEGORY_LABELS[newBudgetCategory]}`,
      "success"
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Currency settings */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Currency</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[var(--muted)] block mb-2">
              Preferred Currency
            </label>
            <div className="flex gap-2">
              {(["GBP", "USD"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => updateSettings({ preferredCurrency: c })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    cur === c
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--card-border)] text-[var(--muted)] hover:text-white"
                  }`}
                >
                  {c === "GBP" ? "GBP (£)" : "USD ($)"}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">
              Dashboard will convert all values to your preferred currency.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[var(--muted)] block mb-1">
                1 GBP = ? USD
              </label>
              <input
                type="number"
                step="0.01"
                value={gbpToUsd}
                onChange={(e) =>
                  updateSettings({
                    exchangeRateGBPtoUSD: parseFloat(e.target.value) || 1.27,
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--muted)] block mb-1">
                1 USD = ? GBP
              </label>
              <input
                type="number"
                step="0.01"
                value={usdToGbp}
                onChange={(e) =>
                  updateSettings({
                    exchangeRateUSDtoGBP: parseFloat(e.target.value) || 0.79,
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Budget management */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Monthly Budgets
        </h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Set spending limits per category. Progress bars will appear on the
          Spending and Dashboard pages.
        </p>

        {/* Existing budgets */}
        {(budgets || []).length > 0 && (
          <div className="space-y-2 mb-4">
            {(budgets || []).map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--background)]"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{
                      background:
                        CATEGORY_LABELS[b.category]
                          ? `var(--accent)`
                          : "#6b7280",
                    }}
                  />
                  <span className="text-white text-sm">
                    {CATEGORY_LABELS[b.category]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--muted)]">
                    {cur === "GBP" ? "£" : "$"}
                    {b.monthlyLimit.toFixed(2)} / month
                  </span>
                  <button
                    onClick={() => {
                      removeBudget(b.id);
                      addToast(
                        `Removed ${CATEGORY_LABELS[b.category]} budget`,
                        "info"
                      );
                    }}
                    className="text-xs text-[var(--red)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new budget */}
        {availableCategories.length > 0 && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">
                Category
              </label>
              <select
                value={newBudgetCategory}
                onChange={(e) =>
                  setNewBudgetCategory(e.target.value as SpendingCategory)
                }
                className="w-48"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">
                Monthly Limit ({cur === "GBP" ? "£" : "$"})
              </label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="200"
                value={newBudgetAmount}
                onChange={(e) => setNewBudgetAmount(e.target.value)}
                className="w-32"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddBudget();
                }}
              />
            </div>
            <button onClick={handleAddBudget} className="btn-primary text-sm">
              Add Budget
            </button>
          </div>
        )}
      </div>

      {/* About */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-2">About</h2>
        <p className="text-sm text-[var(--muted)]">
          FinTracker is a local-first personal finance dashboard. All data is
          stored in your browser&apos;s localStorage and never sent to any
          server. Use the Upload page to backup and restore your data.
        </p>
      </div>
    </div>
  );
}
