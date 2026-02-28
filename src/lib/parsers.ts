import Papa from "papaparse";
import {
  Transaction,
  EtoroPosition,
  EtoroTransaction,
  RetirementFund,
  ParseResult,
} from "./types";
import { categorizeTransaction } from "./categorize";

let idCounter = 0;
function genId(prefix: string) {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

// ─── Barclays CSV Parser ─────────────────────────────────────────────────────
export function parseBarclaysCSV(csvText: string): ParseResult<Transaction> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const warnings: string[] = [];
  const transactions: Transaction[] = [];
  let skipped = 0;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const hasDate = headers.includes("date");
  const hasAmount = headers.includes("amount");
  const hasMoneyIn = headers.includes("money in");

  if (!hasDate)
    warnings.push(`Column "Date" not found. Found columns: ${headers.join(", ")}`);
  if (!hasAmount && !hasMoneyIn)
    warnings.push(
      `Neither "Amount" nor "Money In/Money Out" columns found. Found: ${headers.join(", ")}`
    );

  for (const row of data) {
    const date = row["date"] || "";
    const description =
      row["memo"] || row["description"] || row["subcategory"] || "";
    let amount = 0;

    if (row["amount"]) {
      amount = parseFloat(row["amount"].replace(/[£,]/g, "")) || 0;
    } else if (row["money in"] || row["money out"]) {
      const moneyIn =
        parseFloat((row["money in"] || "0").replace(/[£,]/g, "")) || 0;
      const moneyOut =
        parseFloat((row["money out"] || "0").replace(/[£,]/g, "")) || 0;
      amount = moneyIn > 0 ? moneyIn : -moneyOut;
    }

    const balance = row["balance"]
      ? parseFloat(row["balance"].replace(/[£,]/g, "")) || undefined
      : undefined;

    if (!date || (!amount && amount !== 0)) {
      skipped++;
      continue;
    }

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

  if (skipped > 0)
    warnings.push(`${skipped} rows skipped (missing date or amount)`);

  return {
    data: transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ),
    warnings,
  };
}

// ─── eToro Positions CSV Parser ──────────────────────────────────────────────
export function parseEtoroPositionsCSV(
  csvText: string
): ParseResult<EtoroPosition> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const warnings: string[] = [];
  const positions: EtoroPosition[] = [];

  const headers = data.length > 0 ? Object.keys(data[0]) : [];

  const hasInstrument = headers.some((h) =>
    ["action", "instrument name", "instrument"].includes(h)
  );
  const hasUnits = headers.includes("units");
  const hasOpenRate = headers.some((h) =>
    ["open rate", "open price"].includes(h)
  );
  const hasCloseRate = headers.some((h) =>
    ["close rate", "close price", "current rate"].includes(h)
  );
  const hasProfit = headers.some((h) => ["profit", "p/l"].includes(h));

  if (!hasInstrument)
    warnings.push(
      `Instrument column not found. Expected "Action", "Instrument Name", or "Instrument". Found: ${headers.join(", ")}`
    );
  if (!hasUnits)
    warnings.push(`"Units" column not found. Found: ${headers.join(", ")}`);
  if (!hasOpenRate)
    warnings.push(
      `Open price column not found. Expected "Open Rate" or "Open Price". Found: ${headers.join(", ")}`
    );
  if (!hasCloseRate)
    warnings.push(
      `Close price column not found. Expected "Close Rate", "Close Price", or "Current Rate". Found: ${headers.join(", ")}`
    );
  if (!hasProfit)
    warnings.push(
      `Profit column not found. Expected "Profit" or "P/L". Found: ${headers.join(", ")}`
    );

  let zeroCount = 0;

  for (const row of data) {
    const instrument =
      row["action"] || row["instrument name"] || row["instrument"] || "";
    const units = parseNum(row["units"]);
    const openRate = parseNum(row["open rate"] || row["open price"]);
    const closeRate = parseNum(
      row["close rate"] || row["close price"] || row["current rate"]
    );
    const profit = parseNum(row["profit"] || row["p/l"]);
    const openDate = row["open date"] || row["date"] || "";
    const closeDate = row["close date"] || "";

    if (!instrument) continue;

    if (units === 0 && openRate === 0 && closeRate === 0) zeroCount++;

    const isBuy =
      instrument.toLowerCase().startsWith("buy") ||
      row["type"]?.toLowerCase() === "buy";

    positions.push({
      id: genId("etoro"),
      instrument: instrument.replace(/^(buy|sell)\s+/i, "").trim(),
      units,
      openRate,
      currentRate: closeRate,
      profit,
      profitPercent:
        openRate > 0 ? ((closeRate - openRate) / openRate) * 100 : 0,
      openDate: openDate ? parseFlexibleDate(openDate) : "",
      closeDate: closeDate ? parseFlexibleDate(closeDate) : undefined,
      type: isBuy ? "buy" : "sell",
      status: closeDate ? "closed" : "open",
    });
  }

  if (zeroCount > 0)
    warnings.push(
      `${zeroCount} positions had all zero values (units, open rate, close rate). Your CSV column headers may not match the expected format.`
    );

  return { data: positions, warnings };
}

