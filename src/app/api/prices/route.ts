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

// In-memory cache for instrument metadata (large response, changes rarely)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let instrumentCache: { data: Record<number, string>; timestamp: number } | null = null;
const INSTRUMENT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getInstrumentNames(): Promise<Record<number, string>> {
  if (instrumentCache && Date.now() - instrumentCache.timestamp < INSTRUMENT_CACHE_TTL) {
    return instrumentCache.data;
  }

  const metadataData = await etoroFetch("/market-data/instruments");
  const names: Record<number, string> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instruments: any[] = metadataData?.instruments ?? metadataData?.Instruments ??
    (Array.isArray(metadataData) ? metadataData : []);

  for (const inst of instruments) {
    const id = inst.instrumentID ?? inst.InstrumentID;
    const name = inst.instrumentDisplayName ?? inst.InstrumentDisplayName ??
      inst.symbolFull ?? inst.SymbolFull ?? inst.name ?? inst.Name;
    if (id !== undefined && name) names[id] = name;
  }

  instrumentCache = { data: names, timestamp: Date.now() };
  return names;
}

// GET /api/prices?action=portfolio  - fetch full portfolio from eToro
// GET /api/prices?action=rates      - fetch market rates
// GET /api/prices?action=sync       - full sync: positions + history + instrument names
// GET /api/prices?action=search&q=  - search instruments
// GET /api/prices?action=metadata   - list all instruments
// GET /api/prices?action=history    - trade history
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

    if (action === "sync") {
      // Full sync: fetch portfolio + rates + history + instrument names in parallel
      const [portfolioData, ratesData, historyData, instrumentNames] = await Promise.all([
        etoroFetch("/trading/info/portfolio"),
        etoroFetch("/market-data/instruments/rates").catch(() => null),
        etoroFetch("/trading/info/trade/history").catch(() => null),
        getInstrumentNames().catch(() => ({} as Record<number, string>)),
      ]);

      // Build rates map for current prices, also extract names as fallback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ratesMap: Record<number, any> = {};
      if (ratesData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ratesArr: any[] = ratesData?.rates ?? (Array.isArray(ratesData) ? ratesData : []);
        for (const r of ratesArr) {
          const id = r.instrumentID ?? r.InstrumentID;
          if (id !== undefined) {
            ratesMap[id] = r;
            // Use rate's instrument name as fallback if metadata didn't have it
            if (!instrumentNames[id]) {
              const name = r.instrumentDisplayName ?? r.InstrumentDisplayName ??
                r.symbolFull ?? r.SymbolFull ?? r.name ?? r.Name;
              if (name) instrumentNames[id] = name;
            }
          }
        }
      }

      const getName = (id: number) => instrumentNames[id] ?? `#${id}`;

      // === OPEN POSITIONS from portfolio ===
      const cp = portfolioData?.clientPortfolio ?? portfolioData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allOpen: any[] = [...(cp?.positions ?? [])];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of (cp?.mirrors ?? []) as any[]) {
        if (Array.isArray(m.positions)) allOpen.push(...m.positions);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openPositions = allOpen.map((pos: any) => {
        const rate = ratesMap[pos.instrumentID];
        const currentPrice = rate
          ? (pos.isBuy ? (rate.bid ?? rate.Bid ?? 0) : (rate.ask ?? rate.Ask ?? 0))
          : 0;
        const direction = pos.isBuy ? 1 : -1;
        const convRate = pos.openConversionRate ?? 1;
        const upl = currentPrice > 0
          ? direction * pos.units * (currentPrice - (pos.openRate ?? 0)) * convRate
          : 0;
        const profit = upl + (pos.totalFees ?? 0);
        const amount = pos.amount ?? 0;
        const profitPercent = amount > 0 ? (profit / amount) * 100 : 0;

        return {
          id: `api:open:${pos.positionID}`,
          instrument: getName(pos.instrumentID),
          units: pos.units ?? 0,
          openRate: pos.openRate ?? 0,
          currentRate: currentPrice,
          profit,
          profitPercent,
          openDate: pos.openDateTime ?? "",
          type: pos.isBuy ? "buy" : "sell",
          status: "open",
          positionId: String(pos.positionID ?? ""),
          amount,
          leverage: pos.leverage ?? 1,
        };
      });

      // === CLOSED POSITIONS from trade history ===
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let closedRaw: any[] = [];
      if (historyData) {
        // Handle various response shapes
        const candidates = [
          historyData.closedPositions,
          historyData.publicHistoryPositions,
          historyData.positions,
          historyData.trades,
          historyData.history,
          Array.isArray(historyData) ? historyData : null,
        ];
        for (const c of candidates) {
          if (Array.isArray(c) && c.length > 0) {
            closedRaw = c;
            break;
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const closedPositions = closedRaw.map((pos: any) => {
        const profit = pos.netProfit ?? pos.profit ?? pos.realizedPL ?? 0;
        const amount = pos.amount ?? pos.investedAmount ?? 0;
        const profitPercent = amount > 0 ? (profit / amount) * 100 : 0;

        return {
          id: `api:closed:${pos.positionID ?? pos.tradeID ?? Math.random().toString(36).slice(2)}`,
          instrument: getName(pos.instrumentID),
          units: pos.units ?? 0,
          openRate: pos.openRate ?? 0,
          currentRate: pos.closeRate ?? pos.closedRate ?? 0,
          profit,
          profitPercent,
          openDate: pos.openDateTime ?? "",
          closeDate: pos.closeDateTime ?? pos.closedDateTime ?? "",
          type: pos.isBuy ? "buy" : "sell",
          status: "closed",
          positionId: String(pos.positionID ?? ""),
          amount,
          leverage: pos.leverage ?? 1,
        };
      });

      const unresolved = [...openPositions, ...closedPositions]
        .filter((p) => p.instrument.startsWith("#")).length;
      console.log("[eToro Sync]", {
        instruments: Object.keys(instrumentNames).length,
        open: openPositions.length,
        closed: closedPositions.length,
        unresolved,
        historyKeys: historyData ? Object.keys(historyData) : null,
      });

      return NextResponse.json({
        openPositions,
        closedPositions,
        instrumentCount: Object.keys(instrumentNames).length,
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
