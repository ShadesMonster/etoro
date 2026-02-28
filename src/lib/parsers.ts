import Papa from "papaparse";
import { Transaction, EtoroPosition, EtoroTransaction, RetirementFund } from "./types";
import { categorizeTransaction } from "./categorize";

let idCounter = 0;
function genId(prefix: string) {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

// ─── Barclays CSV Parser ─────────────────────────────────────────────────────
// Barclays exports typically have columns:
// Number, Date, Account, Amount, Subcategory, Memo
// OR: Date, Description, Money In, Money Out, Balance
export function parseBarclaysCSV(csvText: string): Transaction[] {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const transactions: Transaction[] = [];

  for (const row of data) {
    // Try to detect which format we're dealing with
    const date = row["date"] || "";
    const description = row["memo"] || row["description"] || row["subcategory"] || "";
    let amount = 0;

    if (row["amount"]) {
      amount = parseFloat(row["amount"].replace(/[£,]/g, "")) || 0;
    } else if (row["money in"] || row["money out"]) {
      const moneyIn = parseFloat((row["money in"] || "0").replace(/[£,]/g, "")) || 0;
      const moneyOut = parseFloat((row["money out"] || "0").replace(/[£,]/g, "")) || 0;
      amount = moneyIn > 0 ? moneyIn : -moneyOut;
    }

    const balance = row["balance"]
      ? parseFloat(row["balance"].replace(/[£,]/g, "")) || undefined
      : undefined;

    if (!date || (!amount && amount !== 0)) continue;

    const parsedDate = parseUKDate(date);

    transactions.push({
      id: genId("brc"),
      date: parsedDate,
      description: description.trim(),
      amount,
      balance,
      category: categorizeTransaction(description, amount),
      source: "barclays",
    });
  }

  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── eToro CSV Parser ────────────────────────────────────────────────────────
// eToro Account Statement has multiple sheets. The main ones:
// Closed Positions: Action, Amount, Units, Open Rate, Close Rate, Spread, Profit, Open Date, Close Date
// Transactions: Date, Account Balance, Type, Details, Amount, Realized Equity Change, Realized Equity, NWA
export function parseEtoroPositionsCSV(csvText: string): EtoroPosition[] {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const positions: EtoroPosition[] = [];

  for (const row of data) {
    const instrument =
      row["action"] || row["instrument name"] || row["instrument"] || "";
    const units = parseFloat(row["units"] || "0") || 0;
    const openRate =
      parseFloat((row["open rate"] || row["open price"] || "0").replace(/[,$]/g, "")) || 0;
    const closeRate =
      parseFloat(
        (row["close rate"] || row["close price"] || row["current rate"] || "0").replace(
          /[,$]/g,
          ""
        )
      ) || 0;
    const profit =
      parseFloat((row["profit"] || row["p/l"] || "0").replace(/[,$]/g, "")) || 0;
    const openDate = row["open date"] || row["date"] || "";

    if (!instrument) continue;

    const isBuy = instrument.toLowerCase().startsWith("buy") ||
      row["type"]?.toLowerCase() === "buy";

    positions.push({
      id: genId("etoro"),
      instrument: instrument.replace(/^(buy|sell)\s+/i, "").trim(),
      units,
      openRate,
      currentRate: closeRate,
      profit,
      profitPercent: openRate > 0 ? ((closeRate - openRate) / openRate) * 100 : 0,
      openDate: openDate ? parseFlexibleDate(openDate) : "",
      type: isBuy ? "buy" : "sell",
    });
  }

  return positions;
}

export function parseEtoroTransactionsCSV(csvText: string): EtoroTransaction[] {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const transactions: EtoroTransaction[] = [];

  for (const row of data) {
    const date = row["date"] || "";
    const type = row["type"] || "";
    const detail = row["details"] || row["detail"] || "";
    const amount = parseFloat((row["amount"] || "0").replace(/[,$]/g, "")) || 0;
    const realizedEquityChange =
      parseFloat((row["realized equity change"] || "0").replace(/[,$]/g, "")) || 0;
    const balance =
      parseFloat((row["account balance"] || row["balance"] || "0").replace(/[,$]/g, "")) || 0;

    if (!date) continue;

    transactions.push({
      id: genId("etoro-tx"),
      date: parseFlexibleDate(date),
      type,
      detail,
      amount,
      realizedEquityChange,
      balance,
    });
  }

  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Standard Life CSV Parser ────────────────────────────────────────────────
// Standard Life statements vary, but common columns:
// Date, Fund Name, Total Value, Your Contributions, Employer Contributions, Growth
export function parseStandardLifeCSV(csvText: string): RetirementFund[] {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const funds: RetirementFund[] = [];

  for (const row of data) {
    const date = row["date"] || row["valuation date"] || "";
    const fundName = row["fund name"] || row["fund"] || row["plan name"] || "Pension Fund";
    const totalValue =
      parseFloat(
        (row["total value"] || row["fund value"] || row["value"] || "0").replace(/[£,]/g, "")
      ) || 0;
    const contributions =
      parseFloat(
        (row["your contributions"] || row["member contributions"] || row["contributions"] || "0").replace(
          /[£,]/g,
          ""
        )
      ) || 0;
    const employerContributions =
      parseFloat(
        (row["employer contributions"] || row["employer"] || "0").replace(/[£,]/g, "")
      ) || 0;
    const growthAmount =
      parseFloat(
        (row["growth"] || row["growth amount"] || row["investment growth"] || "0").replace(
          /[£,]/g,
          ""
        )
      ) || 0;

    if (!date) continue;

    funds.push({
      date: parseFlexibleDate(date),
      totalValue,
      contributions,
      employerContributions,
      growthAmount,
      fundName,
    });
  }

  return funds.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Detect file type ────────────────────────────────────────────────────────
export type FileType =
  | "barclays"
  | "etoro-positions"
  | "etoro-transactions"
  | "standard-life"
  | "unknown";

export function detectFileType(csvText: string): FileType {
  const headerLine = csvText.split("\n")[0]?.toLowerCase() || "";

  if (
    headerLine.includes("money in") ||
    headerLine.includes("money out") ||
    (headerLine.includes("memo") && headerLine.includes("subcategory"))
  ) {
    return "barclays";
  }

  if (
    headerLine.includes("open rate") ||
    headerLine.includes("close rate") ||
    headerLine.includes("open price")
  ) {
    return "etoro-positions";
  }

  if (
    headerLine.includes("realized equity") ||
    (headerLine.includes("type") && headerLine.includes("account balance"))
  ) {
    return "etoro-transactions";
  }

  if (
    headerLine.includes("fund name") ||
    headerLine.includes("fund value") ||
    headerLine.includes("employer contributions") ||
    headerLine.includes("plan name")
  ) {
    return "standard-life";
  }

  // Fallback heuristic: if it has Amount + Date + Memo/Description, likely Barclays
  if (headerLine.includes("amount") && headerLine.includes("date")) {
    return "barclays";
  }

  return "unknown";
}

// ─── Date helpers ────────────────────────────────────────────────────────────
function parseUKDate(dateStr: string): string {
  // Handle DD/MM/YYYY format
  const parts = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (parts) {
    const day = parts[1].padStart(2, "0");
    const month = parts[2].padStart(2, "0");
    const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function parseFlexibleDate(dateStr: string): string {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }

  // Try DD/MM/YYYY
  const ukMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (ukMatch) {
    const day = ukMatch[1].padStart(2, "0");
    const month = ukMatch[2].padStart(2, "0");
    const year = ukMatch[3].length === 2 ? `20${ukMatch[3]}` : ukMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Try MM/DD/YYYY (US format from eToro)
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return dateStr;
}
