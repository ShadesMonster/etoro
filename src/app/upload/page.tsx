"use client";

import { useFinanceStore } from "@/lib/store";
import FileUpload from "@/components/FileUpload";

export default function UploadPage() {
  const {
    transactions,
    etoroPositions,
    etoroTransactions,
    retirementFunds,
    clearTransactions,
    clearEtoro,
    clearRetirement,
    clearAll,
  } = useFinanceStore();

  const hasAnyData =
    transactions.length > 0 ||
    etoroPositions.length > 0 ||
    etoroTransactions.length > 0 ||
    retirementFunds.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Upload Data</h1>

      <FileUpload />

      {/* Data summary */}
      {hasAnyData && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Imported Data
          </h2>
          <div className="space-y-3">
            {transactions.length > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-[var(--card-border)]/50">
                <div>
                  <p className="text-white font-medium">Barclays Transactions</p>
                  <p className="text-sm text-[var(--muted)]">
                    {transactions.length} transactions loaded
                  </p>
                </div>
                <button onClick={clearTransactions} className="btn-danger text-xs">
                  Clear
                </button>
              </div>
            )}

            {etoroPositions.length > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-[var(--card-border)]/50">
                <div>
                  <p className="text-white font-medium">eToro Positions</p>
                  <p className="text-sm text-[var(--muted)]">
                    {etoroPositions.length} positions loaded
                  </p>
                </div>
                <button onClick={clearEtoro} className="btn-danger text-xs">
                  Clear
                </button>
              </div>
            )}

            {etoroTransactions.length > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-[var(--card-border)]/50">
                <div>
                  <p className="text-white font-medium">eToro Transactions</p>
                  <p className="text-sm text-[var(--muted)]">
                    {etoroTransactions.length} transactions loaded
                  </p>
                </div>
              </div>
            )}

            {retirementFunds.length > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-[var(--card-border)]/50">
                <div>
                  <p className="text-white font-medium">
                    Standard Life Retirement
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {retirementFunds.length} records loaded
                  </p>
                </div>
                <button onClick={clearRetirement} className="btn-danger text-xs">
                  Clear
                </button>
              </div>
            )}

            <div className="pt-2">
              <button onClick={clearAll} className="btn-danger text-sm">
                Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
