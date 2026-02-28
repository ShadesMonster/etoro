"use client";

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}

export default function StatCard({ label, value, subtitle, trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <p className="text-sm text-[var(--muted)] mb-1">{label}</p>
      <p
        className={`text-2xl font-bold ${
          trend === "up"
            ? "positive"
            : trend === "down"
            ? "negative"
            : "text-white"
        }`}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-[var(--muted)] mt-1">{subtitle}</p>
      )}
    </div>
  );
}
