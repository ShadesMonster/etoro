"use client";

import { useRef, useMemo, useState } from "react";
import { useFinanceStore } from "@/lib/store";
import { useToastStore } from "@/lib/toast";
import {
  exportTransactionsCSV, exportEtoroCSV, formatCurrency, formatDate,
  findDuplicateTransactions,
} from "@/lib/utils";
import { ALL_CATEGORIES, CATEGORY_LABELS, SpendingCategory } from "@/lib/types";
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
    etoroDividends,
    retirementFunds,
    clearTransactions,
    clearEtoro,
    clearRetirement,
    clearAll,
    exportData,
    importData,
    removeTransactions,
    bulkSetCategory,
  } = useFinanceStore();
  const addToast = useToastStore((s) => s.addToast);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [bulkCat, setBulkCat] = useState<SpendingCategory>("other");
  const [bulkSearch, setBulkSearch] = useState("");

  // Find duplicates
  const duplicates = useMemo(
    () => findDuplicateTransactions(transactions),
    [transactions]
  );

  // Bulk recategorise matches
  const bulkMatches = useMemo(() => {
    if (!bulkSearch.trim()) return [];
    const q = bulkSearch.toLowerCase();
    return transactions.filter((t) => t.description.toLowerCase().includes(q));
  }, [transactions, bulkSearch]);

  const hasAnyData =
    transactions.length > 0 ||
    etoroPositions.length > 0 ||
    etoroTransactions.length > 0 ||
    etoroDividends.length > 0 ||
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

            {etoroDividends.length > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-[var(--card-border)]/50">
                <div>
                  <p className="text-white font-medium">eToro Dividends</p>
                  <p className="text-sm text-[var(--muted)]">
                    {etoroDividends.length} dividend payments loaded
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

      {/* Data Cleanup Tools */}
      {transactions.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Data Cleanup Tools
          </h2>

          {/* Duplicate detection */}
          {duplicates.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-white mb-2">
                Potential Duplicates ({duplicates.length} groups)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {duplicates.slice(0, 10).map((group) => (
                  <div
                    key={group.key}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--background)]"
                  >
                    <div>
                      <p className="text-sm text-white">
                        {group.transactions[0].description}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatDate(group.transactions[0].date)} &middot;{" "}
                        {formatCurrency(Math.abs(group.transactions[0].amount))} &middot;{" "}
                        {group.transactions.length} copies
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const keep = group.transactions[0].id;
                        const remove = group.transactions.slice(1).map((t) => t.id);
                        removeTransactions(remove);
                        addToast(
                          `Removed ${remove.length} duplicate(s)`,
                          "success"
                        );
                      }}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Keep 1, remove {group.transactions.length - 1}
                    </button>
                  </div>
                ))}
              </div>
              {duplicates.length > 10 && (
                <p className="text-xs text-[var(--muted)] mt-2">
                  Showing 10 of {duplicates.length} groups
                </p>
              )}
            </div>
          )}

          {duplicates.length === 0 && (
            <p className="text-sm text-[var(--muted)] mb-4">
              No duplicate transactions found.
            </p>
          )}

          {/* Bulk recategorise */}
          <h3 className="text-sm font-medium text-white mb-2">
            Bulk Recategorise
          </h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">
                Search description
              </label>
              <input
                type="text"
                placeholder="e.g. tesco"
                value={bulkSearch}
                onChange={(e) => setBulkSearch(e.target.value)}
                className="w-48"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">
                New category
              </label>
              <select
                value={bulkCat}
                onChange={(e) => setBulkCat(e.target.value as SpendingCategory)}
                className="w-48"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (bulkMatches.length === 0) {
                  addToast("No matching transactions", "warning");
                  return;
                }
                bulkSetCategory(
                  bulkMatches.map((t) => t.id),
                  bulkCat
                );
                addToast(
                  `Recategorised ${bulkMatches.length} transactions to ${CATEGORY_LABELS[bulkCat]}`,
                  "success"
                );
                setBulkSearch("");
              }}
              className="btn-primary text-sm"
              disabled={bulkMatches.length === 0}
            >
              Apply ({bulkMatches.length} matches)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
