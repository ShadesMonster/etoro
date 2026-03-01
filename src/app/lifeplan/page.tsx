"use client";

import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, ReferenceDot,
} from "recharts";
import { useFinanceStore } from "@/lib/store";
import { useToastStore } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils";
import {
  LifeEventCategory, LIFE_EVENT_ICONS, LIFE_EVENT_LABELS,
} from "@/lib/types";
import StatCard from "@/components/StatCard";

const PRESET_MILESTONES: Array<{
  name: string;
  category: LifeEventCategory;
  defaultAge: number;
  defaultCost: number;
}> = [
  { name: "Emergency Fund (6 months)", category: "other", defaultAge: 25, defaultCost: 10000 },
  { name: "First Home Deposit", category: "housing", defaultAge: 28, defaultCost: 30000 },
  { name: "Wedding", category: "family", defaultAge: 30, defaultCost: 20000 },
  { name: "First Child", category: "family", defaultAge: 31, defaultCost: 12000 },
  { name: "Career Break / Sabbatical", category: "lifestyle", defaultAge: 35, defaultCost: 15000 },
  { name: "Home Upgrade", category: "housing", defaultAge: 38, defaultCost: 50000 },
  { name: "Kids University Fund", category: "family", defaultAge: 45, defaultCost: 40000 },
  { name: "Early Retirement", category: "retirement", defaultAge: 55, defaultCost: 0 },
];

const CATEGORY_COLORS: Record<LifeEventCategory, string> = {
  housing: "#3b82f6",
  family: "#ec4899",
  career: "#f97316",
  lifestyle: "#8b5cf6",
  retirement: "#22c55e",
  other: "#6b7280",
};

