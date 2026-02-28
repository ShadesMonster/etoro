"use client";

import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useFinanceStore } from "@/lib/store";
import { useToastStore } from "@/lib/toast";
import {
  formatCurrency,
  calculateFIRE,
  calculateDebtPayoff,
  calculateWhatIf,
  detectRecurringTransactions,
} from "@/lib/utils";
import StatCard from "@/components/StatCard";

export default function PlanningPage() {
  const {
    transactions, debts, addDebt, removeDebt,
  } = useFinanceStore();
  const addToast = useToastStore((s) => s.addToast);

  // ─── FIRE calculator state ──────────────────────────────────────────────
  const [fireAge, setFireAge] = useState("30");
  const [fireSavings, setFireSavings] = useState("50000");
  const [fireIncome, setFireIncome] = useState("50000");
  const [fireExpenses, setFireExpenses] = useState("30000");
  const [fireReturn, setFireReturn] = useState("7");
  const [fireWithdrawal, setFireWithdrawal] = useState("4");

  const fireResult = useMemo(() => {
    return calculateFIRE({
      currentAge: parseInt(fireAge) || 30,
      currentSavings: parseFloat(fireSavings) || 0,
      annualIncome: parseFloat(fireIncome) || 0,
      annualExpenses: parseFloat(fireExpenses) || 0,
      investmentReturn: parseFloat(fireReturn) || 7,
      withdrawalRate: parseFloat(fireWithdrawal) || 4,
    });
  }, [fireAge, fireSavings, fireIncome, fireExpenses, fireReturn, fireWithdrawal]);

  // ─── Debt tracker state ─────────────────────────────────────────────────
  const [debtName, setDebtName] = useState("");
  const [debtType, setDebtType] = useState<"credit-card" | "loan" | "mortgage" | "other">("credit-card");
  const [debtBalance, setDebtBalance] = useState("");
  const [debtRate, setDebtRate] = useState("");
  const [debtMinPayment, setDebtMinPayment] = useState("");
  const [extraPayment, setExtraPayment] = useState("0");

  const debtPayoff = useMemo(
    () => calculateDebtPayoff(debts || [], parseFloat(extraPayment) || 0),
    [debts, extraPayment]
  );
  const totalDebt = (debts || []).reduce((s, d) => s + d.balance, 0);

  const handleAddDebt = () => {
    const bal = parseFloat(debtBalance);
    const rate = parseFloat(debtRate);
    const min = parseFloat(debtMinPayment);
    if (!debtName.trim() || !bal || !rate || !min) {
      addToast("Fill in all debt fields", "warning");
      return;
    }
    addDebt({
      id: `debt-${Date.now()}`,
      name: debtName.trim(),
      type: debtType,
      balance: bal,
      interestRate: rate,
      minimumPayment: min,
    });
    setDebtName(""); setDebtBalance(""); setDebtRate(""); setDebtMinPayment("");
    addToast(`Added ${debtName.trim()}`, "success");
  };

  // ─── What-if scenarios ──────────────────────────────────────────────────
  const recurring = useMemo(() => detectRecurringTransactions(transactions), [transactions]);
  const [removedSubs, setRemovedSubs] = useState<Set<string>>(new Set());

  const whatIfResult = useMemo(
    () => calculateWhatIf(recurring, Array.from(removedSubs)),
    [recurring, removedSubs]
  );

  const toggleSub = (desc: string) => {
    setRemovedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(desc)) next.delete(desc);
      else next.add(desc);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Financial Planning</h1>

      {/* ─── FIRE Calculator ──────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          FIRE Calculator
        </h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Financial Independence, Retire Early &mdash; calculate when you could
          reach financial independence.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Current Age</label>
            <input type="number" value={fireAge} onChange={(e) => setFireAge(e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Current Savings</label>
            <input type="number" value={fireSavings} onChange={(e) => setFireSavings(e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Annual Income</label>
            <input type="number" value={fireIncome} onChange={(e) => setFireIncome(e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Annual Expenses</label>
            <input type="number" value={fireExpenses} onChange={(e) => setFireExpenses(e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Investment Return (%)</label>
            <input type="number" step="0.5" value={fireReturn} onChange={(e) => setFireReturn(e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Withdrawal Rate (%)</label>
            <input type="number" step="0.5" value={fireWithdrawal} onChange={(e) => setFireWithdrawal(e.target.value)} className="w-full" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="FIRE Number" value={formatCurrency(fireResult.fireNumber)} subtitle="Target nest egg" />
          <StatCard label="Years to FIRE" value={`${fireResult.yearsToFIRE}`} subtitle={`Retire at age ${fireResult.fireAge}`} />
          <StatCard
            label="Monthly Savings"
            value={formatCurrency((parseFloat(fireIncome) - parseFloat(fireExpenses)) / 12 || 0)}
            subtitle={`${((1 - (parseFloat(fireExpenses) || 0) / (parseFloat(fireIncome) || 1)) * 100).toFixed(0)}% savings rate`}
          />
        </div>

        {fireResult.projections.length > 1 && (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={fireResult.projections}>
              <XAxis dataKey="age" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#1e1e2e", border: "1px solid #2e2e3e", borderRadius: 8, color: "#e5e7eb" }}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <ReferenceLine y={fireResult.fireNumber} stroke="#ef4444" strokeDasharray="5 5" label="FIRE Target" />
              <Area type="monotone" dataKey="savings" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ─── Debt Tracker ─────────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Debt Tracker
        </h2>

        {(debts || []).length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <StatCard label="Total Debt" value={formatCurrency(totalDebt)} trend="down" />
              <StatCard
                label="Total Interest"
                value={formatCurrency(debtPayoff.reduce((s, d) => s + d.totalInterest, 0))}
              />
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Extra Monthly Payment</label>
                <input
                  type="number" min="0" step="50"
                  value={extraPayment}
                  onChange={(e) => setExtraPayment(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4 text-right">Balance</th>
                    <th className="pb-2 pr-4 text-right">APR</th>
                    <th className="pb-2 pr-4 text-right">Months</th>
                    <th className="pb-2 pr-4 text-right">Total Interest</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {debtPayoff.map((d, i) => (
                    <tr key={(debts || [])[i]?.id || i} className="border-b border-[var(--card-border)]/50">
                      <td className="py-2 pr-4 text-white">{d.name}</td>
                      <td className="py-2 pr-4 text-[var(--muted)]">{(debts || [])[i]?.type}</td>
                      <td className="py-2 pr-4 text-right negative">{formatCurrency(d.balance)}</td>
                      <td className="py-2 pr-4 text-right text-[var(--muted)]">{(debts || [])[i]?.interestRate}%</td>
                      <td className="py-2 pr-4 text-right text-white">{d.monthsToPayoff}</td>
                      <td className="py-2 pr-4 text-right negative">{formatCurrency(d.totalInterest)}</td>
                      <td className="py-2">
                        <button
                          onClick={() => { removeDebt((debts || [])[i]?.id); addToast("Debt removed", "info"); }}
                          className="text-xs text-[var(--red)] hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Add debt form */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Name</label>
            <input type="text" placeholder="e.g. Amex Card" value={debtName} onChange={(e) => setDebtName(e.target.value)} className="w-36" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Type</label>
            <select value={debtType} onChange={(e) => setDebtType(e.target.value as typeof debtType)} className="w-36">
              <option value="credit-card">Credit Card</option>
              <option value="loan">Loan</option>
              <option value="mortgage">Mortgage</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Balance</label>
            <input type="number" min="0" placeholder="5000" value={debtBalance} onChange={(e) => setDebtBalance(e.target.value)} className="w-28" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">APR %</label>
            <input type="number" min="0" step="0.1" placeholder="19.9" value={debtRate} onChange={(e) => setDebtRate(e.target.value)} className="w-24" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Min Payment</label>
            <input type="number" min="0" placeholder="150" value={debtMinPayment} onChange={(e) => setDebtMinPayment(e.target.value)} className="w-28" />
          </div>
          <button onClick={handleAddDebt} className="btn-primary text-sm">Add Debt</button>
        </div>
      </div>

      {/* ─── What-If Scenarios ────────────────────────────────────────────── */}
      {recurring.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            What-If Scenarios
          </h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            Select recurring payments to see how much you&apos;d save by cancelling them.
          </p>

          <div className="space-y-2 mb-4">
            {recurring.map((r, i) => {
              const isRemoved = removedSubs.has(r.description);
              let monthly = r.averageAmount;
              if (r.frequency === "weekly") monthly = r.averageAmount * 4.33;
              else if (r.frequency === "quarterly") monthly = r.averageAmount / 3;

              return (
                <button
                  key={i}
                  onClick={() => toggleSub(r.description)}
                  className={`w-full flex items-center justify-between py-2 px-3 rounded-lg text-left transition-colors ${
                    isRemoved
                      ? "bg-[var(--green)]/10 border border-[var(--green)]/30"
                      : "bg-[var(--background)] hover:bg-[var(--card-border)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                      isRemoved ? "bg-[var(--green)] border-[var(--green)] text-white" : "border-[var(--muted)]"
                    }`}>
                      {isRemoved ? "\u2713" : ""}
                    </span>
                    <div>
                      <p className={`text-sm ${isRemoved ? "line-through text-[var(--muted)]" : "text-white"}`}>
                        {r.description}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {r.frequency} &middot; ~{formatCurrency(monthly)}/mo
                      </p>
                    </div>
                  </div>
                  <span className="text-sm negative">-{formatCurrency(r.averageAmount)}/{r.frequency === "weekly" ? "wk" : r.frequency === "quarterly" ? "qtr" : "mo"}</span>
                </button>
              );
            })}
          </div>

          {removedSubs.size > 0 && (
            <div className="p-4 rounded-lg bg-[var(--green)]/10 border border-[var(--green)]/30">
              <p className="text-sm text-white mb-1">
                By cancelling {removedSubs.size} subscription{removedSubs.size > 1 ? "s" : ""} you&apos;d save:
              </p>
              <div className="flex gap-6">
                <div>
                  <p className="text-2xl font-bold positive">{formatCurrency(whatIfResult.monthlySaved)}</p>
                  <p className="text-xs text-[var(--muted)]">per month</p>
                </div>
                <div>
                  <p className="text-2xl font-bold positive">{formatCurrency(whatIfResult.annualSaved)}</p>
                  <p className="text-xs text-[var(--muted)]">per year</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
