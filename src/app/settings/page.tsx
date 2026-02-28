"use client";

import { useState } from "react";
import { useFinanceStore } from "@/lib/store";
import { useToastStore } from "@/lib/toast";
import {
  CATEGORY_LABELS,
  ALL_CATEGORIES,
  SpendingCategory,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function SettingsPage() {
  const {
    settings,
    updateSettings,
    budgets,
    addBudget,
    removeBudget,
    categoryRules,
    addCategoryRule,
    removeCategoryRule,
    savingsGoals,
    addSavingsGoal,
    removeSavingsGoal,
    updateSavingsGoal,
  } = useFinanceStore();
  const addToast = useToastStore((s) => s.addToast);

  const [newBudgetCategory, setNewBudgetCategory] =
    useState<SpendingCategory>("groceries");
  const [newBudgetAmount, setNewBudgetAmount] = useState("");

  // Category rule form
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleCategory, setNewRuleCategory] =
    useState<SpendingCategory>("groceries");

  // Savings goal form
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [newGoalDate, setNewGoalDate] = useState("");

  const cur = settings?.preferredCurrency || "GBP";
  const gbpToUsd = settings?.exchangeRateGBPtoUSD ?? 1.27;
  const usdToGbp = settings?.exchangeRateUSDtoGBP ?? 0.79;
  const theme = settings?.theme || "dark";

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

  const handleAddRule = () => {
    if (!newRulePattern.trim()) {
      addToast("Enter a keyword pattern", "warning");
      return;
    }
    addCategoryRule({
      id: `rule-${Date.now()}`,
      pattern: newRulePattern.trim(),
      category: newRuleCategory,
    });
    setNewRulePattern("");
    addToast(
      `Rule added: "${newRulePattern.trim()}" → ${CATEGORY_LABELS[newRuleCategory]}`,
      "success"
    );
  };

  const handleAddGoal = () => {
    const target = parseFloat(newGoalTarget);
    if (!newGoalName.trim()) {
      addToast("Enter a goal name", "warning");
      return;
    }
    if (!target || target <= 0) {
      addToast("Enter a valid target amount", "warning");
      return;
    }
    addSavingsGoal({
      id: `goal-${Date.now()}`,
      name: newGoalName.trim(),
      targetAmount: target,
      currentAmount: 0,
      targetDate: newGoalDate || undefined,
    });
    setNewGoalName("");
    setNewGoalTarget("");
    setNewGoalDate("");
    addToast(`Savings goal "${newGoalName.trim()}" created`, "success");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Theme */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Appearance</h2>
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => updateSettings({ theme: t })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                theme === t
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--card-border)] text-[var(--muted)] hover:text-white"
              }`}
            >
              {t === "dark" ? "\uD83C\uDF19 Dark" : "\u2600\uFE0F Light"}
            </button>
          ))}
        </div>
      </div>

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
                  {c === "GBP" ? "GBP (\u00A3)" : "USD ($)"}
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
                    style={{ background: "var(--accent)" }}
                  />
                  <span className="text-white text-sm">
                    {CATEGORY_LABELS[b.category]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--muted)]">
                    {cur === "GBP" ? "\u00A3" : "$"}
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
                Monthly Limit ({cur === "GBP" ? "\u00A3" : "$"})
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

      {/* Category Rules */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Category Rules
        </h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Auto-categorise transactions by keyword. Rules are checked before
          built-in patterns and apply to newly imported data.
        </p>

        {(categoryRules || []).length > 0 && (
          <div className="space-y-2 mb-4">
            {(categoryRules || []).map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--background)]"
              >
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-white font-mono">
                    &quot;{rule.pattern}&quot;
                  </span>
                  <span className="text-[var(--muted)]">&rarr;</span>
                  <span className="text-[var(--accent)]">
                    {CATEGORY_LABELS[rule.category]}
                  </span>
                </div>
                <button
                  onClick={() => {
                    removeCategoryRule(rule.id);
                    addToast("Rule removed", "info");
                  }}
                  className="text-xs text-[var(--red)] hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">
              Keyword
            </label>
            <input
              type="text"
              placeholder="e.g. spotify"
              value={newRulePattern}
              onChange={(e) => setNewRulePattern(e.target.value)}
              className="w-48"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddRule();
              }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">
              Category
            </label>
            <select
              value={newRuleCategory}
              onChange={(e) =>
                setNewRuleCategory(e.target.value as SpendingCategory)
              }
              className="w-48"
            >
              {ALL_CATEGORIES.filter(
                (c) => c !== "income" && c !== "transfers"
              ).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleAddRule} className="btn-primary text-sm">
            Add Rule
          </button>
        </div>
      </div>

      {/* Savings Goals */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Savings Goals
        </h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Track progress towards your savings targets.
        </p>

        {(savingsGoals || []).length > 0 && (
          <div className="space-y-4 mb-6">
            {(savingsGoals || []).map((goal) => {
              const percent =
                goal.targetAmount > 0
                  ? (goal.currentAmount / goal.targetAmount) * 100
                  : 0;
              return (
                <div
                  key={goal.id}
                  className="p-4 rounded-lg bg-[var(--background)]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-white font-medium">
                        {goal.name}
                      </span>
                      {goal.targetDate && (
                        <span className="text-xs text-[var(--muted)] ml-2">
                          Target: {goal.targetDate}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        removeSavingsGoal(goal.id);
                        addToast(`Removed goal "${goal.name}"`, "info");
                      }}
                      className="text-xs text-[var(--red)] hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-[var(--muted)]">
                      {formatCurrency(goal.currentAmount)} /{" "}
                      {formatCurrency(goal.targetAmount)}
                    </span>
                    <span
                      className={
                        percent >= 100
                          ? "positive"
                          : percent >= 75
                          ? "text-[var(--yellow)]"
                          : "text-white"
                      }
                    >
                      {Math.round(percent)}%
                    </span>
                  </div>
                  <div className="budget-bar">
                    <div
                      className="budget-bar-fill"
                      style={{
                        width: `${Math.min(percent, 100)}%`,
                        background:
                          percent >= 100
                            ? "#22c55e"
                            : percent >= 75
                            ? "#eab308"
                            : "var(--accent)",
                      }}
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="Add amount"
                      className="w-32 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = parseFloat(
                            (e.target as HTMLInputElement).value
                          );
                          if (val > 0) {
                            updateSavingsGoal(goal.id, {
                              currentAmount: goal.currentAmount + val,
                            });
                            (e.target as HTMLInputElement).value = "";
                            addToast(
                              `Added ${formatCurrency(val)} to "${goal.name}"`,
                              "success"
                            );
                          }
                        }
                      }}
                    />
                    <span className="text-xs text-[var(--muted)] self-center">
                      Press Enter to add
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">
              Goal Name
            </label>
            <input
              type="text"
              placeholder="e.g. Holiday Fund"
              value={newGoalName}
              onChange={(e) => setNewGoalName(e.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">
              Target ({cur === "GBP" ? "\u00A3" : "$"})
            </label>
            <input
              type="number"
              step="1"
              min="0"
              placeholder="5000"
              value={newGoalTarget}
              onChange={(e) => setNewGoalTarget(e.target.value)}
              className="w-32"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">
              Target Date (optional)
            </label>
            <input
              type="date"
              value={newGoalDate}
              onChange={(e) => setNewGoalDate(e.target.value)}
            />
          </div>
          <button onClick={handleAddGoal} className="btn-primary text-sm">
            Add Goal
          </button>
        </div>
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
