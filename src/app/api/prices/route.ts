import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const ETORO_BASE_URL = "https://public-api.etoro.com/api/v1";

function getEtoroHeaders(): Record<string, string> {
  const apiKey = process.env.ETORO_API_KEY;
  const userKey = process.env.ETORO_USER_KEY;

  if (!apiKey) throw new Error("ETORO_API_KEY not set in environment");

  const headers: Record<string, string> = {
    "x-request-id": randomUUID(),
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  };

  // User key is optional - some endpoints may work with just the API key
  if (userKey && userKey !== "PASTE_YOUR_GENERATED_USER_KEY_HERE") {
    headers["x-user-key"] = userKey;
  }

  return headers;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function etoroFetch(path: string): Promise<any> {
  const res = await fetch(`${ETORO_BASE_URL}${path}`, {
    headers: getEtoroHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eToro API ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

// GET /api/prices?action=portfolio - fetch full portfolio from eToro
// GET /api/prices?action=rates&instruments=AAPL,TSLA - fetch market rates
// GET /api/prices?action=search&q=Apple - search instruments
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "portfolio";

  try {
    if (action === "portfolio") {
      // Fetch real portfolio - positions, balance, P/L
      const data = await etoroFetch("/trading/info/portfolio");
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      });
    }

    if (action === "rates") {
      // Fetch market rates for instruments
      const instruments = req.nextUrl.searchParams.get("instruments") || "";
      const path = instruments
        ? `/market-data/instruments/rates?instruments=${encodeURIComponent(instruments)}`
        : "/market-data/instruments/rates";
      const data = await etoroFetch(path);
      return NextResponse.json(data);
    }

    if (action === "search") {
      const q = req.nextUrl.searchParams.get("q") || "";
      if (!q) return NextResponse.json({ results: [] });
      const data = await etoroFetch(
        `/market-data/search?internalSymbolFull=${encodeURIComponent(q)}`
      );
      return NextResponse.json(data);
    }

    if (action === "metadata") {
      const data = await etoroFetch("/market-data/instruments");
      return NextResponse.json(data);
    }

    if (action === "history") {
      const data = await etoroFetch("/trading/info/trade/history");
      return NextResponse.json(data);
    }

    if (action === "pnl") {
      // Try many equity/balance/PnL endpoints
      const endpoints = [
        "/trading/info/balance",
        "/trading/info/credit",
        "/trading/info/account",
        "/trading/info/account/balance",
        "/trading/info/equity",
        "/trading/info/equity/current",
        "/trading/info/pnl",
        "/trading/info/portfolio/summary",
        "/trading/info/portfolio/overview",
        "/trading/info/portfolio/value",
        "/trading/info/portfolio/equity",
        "/sapi/trade-real/portfolio",
        "/sapi/trade-real/equity",
        "/sapi/trade-real/balance",
        "/sapi/userstats/gain",
        "/user/portfolio",
        "/user/info",
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: { endpoint: string; data: any }[] = [];
      const errors: { endpoint: string; error: string }[] = [];

      for (const endpoint of endpoints) {
        try {
          const data = await etoroFetch(endpoint);
          console.log(`[eToro API] Endpoint ${endpoint} succeeded:`, JSON.stringify(data).slice(0, 500));
          results.push({ endpoint, data });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          console.log(`[eToro API] Endpoint ${endpoint} failed:`, msg);
          errors.push({ endpoint, error: msg });
        }
      }

      if (results.length > 0) {
        return NextResponse.json({ results, errors });
      }
      return NextResponse.json({ error: "No equity endpoint available", errors }, { status: 404 });
    }

    if (action === "debug") {
      // Fetch portfolio and return all field names at every level
      const data = await etoroFetch("/trading/info/portfolio");
      const cp = data?.clientPortfolio ?? data;

      // Helper to get keys and types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const describeObj = (obj: any, maxDepth = 2, depth = 0): any => {
        if (obj === null || obj === undefined) return null;
        if (Array.isArray(obj)) {
          return { _type: "array", _length: obj.length, _sample: obj.length > 0 ? describeObj(obj[0], maxDepth, depth + 1) : null };
        }
        if (typeof obj === "object" && depth < maxDepth) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = {};
          for (const [key, val] of Object.entries(obj)) {
            if (typeof val === "number" || typeof val === "string" || typeof val === "boolean" || val === null) {
              result[key] = val;
            } else if (Array.isArray(val)) {
              result[key] = { _type: "array", _length: val.length, _sample: val.length > 0 ? describeObj(val[0], maxDepth, depth + 1) : null };
            } else if (typeof val === "object") {
              result[key] = describeObj(val, maxDepth, depth + 1);
            }
          }
          return result;
        }
        return typeof obj;
      };

      const structure = describeObj(cp, 3);

      // Also check top-level response keys (beyond clientPortfolio)
      const topLevelKeys = Object.keys(data || {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const topLevelNumericFields: Record<string, any> = {};
      for (const key of topLevelKeys) {
        const val = data[key];
        if (typeof val === "number") topLevelNumericFields[key] = val;
        if (typeof val === "string" && !isNaN(Number(val))) topLevelNumericFields[key] = val;
      }

      return NextResponse.json({
        topLevelKeys,
        topLevelNumericFields,
        clientPortfolioStructure: structure,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("eToro API error:", e);

    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("not set") ? 503 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

// Keep POST for backward compatibility (live price hook uses it)
// Now proxies through eToro market-data/rates
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = body.symbols || [];

    if (symbols.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    // Try eToro rates endpoint
    const data = await etoroFetch(
      `/market-data/instruments/rates?instruments=${encodeURIComponent(symbols.join(","))}`
    );

    // Transform eToro response to our price format
    // eToro uses PascalCase: InstrumentID, Ask, Bid, LastExecution
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices: Record<string, any> = {};
    if (Array.isArray(data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of data as any[]) {
        const symbol = item.InstrumentID ?? item.instrumentId ?? item.symbol ?? item.name;
        if (symbol) {
          prices[symbol] = {
            price: item.LastExecution ?? item.Ask ?? item.Bid ?? item.lastPrice ?? item.ask ?? item.bid ?? 0,
            change: item.Change ?? item.change ?? 0,
            changePercent: item.ChangePercent ?? item.changePercent ?? 0,
            currency: item.Currency ?? item.currency ?? "USD",
            name: item.InstrumentName ?? item.instrumentName ?? item.name ?? symbol,
          };
        }
      }
    } else if (data && typeof data === "object" && !data.InstrumentID) {
      // Handle if response is keyed by instrument
      for (const [key, val] of Object.entries(data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = val as any;
        prices[key] = {
          price: item.LastExecution ?? item.Ask ?? item.Bid ?? item.lastPrice ?? item.ask ?? item.bid ?? 0,
          change: item.Change ?? item.change ?? 0,
          changePercent: item.ChangePercent ?? item.changePercent ?? 0,
          currency: item.Currency ?? item.currency ?? "USD",
          name: item.InstrumentName ?? item.instrumentName ?? item.name ?? key,
        };
      }
    } else if (data && data.InstrumentID) {
      // Single rate object
      prices[data.InstrumentID] = {
        price: data.LastExecution ?? data.Ask ?? data.Bid ?? 0,
        change: data.Change ?? 0,
        changePercent: data.ChangePercent ?? 0,
        currency: data.Currency ?? "USD",
        name: data.InstrumentName ?? String(data.InstrumentID),
      };
    }

    return NextResponse.json({ prices });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