// ─── eToro Transactions CSV Parser ───────────────────────────────────────────
export function parseEtoroTransactionsCSV(
  csvText: string
): ParseResult<EtoroTransaction> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const warnings: string[] = [];
  const transactions: EtoroTransaction[] = [];
  let skipped = 0;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const hasDate = headers.includes("date");
  const hasType = headers.includes("type");
  const hasBalance = headers.some((h) =>
    ["account balance", "balance"].includes(h)
  );

  if (!hasDate)
    warnings.push(`"Date" column not found. Found: ${headers.join(", ")}`);
  if (!hasType)
    warnings.push(`"Type" column not found. Found: ${headers.join(", ")}`);
  if (!hasBalance)
    warnings.push(
      `Balance column not found. Expected "Account Balance" or "Balance". Found: ${headers.join(", ")}`
    );

  for (const row of data) {
    const date = row["date"] || "";
    const type = row["type"] || "";
    const detail = row["details"] || row["detail"] || "";
    const amount = parseNum(row["amount"]);
    const realizedEquityChange = parseNum(row["realized equity change"]);
    const balance = parseNum(row["account balance"] || row["balance"]);

    if (!date) {
      skipped++;
      continue;
    }

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

  if (skipped > 0) warnings.push(`${skipped} rows skipped (missing date)`);

  return {
    data: transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ),
    warnings,
  };
}

// ─── Standard Life CSV Parser ────────────────────────────────────────────────
export function parseStandardLifeCSV(
  csvText: string
): ParseResult<RetirementFund> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const warnings: string[] = [];
  const funds: RetirementFund[] = [];
  let skipped = 0;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const hasDate = headers.some((h) => ["date", "valuation date"].includes(h));
  const hasValue = headers.some((h) =>
    ["total value", "fund value", "value"].includes(h)
  );

  if (!hasDate)
    warnings.push(`Date column not found. Found: ${headers.join(", ")}`);
  if (!hasValue)
    warnings.push(
      `Value column not found. Expected "Total Value", "Fund Value", or "Value". Found: ${headers.join(", ")}`
    );

  for (const row of data) {
    const date = row["date"] || row["valuation date"] || "";
    const fundName =
      row["fund name"] || row["fund"] || row["plan name"] || "Pension Fund";
    const totalValue = parseNum(
      row["total value"] || row["fund value"] || row["value"]
    );
    const contributions = parseNum(
      row["your contributions"] ||
        row["member contributions"] ||
        row["contributions"]
    );
    const employerContributions = parseNum(
      row["employer contributions"] || row["employer"]
    );
    const growthAmount = parseNum(
      row["growth"] || row["growth amount"] || row["investment growth"]
    );

    if (!date) {
      skipped++;
      continue;
    }

    funds.push({
      date: parseFlexibleDate(date),
      totalValue,
      contributions,
      employerContributions,
      growthAmount,
      fundName,
    });
  }

  if (skipped > 0) warnings.push(`${skipped} rows skipped (missing date)`);

  return {
    data: funds.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ),
    warnings,
  };
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

  if (headerLine.includes("amount") && headerLine.includes("date")) {
    return "barclays";
  }

  return "unknown";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[£$,\s]/g, "")) || 0;
}

function parseUKDate(dateStr: string): string {
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
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }

  const ukMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (ukMatch) {
    const day = ukMatch[1].padStart(2, "0");
    const month = ukMatch[2].padStart(2, "0");
    const year = ukMatch[3].length === 2 ? `20${ukMatch[3]}` : ukMatch[3];
    return `${year}-${month}-${day}`;
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return dateStr;
}
