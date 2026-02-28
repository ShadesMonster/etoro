"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import Link from "next/link";
import { useFinanceStore } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import StatCard from "@/components/StatCard";

export default function RetirementPage() {
  const { retirementFunds } = useFinanceStore();

  // Group by fund name
  const fundNames = useMemo(() => {
    const names = new Set(retirementFunds.map((f) => f.fundName));
    return Array.from(names);
  }, [retirementFunds]);

  const stats = useMemo(() => {
    if (retirementFunds.length === 0) {
      return {
        currentValue: 0,
        totalContributions: 0,
        employerContributions: 0,
        totalGrowth: 0,
        growthPercent: 0,
        fundName: "",
        chartData: [],
        contributionData: [],
      };
    }

    const latest = retirementFunds[0];
    const currentValue = latest.totalValue;
    const totalContributions = latest.contributions;
    const employerContributions = latest.employerContributions;
    const totalGrowth = latest.growthAmount;
    const totalInvested = totalContributions + employerContributions;
    const growthPercent =
      totalInvested > 0 ? (totalGrowth / totalInvested) * 100 : 0;

    const chartData = [...retirementFunds]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((f) => ({
        date: f.date,
        "Fund Value": f.totalValue,
      }));

    const contributionData = [...retirementFunds]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((f) => ({
        date: f.date,
        "Your Contributions": f.contributions,
        "Employer Contributions": f.employerContributions,
        Growth: f.growthAmount,
      }));

    return {
      currentValue,
      totalContributions,
      employerContributions,
      totalGrowth,
      growthPercent,
      fundName: latest.fundName,
      chartData,
      contributionData,
    };
  }, [retirementFunds]);

  if (retirementFunds.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-3">Retirement</h1>
        <p className="text-[var(--muted)] mb-6">
          No Standard Life data imported yet. Upload your pension valuation CSV.
        </p>
        <Link href="/upload" className="btn-primary inline-block">
          Upload CSV
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Retirement Fund</h1>
        <div className="flex gap-2 items-center">
          {fundNames.length > 1 && (
            <span className="text-sm text-[var(--muted)]">
              {fundNames.length} funds
            </span>
          )}
          {stats.fundName && (
            <span className="text-sm text-[var(--muted)]">
              {stats.fundName}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Fund Value"
          value={formatCurrency(stats.currentValue)}
          trend="up"
        />
        <StatCard
          label="Your Contributions"
          value={formatCurrency(stats.totalContributions)}
        />
        <StatCard
          label="Employer Contributions"
          value={formatCurrency(stats.employerContributions)}
        />
        <StatCard
          label="Investment Growth"
          value={formatCurrency(stats.totalGrowth)}
          subtitle={`${stats.growthPercent.toFixed(1)}% return`}
          trend={stats.totalGrowth >= 0 ? "up" : "down"}
        />
      </div>

      {/* Fund value chart */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Fund Value Over Time
        </h2>
        {stats.chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stats.chartData}>
              <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e1e2e",
                  border: "1px solid #2e2e3e",
                  borderRadius: 8,
                  color: "#e5e7eb",
                }}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Area
                type="monotone"
                dataKey="Fund Value"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-[var(--muted)] text-sm">
            Not enough data points.
          </p>
        )}
      </div>

      {/* Contributions breakdown */}
      {stats.contributionData.length > 1 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Contributions & Growth Breakdown
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.contributionData}>
              <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e1e2e",
                  border: "1px solid #2e2e3e",
                  borderRadius: 8,
                  color: "#e5e7eb",
                }}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
              <Bar
                dataKey="Your Contributions"
                stackId="a"
                fill="#6366f1"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Employer Contributions"
                stackId="a"
                fill="#8b5cf6"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Growth"
                stackId="a"
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data table */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Valuation History
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Fund</th>
                <th className="pb-2 pr-4 text-right">Value</th>
                <th className="pb-2 pr-4 text-right">Contributions</th>
                <th className="pb-2 pr-4 text-right">Employer</th>
                <th className="pb-2 text-right">Growth</th>
              </tr>
            </thead>
            <tbody>
              {retirementFunds.map((f, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--card-border)]/50 hover:bg-white/5"
                >
                  <td className="py-2 pr-4 text-[var(--muted)]">
                    {formatDate(f.date)}
                  </td>
                  <td className="py-2 pr-4 text-white">{f.fundName}</td>
                  <td className="py-2 pr-4 text-right text-white font-medium">
                    {formatCurrency(f.totalValue)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatCurrency(f.contributions)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatCurrency(f.employerContributions)}
                  </td>
                  <td
                    className={`py-2 text-right ${
                      f.growthAmount >= 0 ? "positive" : "negative"
                    }`}
                  >
                    {f.growthAmount >= 0 ? "▲ " : "▼ "}
                    {formatCurrency(Math.abs(f.growthAmount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
