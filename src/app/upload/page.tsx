"use client";

import { useRef } from "react";
import { useFinanceStore } from "@/lib/store";
import { useToastStore } from "@/lib/toast";
import { exportTransactionsCSV, exportEtoroCSV } from "@/lib/utils";
import FileUpload from "@/components/FileUpload";

function downloadFile(content: string, filename: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
    exportData,
    importData,
  } = useFinanceStore();
  const addToast = useToastStore((s) => s.addToast);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const hasAnyData =
    transactions.length > 0 ||
    etoroPositions.length > 0 ||
    etoroTransactions.length > 0 ||
    retirementFunds.length > 0;

  const handleBackup = () => {
    const json = exportData();
    downloadFile(json, "fintracker-backup.json", "application/json");
    addToast("Backup downloaded", "success");
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ok = importData(text);
    if (ok) {
      addToast("Data restored from backup", "success");
    } else {
      addToast("Invalid backup file", "error");
    }
    if (restoreInputRef.current) restoreInputRef.current.value = "";
  };

  const handleExportCSV = () => {
    if (transactions.length > 0) {
      downloadFile(
        exportTransactionsCSV(transactions),
        "barclays-transactions.csv"
      );
    }
    if (etoroPositions.length > 0) {
      downloadFile(exportEtoroCSV(etoroPositions), "etoro-positions.csv");
    }
    addToast("CSV files downloaded", "success");
  };

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
                  <p className="text-white font-medium">
                    Barclays Transactions
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {transactions.length} transactions loaded
                  </p>
                </div>
                <button
                  onClick={clearTransactions}
                  className="btn-danger text-xs"
                >
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
                <button
                  onClick={clearRetirement}
                  className="btn-danger text-xs"
                >
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

      {/* Backup / Restore / Export */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Backup & Export
        </h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Your data is stored in your browser. Clearing browser data will erase
          it. Use backup to save a copy you can restore later.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleBackup}
            className="btn-primary text-sm"
            disabled={!hasAnyData}
          >
            Download Backup (JSON)
          </button>
          <button
            onClick={() => restoreInputRef.current?.click()}
            className="btn-secondary text-sm"
          >
            Restore from Backup
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleRestore}
          />
          {hasAnyData && (
            <button onClick={handleExportCSV} className="btn-secondary text-sm">
              Export as CSV
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
