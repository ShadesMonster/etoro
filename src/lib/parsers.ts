import Papa from "papaparse";
import {
  Transaction,
  EtoroPosition,
  EtoroTransaction,
  EtoroDividend,
  RetirementFund,
  ParseResult,
  CategoryRule,
} from "./types";
import { categorizeTransaction } from "./categorize";

let idCounter = 0;
function genId(prefix: string) {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

// ─── Barclays CSV Parser ─────────────────────────────────────────────────────
export function parseBarclaysCSV(
  csvText: string,
  customRules?: CategoryRule[]
): ParseResult<Transaction> {
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
      category: categorizeTransaction(description, amount, customRules),
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

// ─── Monzo CSV Parser ────────────────────────────────────────────────────────
export function parseMonzoCSV(
  csvText: string,
  customRules?: CategoryRule[]
): ParseResult<Transaction> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const warnings: string[] = [];
  const transactions: Transaction[] = [];
  let skipped = 0;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  if (!headers.includes("date"))
    warnings.push(`"Date" column not found. Found: ${headers.join(", ")}`);
  if (!headers.includes("amount"))
    warnings.push(`"Amount" column not found. Found: ${headers.join(", ")}`);

  for (const row of data) {
    const date = row["date"] || row["created"] || "";
    const description = row["name"] || row["description"] || "";
    const amount = parseNum(row["amount"]);
    const balance = row["balance"] ? parseNum(row["balance"]) : undefined;

    if (!date) {
      skipped++;
      continue;
    }

    transactions.push({
      id: genId("mnz"),
      date: parseFlexibleDate(date),
      description: description.trim(),
      amount,
      balance,
      category: row["category"]
        ? mapMonzoCategory(row["category"])
        : categorizeTransaction(description, amount, customRules),
      source: "monzo",
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

function mapMonzoCategory(monzoCat: string): Transaction["category"] {
  const map: Record<string, Transaction["category"]> = {
    groceries: "groceries",
    eating_out: "eating-out",
    transport: "transport",
    bills: "bills",
    shopping: "shopping",
    entertainment: "entertainment",
    health: "health",
    cash: "cash",
    income: "income",
    transfers: "transfers",
    general: "other",
    expenses: "other",
    finances: "transfers",
    holidays: "entertainment",
    personal_care: "health",
    family: "other",
    charity: "other",
  };
  return map[monzoCat.toLowerCase().trim()] || "other";
}

// ─── Revolut CSV Parser ──────────────────────────────────────────────────────
export function parseRevolutCSV(
  csvText: string,
  customRules?: CategoryRule[]
): ParseResult<Transaction> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const warnings: string[] = [];
  const transactions: Transaction[] = [];
  let skipped = 0;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const hasDate = headers.some((h) =>
    ["started date", "completed date", "date"].includes(h)
  );
  if (!hasDate)
    warnings.push(`Date column not found. Found: ${headers.join(", ")}`);

  for (const row of data) {
    const date =
      row["started date"] || row["completed date"] || row["date"] || "";
    const description = row["description"] || "";
    const amount = parseNum(row["amount"]);
    const balance = row["balance"] ? parseNum(row["balance"]) : undefined;
    const state = (row["state"] || "").toLowerCase();

    if (!date) {
      skipped++;
      continue;
    }

    if (state === "reverted" || state === "declined" || state === "failed")
      continue;

    transactions.push({
      id: genId("rev"),
      date: parseFlexibleDate(date),
      description: description.trim(),
      amount,
      balance,
      category: categorizeTransaction(description, amount, customRules),
      source: "revolut",
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

// ─── Starling CSV Parser ─────────────────────────────────────────────────────
export function parseStarlingCSV(
  csvText: string,
  customRules?: CategoryRule[]
): ParseResult<Transaction> {
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
  if (!hasDate)
    warnings.push(`"Date" column not found. Found: ${headers.join(", ")}`);

  for (const row of data) {
    const date = row["date"] || "";
    const description =
      row["counter party"] || row["counterparty"] || row["reference"] || "";
    const amount = parseNum(
      row["amount (gbp)"] || row["amount"] || row["money in"] || ""
    );
    const balance = row["balance"]
      ? parseNum(row["balance"])
      : row["balance (gbp)"]
      ? parseNum(row["balance (gbp)"])
      : undefined;

    if (!date) {
      skipped++;
      continue;
    }

    let finalAmount = amount;
    if (
      !row["amount (gbp)"] &&
      !row["amount"] &&
      (row["money in"] || row["money out"])
    ) {
      const moneyIn = parseNum(row["money in"]);
      const moneyOut = parseNum(row["money out"]);
      finalAmount = moneyIn > 0 ? moneyIn : -moneyOut;
    }

    transactions.push({
      id: genId("stl"),
      date: parseFlexibleDate(date),
      description: description.trim(),
      amount: finalAmount,
      balance,
      category: categorizeTransaction(description, finalAmount, customRules),
      source: "starling",
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

// ─── Generic CSV Parser ──────────────────────────────────────────────────────
export function parseGenericCSV(
  csvText: string,
  customRules?: CategoryRule[]
): ParseResult<Transaction> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const warnings: string[] = [];
  const transactions: Transaction[] = [];
  let skipped = 0;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const dateCol = headers.find((h) =>
    ["date", "transaction date", "posted date", "booking date"].includes(h)
  );
  const descCol = headers.find((h) =>
    ["description", "memo", "narrative", "details", "reference", "name"].includes(h)
  );
  const amountCol = headers.find((h) =>
    ["amount", "value", "transaction amount"].includes(h)
  );
  const debitCol = headers.find((h) =>
    ["debit", "money out", "withdrawal"].includes(h)
  );
  const creditCol = headers.find((h) =>
    ["credit", "money in", "deposit"].includes(h)
  );
  const balCol = headers.find((h) => ["balance", "running balance"].includes(h));

  if (!dateCol)
    warnings.push(
      `Could not detect a date column. Found: ${headers.join(", ")}`
    );
  if (!amountCol && !debitCol)
    warnings.push(
      `Could not detect amount column. Found: ${headers.join(", ")}`
    );

  for (const row of data) {
    const date = dateCol ? row[dateCol] : "";
    const description = descCol ? row[descCol] : "";

    let amount = 0;
    if (amountCol) {
      amount = parseNum(row[amountCol]);
    } else if (debitCol || creditCol) {
      const debit = debitCol ? parseNum(row[debitCol]) : 0;
      const credit = creditCol ? parseNum(row[creditCol]) : 0;
      amount = credit > 0 ? credit : -debit;
    }

    const balance = balCol ? parseNum(row[balCol]) || undefined : undefined;

    if (!date) {
      skipped++;
      continue;
    }

    transactions.push({
      id: genId("gen"),
      date: parseFlexibleDate(date),
      description: description.trim(),
      amount,
      balance,
      category: categorizeTransaction(description, amount, customRules),
      source: "generic",
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
  const hasUnits = headers.some((h) =>
    ["units", "units / contracts"].includes(h)
  );
  const hasOpenRate = headers.some((h) =>
    ["open rate", "open price"].includes(h)
  );
  const hasCloseRate = headers.some((h) =>
    ["close rate", "close price", "current rate"].includes(h)
  );
  const hasProfit = headers.some((h) =>
    ["profit", "p/l", "profit(usd)"].includes(h)
  );

  if (!hasInstrument)
    warnings.push(
      `Instrument column not found. Expected "Action", "Instrument Name", or "Instrument". Found: ${headers.join(", ")}`
    );
  if (!hasUnits)
    warnings.push(`"Units" or "Units / Contracts" column not found. Found: ${headers.join(", ")}`);
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
      `Profit column not found. Expected "Profit", "Profit(USD)", or "P/L". Found: ${headers.join(", ")}`
    );

  let zeroCount = 0;

  for (const row of data) {
    const instrument =
      row["action"] || row["instrument name"] || row["instrument"] || "";
    const units = parseNum(row["units / contracts"] || row["units"]);
    const openRate = parseNum(row["open rate"] || row["open price"]);
    const closeRate = parseNum(
      row["close rate"] || row["close price"] || row["current rate"]
    );
    const profit = parseNum(row["profit(usd)"] || row["profit"] || row["p/l"]);
    const profitGBP = parseNum(row["profit(gbp)"]);
    const openDate = row["open date"] || row["date"] || "";
    const closeDate = row["close date"] || "";
    const longShort = (row["long / short"] || "").toLowerCase().trim();
    const positionId = row["position id"] || "";
    const amount = parseNum(row["amount"]);
    const leverage = parseNum(row["leverage"]);
    const spreadFees = parseNum(row["spread fees (usd)"] || row["spread"]);
    const marketSpread = parseNum(row["market spread (usd)"]);
    const fxRateOpen = parseNum(row["fx rate at open (usd)"]);
    const fxRateClose = parseNum(row["fx rate at close (usd)"]);
    const takeProfitRate = parseNum(row["take profit rate"]);
    const stopLossRate = parseNum(row["stop loss rate"]);
    const overnightFees = parseNum(row["overnight fees and dividends"]);
    const isin = row["isin"] || "";

    if (!instrument) continue;

    if (units === 0 && openRate === 0 && closeRate === 0) zeroCount++;

    // Determine buy/sell from Long/Short column, prefix in name, or type column
    const isBuy =
      longShort === "long" ||
      (!longShort &&
        (instrument.toLowerCase().startsWith("buy") ||
          row["type"]?.toLowerCase() === "buy"));

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
      positionId: positionId || undefined,
      amount: amount || undefined,
      leverage: leverage || undefined,
      spreadFees: spreadFees || undefined,
      marketSpread: marketSpread || undefined,
      profitGBP: profitGBP || undefined,
      fxRateOpen: fxRateOpen || undefined,
      fxRateClose: fxRateClose || undefined,
      takeProfitRate: takeProfitRate || undefined,
      stopLossRate: stopLossRate || undefined,
      overnightFees: overnightFees || undefined,
      isin: isin || undefined,
      longShort: longShort === "long" || longShort === "short" ? longShort : undefined,
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
    ["account balance", "balance", "realized equity balance"].includes(h)
  );

  if (!hasDate)
    warnings.push(`"Date" column not found. Found: ${headers.join(", ")}`);
  if (!hasType)
    warnings.push(`"Type" column not found. Found: ${headers.join(", ")}`);
  if (!hasBalance)
    warnings.push(
      `Balance column not found. Expected "Account Balance", "Realized Equity Balance", or "Balance". Found: ${headers.join(", ")}`
    );

  for (const row of data) {
    const date = row["date"] || "";
    const type = row["type"] || "";
    const detail = row["details"] || row["detail"] || "";
    const amount = parseNum(row["amount"]);
    const realizedEquityChange = parseNum(row["realized equity change"]);
    const balance = parseNum(
      row["realized equity balance"] || row["account balance"] || row["balance"]
    );
    const positionId = row["position id"] || "";
    const assetType = row["asset type"] || "";

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
      positionId: positionId || undefined,
      assetType: assetType || undefined,
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

// ─── eToro Dividends CSV Parser ─────────────────────────────────────────────
export function parseEtoroDividendsCSV(
  csvText: string
): ParseResult<EtoroDividend> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const warnings: string[] = [];
  const dividends: EtoroDividend[] = [];
  let skipped = 0;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const hasDate = headers.some((h) =>
    ["date of payment", "date"].includes(h)
  );
  const hasInstrument = headers.some((h) =>
    ["instrument name", "instrument"].includes(h)
  );

  if (!hasDate)
    warnings.push(
      `Date column not found. Expected "Date of Payment". Found: ${headers.join(", ")}`
    );
  if (!hasInstrument)
    warnings.push(
      `Instrument column not found. Expected "Instrument Name". Found: ${headers.join(", ")}`
    );

  for (const row of data) {
    const date = row["date of payment"] || row["date"] || "";
    const instrument = row["instrument name"] || row["instrument"] || "";
    const netDividendUSD = parseNum(row["net dividend received (usd)"]);
    const netDividendGBP = parseNum(row["net dividend received (gbp)"]);
    const withholdingTaxRateStr = (row["withholding tax rate (%)"] || "").replace(/%/g, "").trim();
    const withholdingTaxRate = parseFloat(withholdingTaxRateStr) || 0;
    const withholdingTaxUSD = parseNum(row["withholding tax amount (usd)"]);
    const withholdingTaxGBP = parseNum(row["withholding tax amount (gbp)"]);
    const positionId = row["position id"] || "";
    const type = row["type"] || "";
    const isin = row["isin"] || "";

    if (!date) {
      skipped++;
      continue;
    }

    dividends.push({
      id: genId("etoro-div"),
      date: parseFlexibleDate(date),
      instrument: instrument.trim(),
      netDividendUSD,
      netDividendGBP,
      withholdingTaxRate,
      withholdingTaxUSD,
      withholdingTaxGBP,
      positionId: positionId || undefined,
      type: type || undefined,
      isin: isin || undefined,
    });
  }

  if (skipped > 0) warnings.push(`${skipped} rows skipped (missing date)`);

  return {
    data: dividends.sort(
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
  | "monzo"
  | "revolut"
  | "starling"
  | "etoro-positions"
  | "etoro-transactions"
  | "etoro-dividends"
  | "standard-life"
  | "generic"
  | "unknown";

export function detectFileType(csvText: string): FileType {
  const headerLine = csvText.split("\n")[0]?.toLowerCase() || "";

  // Barclays
  if (
    headerLine.includes("money in") ||
    headerLine.includes("money out") ||
    (headerLine.includes("memo") && headerLine.includes("subcategory"))
  ) {
    return "barclays";
  }

  // Monzo (has emoji column or specific monzo headers)
  if (
    (headerLine.includes("name") && headerLine.includes("category") && headerLine.includes("emoji")) ||
    (headerLine.includes("created") && headerLine.includes("local_currency"))
  ) {
    return "monzo";
  }

  // Revolut
  if (
    headerLine.includes("started date") ||
    (headerLine.includes("state") && headerLine.includes("description") && headerLine.includes("amount"))
  ) {
    return "revolut";
  }

  // Starling
  if (
    headerLine.includes("counter party") ||
    headerLine.includes("counterparty") ||
    headerLine.includes("amount (gbp)")
  ) {
    return "starling";
  }

  // eToro dividends (must check before positions since both can have "instrument")
  if (
    headerLine.includes("date of payment") ||
    (headerLine.includes("net dividend") && headerLine.includes("withholding tax"))
  ) {
    return "etoro-dividends";
  }

  // eToro positions
  if (
    headerLine.includes("open rate") ||
    headerLine.includes("close rate") ||
    headerLine.includes("open price")
  ) {
    return "etoro-positions";
  }

  // eToro transactions (account activity)
  if (
    headerLine.includes("realized equity") ||
    (headerLine.includes("type") && headerLine.includes("account balance"))
  ) {
    return "etoro-transactions";
  }

  // Standard Life
  if (
    headerLine.includes("fund name") ||
    headerLine.includes("fund value") ||
    headerLine.includes("employer contributions") ||
    headerLine.includes("plan name")
  ) {
    return "standard-life";
  }

  // Generic fallback with date + amount
  if (headerLine.includes("date") && (headerLine.includes("amount") || headerLine.includes("debit"))) {
    return "generic";
  }

  return "unknown";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseNum(val: string | undefined): number {
  if (!val) return 0;
  // Extract the first number from the string (handles "1300.00 GBP eToroMoney" etc.)
  const cleaned = val.replace(/[£$,]/g, "").trim();
  const match = cleaned.match(/^-?\s*[\d.]+/);
  if (match) return parseFloat(match[0]) || 0;
  return parseFloat(cleaned) || 0;
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
