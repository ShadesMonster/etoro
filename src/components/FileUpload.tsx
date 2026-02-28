"use client";

import { useCallback, useState } from "react";
import { useFinanceStore } from "@/lib/store";
import {
  detectFileType,
  parseBarclaysCSV,
  parseEtoroPositionsCSV,
  parseEtoroTransactionsCSV,
  parseStandardLifeCSV,
} from "@/lib/parsers";

export default function FileUpload() {
  const [status, setStatus] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const {
    addTransactions,
    addEtoroPositions,
    addEtoroTransactions,
    addRetirementFunds,
  } = useFinanceStore();

  const processFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const fileType = detectFileType(text);

      switch (fileType) {
        case "barclays": {
          const txs = parseBarclaysCSV(text);
          addTransactions(txs);
          setStatus(`Imported ${txs.length} Barclays transactions`);
          break;
        }
        case "etoro-positions": {
          const positions = parseEtoroPositionsCSV(text);
          addEtoroPositions(positions);
          setStatus(`Imported ${positions.length} eToro positions`);
          break;
        }
        case "etoro-transactions": {
          const txs = parseEtoroTransactionsCSV(text);
          addEtoroTransactions(txs);
          setStatus(`Imported ${txs.length} eToro transactions`);
          break;
        }
        case "standard-life": {
          const funds = parseStandardLifeCSV(text);
          addRetirementFunds(funds);
          setStatus(`Imported ${funds.length} Standard Life records`);
          break;
        }
        default:
          setStatus(
            `Could not detect file type for "${file.name}". Check the CSV headers match a supported format.`
          );
      }
    },
    [addTransactions, addEtoroPositions, addEtoroTransactions, addRetirementFunds]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
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
        <div className="text-4xl mb-3 opacity-50">&#x1F4C1;</div>
        <p className="text-lg font-medium mb-1">
          Drop CSV files here or click to browse
        </p>
        <p className="text-sm text-[var(--muted)]">
          Supports Barclays statements, eToro account statements, and Standard
          Life valuations
        </p>
      </div>

      {status && (
        <div className="card text-sm">
          <p>{status}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="card">
          <h3 className="font-semibold mb-2 text-white">Barclays</h3>
          <p className="text-[var(--muted)]">
            Export from Barclays Online Banking &rarr; Statements &rarr; Export
            as CSV. Expected columns: Date, Description, Money In, Money Out,
            Balance.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2 text-white">eToro</h3>
          <p className="text-[var(--muted)]">
            Download your Account Statement from eToro &rarr; Portfolio &rarr;
            History &rarr; Account Statement. Upload the Closed Positions or
            Transactions CSV.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2 text-white">Standard Life</h3>
          <p className="text-[var(--muted)]">
            Export valuation history from your Standard Life online account.
            Expected columns: Date, Fund Name, Total Value, Contributions.
          </p>
        </div>
      </div>
    </div>
  );
}
