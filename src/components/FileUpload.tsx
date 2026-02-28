"use client";

import { useCallback, useState } from "react";
import { useFinanceStore } from "@/lib/store";
import { useToastStore } from "@/lib/toast";
import {
  detectFileType,
  parseBarclaysCSV,
  parseMonzoCSV,
  parseRevolutCSV,
  parseStarlingCSV,
  parseGenericCSV,
  parseEtoroPositionsCSV,
  parseEtoroTransactionsCSV,
  parseStandardLifeCSV,
} from "@/lib/parsers";

export default function FileUpload() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const {
    addTransactions,
    addEtoroPositions,
    addEtoroTransactions,
    addRetirementFunds,
    categoryRules,
  } = useFinanceStore();
  const addToast = useToastStore((s) => s.addToast);

  const processFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const fileType = detectFileType(text);
      const rules = categoryRules && categoryRules.length > 0 ? categoryRules : undefined;

      switch (fileType) {
        case "barclays": {
          const result = parseBarclaysCSV(text, rules);
          addTransactions(result.data);
          addToast(`Imported ${result.data.length} Barclays transactions`, "success");
          if (result.warnings.length > 0) setWarnings((w) => [...w, ...result.warnings]);
          break;
        }
        case "monzo": {
          const result = parseMonzoCSV(text, rules);
          addTransactions(result.data);
          addToast(`Imported ${result.data.length} Monzo transactions`, "success");
          if (result.warnings.length > 0) setWarnings((w) => [...w, ...result.warnings]);
          break;
        }
        case "revolut": {
          const result = parseRevolutCSV(text, rules);
          addTransactions(result.data);
          addToast(`Imported ${result.data.length} Revolut transactions`, "success");
          if (result.warnings.length > 0) setWarnings((w) => [...w, ...result.warnings]);
          break;
        }
        case "starling": {
          const result = parseStarlingCSV(text, rules);
          addTransactions(result.data);
          addToast(`Imported ${result.data.length} Starling transactions`, "success");
          if (result.warnings.length > 0) setWarnings((w) => [...w, ...result.warnings]);
          break;
        }
        case "generic": {
          const result = parseGenericCSV(text, rules);
          addTransactions(result.data);
          addToast(`Imported ${result.data.length} transactions (generic CSV)`, "success");
          if (result.warnings.length > 0) setWarnings((w) => [...w, ...result.warnings]);
          break;
        }
        case "etoro-positions": {
          const result = parseEtoroPositionsCSV(text);
          addEtoroPositions(result.data);
          addToast(`Imported ${result.data.length} eToro positions`, "success");
          if (result.warnings.length > 0) setWarnings((w) => [...w, ...result.warnings]);
          break;
        }
        case "etoro-transactions": {
          const result = parseEtoroTransactionsCSV(text);
          addEtoroTransactions(result.data);
          addToast(`Imported ${result.data.length} eToro transactions`, "success");
          if (result.warnings.length > 0) setWarnings((w) => [...w, ...result.warnings]);
          break;
        }
        case "standard-life": {
          const result = parseStandardLifeCSV(text);
          addRetirementFunds(result.data);
          addToast(`Imported ${result.data.length} Standard Life records`, "success");
          if (result.warnings.length > 0) setWarnings((w) => [...w, ...result.warnings]);
          break;
        }
        default:
          addToast(
            `Could not detect file type for "${file.name}". Check the CSV headers.`,
            "error"
          );
      }
    },
    [addTransactions, addEtoroPositions, addEtoroTransactions, addRetirementFunds, addToast, categoryRules]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      setWarnings([]);
      Array.from(files).forEach((file) => processFile(file));
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          isDragging
            ? "border-[var(--accent)] bg-[var(--accent)]/10"
            : "border-[var(--card-border)] hover:border-[var(--muted)]"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".csv";
          input.multiple = true;
          input.onchange = () => handleFiles(input.files);
          input.click();
        }}
      >
        <p className="text-4xl mb-3 opacity-50">+</p>
        <p className="text-lg font-medium mb-1">
          Drop CSV files here or click to browse
        </p>
        <p className="text-sm text-[var(--muted)]">
          Supports Barclays, Monzo, Revolut, Starling, eToro, Standard Life, and generic CSV
        </p>
      </div>

      {/* Parse warnings */}
      {warnings.length > 0 && (
        <div
          className="card text-sm space-y-1"
          style={{
            background: "rgba(234, 179, 8, 0.08)",
            borderColor: "rgba(234, 179, 8, 0.3)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold" style={{ color: "#eab308" }}>
              Parser Warnings
            </p>
            <button
              onClick={() => setWarnings([])}
              className="text-xs text-[var(--muted)] hover:text-white"
            >
              Dismiss
            </button>
          </div>
          {warnings.map((w, i) => (
            <p key={i} className="text-[var(--muted)]">
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="card">
          <h3 className="font-semibold mb-2 text-white">Barclays</h3>
          <p className="text-[var(--muted)]">
            Export from Barclays Online Banking. Expected columns: Date,
            Description, Money In, Money Out, Balance.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2 text-white">Monzo / Revolut / Starling</h3>
          <p className="text-[var(--muted)]">
            Export transaction history from your bank app. Each format is
            auto-detected from CSV headers.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2 text-white">eToro</h3>
          <p className="text-[var(--muted)]">
            Download Account Statement from eToro. Export the Closed Positions
            and Transactions sheets as separate CSVs.
          </p>
        </div>
      </div>
    </div>
  );
}
