"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFinanceStore } from "@/lib/store";
import { formatCurrency, formatDate, getTaxYearOptions, exportEtoroCSV } from "@/lib/utils";
import StatCard from "@/components/StatCard";

export default function TaxPage() {
  const { etoroPositions, etoroTransactions, etoroDividends } = useFinanceStore();
  const taxYears = getTaxYearOptions();
  const [selectedYear, setSelectedYear] = useState(taxYears[0]);

  // Filter positions within tax year
  const taxYearPositions = useMemo(() => {
    return (etoroPositions || []).filter((p) => {
      const closeDate = p.closeDate || "";
      return (
        p.status === "closed" &&
        closeDate >= selectedYear.start &&
        closeDate <= selectedYear.end
      );
    });
  }, [etoroPositions, selectedYear]);

  // Dedicated dividend data for the tax year
  const taxYearDividends = useMemo(() => {
    return (etoroDividends || []).filter(
      (d) => d.date >= selectedYear.start && d.date <= selectedYear.end
    );
  }, [etoroDividends, selectedYear]);

  // Fallback: dividends from eToro transactions
  const dividends = useMemo(() => {
    return (etoroTransactions || []).filter((tx) => {
      const type = tx.type.toLowerCase();
      return (
        (type.includes("dividend") || type.includes("rollover fee")) &&
        tx.date >= selectedYear.start &&
        tx.date <= selectedYear.end
      );
    });
  }, [etoroTransactions, selectedYear]);

  // Capital gains summary
  const capitalGains = useMemo(() => {
    let totalGains = 0;
    let totalLosses = 0;
    let totalProceeds = 0;
    let totalCost = 0;

    for (const p of taxYearPositions) {
      const proceeds = p.currentRate * p.units;
      const cost = p.openRate * p.units;
      totalProceeds += proceeds;
      totalCost += cost;

      if (p.profit >= 0) {
        totalGains += p.profit;
      } else {
        totalLosses += Math.abs(p.profit);
      }
    }

    const netGain = totalGains - totalLosses;
    const annualExemption = 3000; // UK CGT allowance 2024/25 onwards
    const taxableGain = Math.max(0, netGain - annualExemption);

    return {
      totalGains,
      totalLosses,
      netGain,
      totalProceeds,
      totalCost,
      annualExemption,
      taxableGain,
      disposals: taxYearPositions.length,
    };
  }, [taxYearPositions]);

  // Dividend summary - prefer dedicated data
  const dividendSummary = useMemo(() => {
    if (taxYearDividends.length > 0) {
      const totalGBP = taxYearDividends.reduce((s, d) => s + d.netDividendGBP, 0);
      const totalUSD = taxYearDividends.reduce((s, d) => s + d.netDividendUSD, 0);
      const totalWithholdingGBP = taxYearDividends.reduce((s, d) => s + d.withholdingTaxGBP, 0);
      const allowance = 500; // UK dividend allowance 2024/25 onwards
      return {
        total: totalGBP,
        totalUSD,
        totalWithholdingGBP,
        allowance,
        taxable: Math.max(0, totalGBP - allowance),
        count: taxYearDividends.length,
        hasDedicatedData: true,
      };
    }
    const total = dividends.reduce((s, d) => s + d.amount, 0);
    const allowance = 500; // UK dividend allowance 2024/25 onwards
    return {
      total,
      totalUSD: total,
      totalWithholdingGBP: 0,
      allowance,
      taxable: Math.max(0, total - allowance),
      count: dividends.length,
      hasDedicatedData: false,
    };
  }, [taxYearDividends, dividends]);

  const handleExportCSV = () => {
    const csv = exportEtoroCSV(
      taxYearPositions.map((p) => ({
        instrument: p.instrument,
        units: p.units,
        openRate: p.openRate,
        currentRate: p.currentRate,
        profit: p.profit,
        profitPercent: p.profitPercent,
        openDate: p.openDate,
        type: p.type,
        status: p.status,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etoro-tax-${selectedYear.label.replace("/", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasData =
    (etoroPositions || []).length > 0 || (etoroTransactions || []).length > 0 || (etoroDividends || []).length > 0;

  if (!hasData) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-white mb-3">Tax Report</h1>
        <p className="text-[var(--muted)] mb-6">
          No eToro data imported yet. Upload your Closed Positions and
          Transactions CSVs to generate a tax report.
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
        <h1 className="text-2xl font-bold text-white">Tax Report</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="btn-secondary text-sm no-print"
          >
            Print / PDF
          </button>
          {taxYearPositions.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="btn-secondary text-sm no-print"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Tax year selector */}
      <div className="card no-print">
        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--muted)]">Tax Year:</label>
          <div className="flex gap-2">
            {taxYears.map((ty) => (
              <button
                key={ty.label}
                onClick={() => setSelectedYear(ty)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedYear.label === ty.label
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--card-border)] text-[var(--muted)] hover:text-white"
                }`}
              >
                {ty.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-[var(--muted)]">
        UK tax year: 6 Apr {selectedYear.label.split("/")[0]} &ndash; 5 Apr{" "}
        {selectedYear.label.split("/")[1]}
      </p>

      {/* Capital Gains Summary */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Capital Gains
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard
            label="Total Gains"
            value={formatCurrency(capitalGains.totalGains, "GBP")}
            trend="up"
          />
          <StatCard
            label="Total Losses"
            value={formatCurrency(capitalGains.totalLosses, "GBP")}
            trend="down"
          />
          <StatCard
            label="Net Gain/Loss"
            value={formatCurrency(capitalGains.netGain, "GBP")}
            trend={capitalGains.netGain >= 0 ? "up" : "down"}
          />
          <StatCard
            label="Taxable Gain"
            value={formatCurrency(capitalGains.taxableGain, "GBP")}
            subtitle={`after ${formatCurrency(capitalGains.annualExemption, "GBP")} allowance`}
          />
        </div>
        <div className="text-sm text-[var(--muted)] space-y-1">
          <p>
            Disposals: {capitalGains.disposals} | Total proceeds:{" "}
            {formatCurrency(capitalGains.totalProceeds, "GBP")} | Total cost:{" "}
            {formatCurrency(capitalGains.totalCost, "GBP")}
          </p>
          <p className="text-xs">
            Note: This uses a simplified calculation. eToro positions are in USD
            &mdash; for HMRC you may need to convert using the exchange rate on
            each disposal date. Consult a tax advisor for accurate reporting.
          </p>
        </div>
      </div>

      {/* Dividend Summary */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Dividends
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard
            label="Total Dividends"
            value={formatCurrency(dividendSummary.total, "GBP")}
            subtitle={`${dividendSummary.count} payments`}
          />
          <StatCard
            label="Dividend Allowance"
            value={formatCurrency(dividendSummary.allowance, "GBP")}
          />
          <StatCard
            label="Taxable Dividends"
            value={formatCurrency(dividendSummary.taxable, "GBP")}
          />
          {dividendSummary.hasDedicatedData && (
            <StatCard
              label="Withholding Tax Paid"
              value={formatCurrency(dividendSummary.totalWithholdingGBP, "GBP")}
              subtitle="Foreign tax credit"
            />
          )}
        </div>
      </div>

      {/* Closed positions detail */}
      {taxYearPositions.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Closed Positions ({selectedYear.label})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Instrument</th>
                  <th className="pb-2 pr-4 text-right">Units</th>
                  <th className="pb-2 pr-4 text-right">Open Rate</th>
                  <th className="pb-2 pr-4 text-right">Close Rate</th>
                  <th className="pb-2 pr-4 text-right">Profit/Loss</th>
                  <th className="pb-2 pr-4">Open Date</th>
                  <th className="pb-2">Close Date</th>
                </tr>
              </thead>
              <tbody>
                {taxYearPositions.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--card-border)]/50 hover:bg-[var(--card-border)]/30"
                  >
                    <td className="py-2 pr-4 text-white">{p.instrument}</td>
                    <td className="py-2 pr-4 text-right text-[var(--muted)]">
                      {p.units}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--muted)]">
                      ${p.openRate.toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--muted)]">
                      ${p.currentRate.toFixed(2)}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right ${
                        p.profit >= 0 ? "positive" : "negative"
                      }`}
                    >
                      {p.profit >= 0 ? "+" : ""}${p.profit.toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {p.openDate ? formatDate(p.openDate) : "-"}
                    </td>
                    <td className="py-2 text-[var(--muted)]">
                      {p.closeDate ? formatDate(p.closeDate) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dividend detail - dedicated data */}
      {taxYearDividends.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Dividend History ({selectedYear.label})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Instrument</th>
                  <th className="pb-2 pr-4 text-right">Net (USD)</th>
                  <th className="pb-2 pr-4 text-right">Net (GBP)</th>
                  <th className="pb-2 pr-4 text-right">WHT Rate</th>
                  <th className="pb-2 text-right">WHT (GBP)</th>
                </tr>
              </thead>
              <tbody>
                {taxYearDividends.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-[var(--card-border)]/50 hover:bg-[var(--card-border)]/30"
                  >
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {formatDate(d.date)}
                    </td>
                    <td className="py-2 pr-4 text-white">{d.instrument}</td>
                    <td className="py-2 pr-4 text-right positive">
                      +{formatCurrency(d.netDividendUSD, "USD")}
                    </td>
                    <td className="py-2 pr-4 text-right positive">
                      +{formatCurrency(d.netDividendGBP, "GBP")}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--muted)]">
                      {d.withholdingTaxRate}%
                    </td>
                    <td className="py-2 text-right text-[var(--muted)]">
                      {formatCurrency(d.withholdingTaxGBP, "GBP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dividend detail fallback - from transactions */}
      {taxYearDividends.length === 0 && dividends.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Dividend History ({selectedYear.label})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Detail</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-[var(--card-border)]/50 hover:bg-[var(--card-border)]/30"
                  >
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {formatDate(d.date)}
                    </td>
                    <td className="py-2 pr-4 text-white">{d.detail}</td>
                    <td className="py-2 text-right positive">
                      +{formatCurrency(d.amount, "GBP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {taxYearPositions.length === 0 && taxYearDividends.length === 0 && dividends.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-[var(--muted)]">
            No closed positions or dividends found for the {selectedYear.label}{" "}
            tax year.
          </p>
        </div>
      )}
    </div>
  );
}