export default function LifePlanPage() {
  const {
    lifePlanMilestones, lifePlanSettings,
    addLifePlanMilestone, removeLifePlanMilestone, updateLifePlanMilestone,
    updateLifePlanSettings,
  } = useFinanceStore();
  const addToast = useToastStore((s) => s.addToast);

  // ─── Add milestone form state ───────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<LifeEventCategory>("other");
  const [newAge, setNewAge] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // ─── Settings edit state ────────────────────────────────────────────────
  const [editSettings, setEditSettings] = useState(false);

  const settings = lifePlanSettings;
  const milestones = lifePlanMilestones || [];

  // ─── Projection calculation ─────────────────────────────────────────────
  const projection = useMemo(() => {
    const {
      currentAge, currentNetWorth, monthlySavings,
      expectedReturnRate, salaryGrowthRate, retirementAge,
    } = settings;

    const years = Math.max(retirementAge - currentAge + 10, 50);
    const monthlyReturn = expectedReturnRate / 100 / 12;
    const annualSalaryGrowth = salaryGrowthRate / 100;

    const data: Array<{
      age: number;
      year: number;
      netWorth: number;
      invested: number;
      milestone?: string;
      milestoneCost?: number;
      milestoneCategory?: LifeEventCategory;
    }> = [];

    let netWorth = currentNetWorth;
    let totalContributed = currentNetWorth;
    let currentMonthlySavings = monthlySavings;
    const sortedMilestones = [...milestones]
      .filter((m) => !m.achieved)
      .sort((a, b) => a.targetAge - b.targetAge);

    for (let y = 0; y <= years; y++) {
      const age = currentAge + y;
      const year = new Date().getFullYear() + y;

      // Check for milestones at this age
      const milestoneAtAge = sortedMilestones.filter((m) => m.targetAge === age);
      let milestoneName: string | undefined;
      let milestoneCost = 0;
      let milestoneCategory: LifeEventCategory | undefined;

      if (milestoneAtAge.length > 0) {
        milestoneName = milestoneAtAge.map((m) => m.name).join(", ");
        milestoneCost = milestoneAtAge.reduce((s, m) => s + m.estimatedCost, 0);
        milestoneCategory = milestoneAtAge[0].category;
      }

      data.push({
        age, year,
        netWorth: Math.round(netWorth),
        invested: Math.round(totalContributed),
        milestone: milestoneName,
        milestoneCost: milestoneCost > 0 ? milestoneCost : undefined,
        milestoneCategory,
      });

      // Apply milestone costs
      netWorth -= milestoneCost;

      // Monthly compounding for this year
      for (let m = 0; m < 12; m++) {
        netWorth = netWorth * (1 + monthlyReturn) + currentMonthlySavings;
        totalContributed += currentMonthlySavings;
      }

      // Annual salary growth
      if (age < retirementAge) {
        currentMonthlySavings *= (1 + annualSalaryGrowth);
      } else {
        currentMonthlySavings = 0; // Stopped working
      }
    }

    return data;
  }, [settings, milestones]);

  // ─── Key stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const targets = [50_000, 100_000, 250_000, 500_000, 1_000_000];
    const results: Array<{ target: number; age: number | null }> = [];

    for (const target of targets) {
      const point = projection.find((p) => p.netWorth >= target);
      results.push({ target, age: point ? point.age : null });
    }

    const peakNetWorth = Math.max(...projection.map((p) => p.netWorth));
    const retirementPoint = projection.find((p) => p.age === settings.retirementAge);

    return { targets: results, peakNetWorth, retirementPoint };
  }, [projection, settings.retirementAge]);

  // ─── Add milestone handler ──────────────────────────────────────────────
  const handleAddMilestone = () => {
    const age = parseInt(newAge);
    const cost = parseFloat(newCost) || 0;
    if (!newName.trim() || !age) {
      addToast("Name and target age are required", "warning");
      return;
    }
    if (age <= settings.currentAge) {
      addToast("Target age must be in the future", "warning");
      return;
    }
    addLifePlanMilestone({
      id: `lp-${Date.now()}`,
      name: newName.trim(),
      targetAge: age,
      estimatedCost: cost,
      category: newCategory,
      notes: newNotes.trim() || undefined,
    });
    setNewName(""); setNewAge(""); setNewCost(""); setNewNotes("");
    setShowAddForm(false);
    addToast(`Added "${newName.trim()}" to your life plan`, "success");
  };

  const handleAddPreset = (preset: typeof PRESET_MILESTONES[0]) => {
    const exists = milestones.some(
      (m) => m.name.toLowerCase() === preset.name.toLowerCase()
    );
    if (exists) {
      addToast("This milestone is already in your plan", "warning");
      return;
    }
    addLifePlanMilestone({
      id: `lp-${Date.now()}`,
      name: preset.name,
      targetAge: preset.defaultAge,
      estimatedCost: preset.defaultCost,
      category: preset.category,
    });
    addToast(`Added "${preset.name}" to your life plan`, "success");
  };

  const totalMilestoneCost = milestones
    .filter((m) => !m.achieved)
    .reduce((s, m) => s + m.estimatedCost, 0);

  const sortedMilestones = [...milestones].sort((a, b) => a.targetAge - b.targetAge);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Life Plan</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Map out your financial future &mdash; add milestones and see how your net worth grows over time.
          </p>
        </div>
      </div>

      {/* ─── Your Details ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Your Details</h2>
          <button
            onClick={() => setEditSettings(!editSettings)}
            className="btn-secondary text-sm"
          >
            {editSettings ? "Done" : "Edit"}
          </button>
        </div>

        {editSettings ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Current Age</label>
              <input
                type="number" value={settings.currentAge}
                onChange={(e) => updateLifePlanSettings({ currentAge: parseInt(e.target.value) || 24 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Current Net Worth</label>
              <input
                type="number" value={settings.currentNetWorth}
                onChange={(e) => updateLifePlanSettings({ currentNetWorth: parseFloat(e.target.value) || 0 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Monthly Income</label>
              <input
                type="number" value={settings.monthlyIncome}
                onChange={(e) => updateLifePlanSettings({ monthlyIncome: parseFloat(e.target.value) || 0 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Monthly Savings</label>
              <input
                type="number" value={settings.monthlySavings}
                onChange={(e) => updateLifePlanSettings({ monthlySavings: parseFloat(e.target.value) || 0 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Expected Return (%)</label>
              <input
                type="number" step="0.5" value={settings.expectedReturnRate}
                onChange={(e) => updateLifePlanSettings({ expectedReturnRate: parseFloat(e.target.value) || 7 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Salary Growth (%)</label>
              <input
                type="number" step="0.5" value={settings.salaryGrowthRate}
                onChange={(e) => updateLifePlanSettings({ salaryGrowthRate: parseFloat(e.target.value) || 3 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Inflation (%)</label>
              <input
                type="number" step="0.5" value={settings.inflationRate}
                onChange={(e) => updateLifePlanSettings({ inflationRate: parseFloat(e.target.value) || 2.5 })}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Retirement Age</label>
              <input
                type="number" value={settings.retirementAge}
                onChange={(e) => updateLifePlanSettings({ retirementAge: parseInt(e.target.value) || 60 })}
                className="w-full"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Age" value={`${settings.currentAge}`} />
            <StatCard label="Net Worth" value={formatCurrency(settings.currentNetWorth)} />
            <StatCard label="Monthly Savings" value={formatCurrency(settings.monthlySavings)} />
            <StatCard label="Retirement Age" value={`${settings.retirementAge}`} />
          </div>
        )}
      </div>

      {/* ─── Key Stats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.targets.map(({ target, age }) => (
          <div key={target} className="stat-card">
            <p className="text-xs text-[var(--muted)]">
              {target >= 1_000_000
                ? `${(target / 1_000_000).toFixed(0)}M`
                : `${(target / 1_000).toFixed(0)}k`} milestone
            </p>
            <p className="text-xl font-bold text-white mt-1">
              {age !== null ? `Age ${age}` : "—"}
            </p>
            {age !== null && (
              <p className="text-xs text-[var(--muted)]">
                {age - settings.currentAge} years away
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ─── Net Worth Projection Chart ────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-1">
          Net Worth Projection
        </h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Projected growth from age {settings.currentAge} to {settings.currentAge + projection.length - 1}
          {milestones.length > 0 && ` with ${milestones.length} milestone${milestones.length > 1 ? "s" : ""}`}
        </p>

        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={projection} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis
              dataKey="age"
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={(v) => `${v}`}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={(v) => {
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
                return `${v}`;
              }}
            />
            <Tooltip
              contentStyle={{
                background: "#1e1e2e", border: "1px solid #2e2e3e",
                borderRadius: 8, color: "#e5e7eb",
              }}
              formatter={(value) => [
                formatCurrency(Number(value)),
                "",
              ]}
              labelFormatter={(age) => {
                const point = projection.find((p) => p.age === age);
                let label = `Age ${age} (${point?.year})`;
                if (point?.milestone) label += ` — ${point.milestone}`;
                return label;
              }}
            />

            {/* Retirement age line */}
            <ReferenceLine
              x={settings.retirementAge}
              stroke="#22c55e"
              strokeDasharray="5 5"
              label={{ value: "Retirement", fill: "#22c55e", fontSize: 11, position: "top" }}
            />

            {/* Milestone markers */}
            {projection
              .filter((p) => p.milestone)
              .map((p) => (
                <ReferenceDot
                  key={p.age}
                  x={p.age}
                  y={p.netWorth}
                  r={5}
                  fill={CATEGORY_COLORS[p.milestoneCategory || "other"]}
                  stroke="#111118"
                  strokeWidth={2}
                />
              ))}

            <Area
              type="monotone"
              dataKey="invested"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.08}
              strokeWidth={1}
              strokeDasharray="4 4"
              name="invested"
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.15}
              strokeWidth={2}
              name="netWorth"
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Chart legend */}
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#22c55e] inline-block" /> Net Worth (with growth)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#6366f1] inline-block" style={{ borderTop: "1px dashed #6366f1" }} /> Total Contributed
          </span>
          {milestones.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ec4899] inline-block" /> Milestones
            </span>
          )}
        </div>
      </div>

      {/* ─── Retirement Snapshot ────────────────────────────────────────────── */}
      {stats.retirementPoint && (
        <div className="card bg-gradient-to-r from-[#22c55e]/5 to-transparent border-[#22c55e]/20">
          <h2 className="text-lg font-semibold text-white mb-3">
            At Retirement (Age {settings.retirementAge})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Projected Net Worth"
              value={formatCurrency(stats.retirementPoint.netWorth)}
            />
            <StatCard
              label="Total Contributed"
              value={formatCurrency(stats.retirementPoint.invested)}
            />
            <StatCard
              label="Investment Growth"
              value={formatCurrency(stats.retirementPoint.netWorth - stats.retirementPoint.invested)}
              subtitle={`${((stats.retirementPoint.netWorth / stats.retirementPoint.invested - 1) * 100).toFixed(0)}% return on contributions`}
            />
            <StatCard
              label="Safe Withdrawal (4%)"
              value={`${formatCurrency(stats.retirementPoint.netWorth * 0.04)}/yr`}
              subtitle={`${formatCurrency(stats.retirementPoint.netWorth * 0.04 / 12)}/mo`}
            />
          </div>
        </div>
      )}

      {/* ─── Life Timeline ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Life Milestones</h2>
            {milestones.length > 0 && (
              <p className="text-sm text-[var(--muted)]">
                Total milestone costs: {formatCurrency(totalMilestoneCost)}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary text-sm"
          >
            {showAddForm ? "Cancel" : "Add Milestone"}
          </button>
        </div>

        {/* Quick-add presets */}
        {milestones.length === 0 && !showAddForm && (
          <div className="mb-6">
            <p className="text-sm text-[var(--muted)] mb-3">
              Quick-add common milestones to get started:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PRESET_MILESTONES.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleAddPreset(preset)}
                  className="flex items-center justify-between p-3 rounded-lg bg-[var(--background)] hover:bg-[var(--card-border)] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{LIFE_EVENT_ICONS[preset.category]}</span>
                    <div>
                      <p className="text-sm text-white">{preset.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        Age {preset.defaultAge}
                        {preset.defaultCost > 0 && ` · ${formatCurrency(preset.defaultCost)}`}
                      </p>
                    </div>
                  </div>
                  <span className="text-[var(--accent)] text-sm">+ Add</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Preset buttons when milestones exist */}
        {milestones.length > 0 && !showAddForm && (
          <div className="mb-4">
            <p className="text-xs text-[var(--muted)] mb-2">Quick add:</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_MILESTONES.filter(
                (p) => !milestones.some((m) => m.name.toLowerCase() === p.name.toLowerCase())
              ).map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleAddPreset(preset)}
                  className="text-xs px-3 py-1.5 rounded-full bg-[var(--background)] text-[var(--muted)] hover:text-white hover:bg-[var(--card-border)] transition-colors"
                >
                  {LIFE_EVENT_ICONS[preset.category]} {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="p-4 rounded-lg bg-[var(--background)] border border-[var(--card-border)] mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs text-[var(--muted)] block mb-1">Name</label>
                <input
                  type="text" placeholder="e.g. Buy a house"
                  value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as LifeEventCategory)}
                  className="w-full"
                >
                  {Object.entries(LIFE_EVENT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {LIFE_EVENT_ICONS[key as LifeEventCategory]} {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Target Age</label>
                <input
                  type="number" min={settings.currentAge + 1} placeholder="30"
                  value={newAge} onChange={(e) => setNewAge(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Estimated Cost</label>
                <input
                  type="number" min="0" step="1000" placeholder="25000"
                  value={newCost} onChange={(e) => setNewCost(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs text-[var(--muted)] block mb-1">Notes (optional)</label>
                <input
                  type="text" placeholder="Any notes..."
                  value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <button onClick={handleAddMilestone} className="btn-primary text-sm">
              Add to Life Plan
            </button>
          </div>
        )}

        {/* Milestone timeline */}
        {sortedMilestones.length > 0 && (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-[var(--card-border)]" />

            <div className="space-y-1">
              {sortedMilestones.map((milestone, i) => {
                const yearsAway = milestone.targetAge - settings.currentAge;
                const projectedPoint = projection.find((p) => p.age === milestone.targetAge);
                const isAchieved = milestone.achieved;

                return (
                  <div key={milestone.id} className="relative flex items-start gap-4 pl-2">
                    {/* Timeline dot */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 z-10 border-2"
                      style={{
                        backgroundColor: isAchieved
                          ? CATEGORY_COLORS[milestone.category]
                          : "var(--card)",
                        borderColor: CATEGORY_COLORS[milestone.category],
                      }}
                    >
                      {LIFE_EVENT_ICONS[milestone.category]}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className={`text-sm font-medium ${isAchieved ? "text-[var(--muted)] line-through" : "text-white"}`}>
                            {milestone.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="text-xs text-[var(--muted)]">
                              Age {milestone.targetAge}
                            </span>
                            <span className="text-xs text-[var(--muted)]">·</span>
                            <span className="text-xs text-[var(--muted)]">
                              {yearsAway > 0 ? `${yearsAway} year${yearsAway > 1 ? "s" : ""} away` : "Now"}
                            </span>
                            {milestone.estimatedCost > 0 && (
                              <>
                                <span className="text-xs text-[var(--muted)]">·</span>
                                <span className="text-xs negative">
                                  {formatCurrency(milestone.estimatedCost)}
                                </span>
                              </>
                            )}
                            {projectedPoint && (
                              <>
                                <span className="text-xs text-[var(--muted)]">·</span>
                                <span className="text-xs positive">
                                  Net worth: {formatCurrency(projectedPoint.netWorth)}
                                </span>
                              </>
                            )}
                          </div>
                          {milestone.notes && (
                            <p className="text-xs text-[var(--muted)] mt-1 italic">
                              {milestone.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <button
                            onClick={() => updateLifePlanMilestone(milestone.id, { achieved: !isAchieved })}
                            className={`text-xs px-2 py-1 rounded ${
                              isAchieved
                                ? "text-[var(--muted)] hover:text-white"
                                : "text-[var(--green)] hover:bg-[var(--green)]/10"
                            }`}
                          >
                            {isAchieved ? "Undo" : "Done"}
                          </button>
                          <button
                            onClick={() => {
                              removeLifePlanMilestone(milestone.id);
                              addToast("Milestone removed", "info");
                            }}
                            className="text-xs text-[var(--red)] hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {/* Progress bar to milestone (based on savings needed) */}
                      {milestone.estimatedCost > 0 && !isAchieved && (
                        <div className="mt-2 max-w-xs">
                          <div className="budget-bar">
                            <div
                              className="budget-bar-fill"
                              style={{
                                width: `${Math.min(100, (settings.currentNetWorth / milestone.estimatedCost) * 100)}%`,
                                background: CATEGORY_COLORS[milestone.category],
                              }}
                            />
                          </div>
                          <p className="text-xs text-[var(--muted)] mt-0.5">
                            {Math.min(100, Math.round((settings.currentNetWorth / milestone.estimatedCost) * 100))}% of cost covered by current net worth
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {milestones.length === 0 && !showAddForm && (
          <p className="text-sm text-[var(--muted)] text-center py-8">
            Add milestones above to see your life plan timeline
          </p>
        )}
      </div>

      {/* ─── Decade Breakdown ──────────────────────────────────────────────── */}
      {projection.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Decade Breakdown
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Age</th>
                  <th className="pb-2 pr-4 text-right">Net Worth</th>
                  <th className="pb-2 pr-4 text-right">Total Contributed</th>
                  <th className="pb-2 pr-4 text-right">Investment Growth</th>
                  <th className="pb-2">Milestones</th>
                </tr>
              </thead>
              <tbody>
                {projection
                  .filter((p) => p.age % 5 === 0 || p.age === settings.currentAge || p.age === settings.retirementAge)
                  .map((p) => {
                    const growth = p.netWorth - p.invested;
                    const milestonesAtAge = milestones.filter((m) => m.targetAge <= p.age && m.targetAge > p.age - 5);
                    return (
                      <tr key={p.age} className={`border-b border-[var(--card-border)]/50 ${p.age === settings.retirementAge ? "bg-[#22c55e]/5" : ""}`}>
                        <td className="py-2.5 pr-4 text-white font-medium">
                          {p.age}
                          {p.age === settings.currentAge && (
                            <span className="text-xs text-[var(--accent)] ml-1.5">now</span>
                          )}
                          {p.age === settings.retirementAge && (
                            <span className="text-xs text-[var(--green)] ml-1.5">retire</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-white font-medium">
                          {formatCurrency(p.netWorth)}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-[var(--muted)]">
                          {formatCurrency(p.invested)}
                        </td>
                        <td className={`py-2.5 pr-4 text-right ${growth >= 0 ? "positive" : "negative"}`}>
                          {formatCurrency(growth)}
                        </td>
                        <td className="py-2.5 text-[var(--muted)] text-xs">
                          {milestonesAtAge.map((m) => (
                            <span key={m.id} className="inline-block mr-2">
                              {LIFE_EVENT_ICONS[m.category]} {m.name}
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
