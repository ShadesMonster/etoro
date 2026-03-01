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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInstruments(data: any): Record<number, string> {
  const names: Record<number, string> = {};
  if (!data || typeof data !== "object") return names;

  // Try known array field names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates: any[] = [
    data?.InstrumentDisplayDatas,
    data?.instrumentDisplayDatas,
    data?.instruments,
    data?.Instruments,
    data?.InstrumentData,
    data?.instrumentData,
    Array.isArray(data) ? data : null,
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let instruments: any[] = [];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      instruments = c;
      break;
    }
  }

  // Fallback: scan all values for arrays
  if (instruments.length === 0) {
    for (const val of Object.values(data)) {
      if (Array.isArray(val) && val.length > 0) {
        instruments = val;
        break;
      }
    }
  }

  for (const inst of instruments) {
    const id = inst.instrumentID ?? inst.InstrumentID ?? inst.InstrumentId;
    const name = inst.instrumentDisplayName ?? inst.InstrumentDisplayName ??
      inst.symbolFull ?? inst.SymbolFull ?? inst.name ?? inst.Name ??
      inst.InstrumentName ?? inst.instrumentName;
    if (id !== undefined && name) names[id] = name;
  }

  return names;
}

async function getInstrumentNames(): Promise<Record<number, string>> {
  if (instrumentCache && Date.now() - instrumentCache.timestamp < INSTRUMENT_CACHE_TTL) {
    return instrumentCache.data;
  }

  let names: Record<number, string> = {};

  // Strategy 1: eToro public API (authenticated)
  try {
    const metadataData = await etoroFetch("/market-data/instruments");
    names = extractInstruments(metadataData);
    if (Object.keys(names).length === 0) {
      console.log(`[eToro Metadata] Public API returned 0 instruments. Keys: ${Object.keys(metadataData || {}).join(", ")}. Sample: ${JSON.stringify(metadataData).slice(0, 300)}`);
    }
  } catch (e) {
    console.log(`[eToro Metadata] Public API failed: ${e instanceof Error ? e.message : e}`);
  }

  // Strategy 2: eToro static API (unauthenticated, well-known endpoint)
  if (Object.keys(names).length === 0) {
    try {
      const res = await fetch(
        "https://api.etorostatic.com/sapi/instrumentsmetadata/V1.1/instruments",
        { signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const data = await res.json();
        names = extractInstruments(data);
        console.log(`[eToro Metadata] Static API resolved ${Object.keys(names).length} instruments`);
      } else {
        console.log(`[eToro Metadata] Static API ${res.status}`);
      }
    } catch (e) {
      console.log(`[eToro Metadata] Static API failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Strategy 3: eToro static API alternate path
  if (Object.keys(names).length === 0) {
    try {
      const res = await fetch(
        "https://api.etorostatic.com/sapi/instrumentsmetadata/V1.1/instruments/bulk",
        { signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const data = await res.json();
        names = extractInstruments(data);
        console.log(`[eToro Metadata] Static bulk API resolved ${Object.keys(names).length} instruments`);
      }
    } catch (e) {
      console.log(`[eToro Metadata] Static bulk API failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`[eToro Metadata] Final: ${Object.keys(names).length} instrument names resolved`);

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
      // Fetch portfolio + rates + instrument names in parallel for a complete picture
      const [portfolioData, ratesData, instrumentNames] = await Promise.all([
        etoroFetch("/trading/info/portfolio"),
        etoroFetch("/market-data/instruments/rates").catch(() => null),
        getInstrumentNames().catch(() => ({} as Record<number, string>)),
      ]);

      // Build rates map
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ratesMap: Record<number, any> = {};
      if (ratesData) {
        const ratesArr = ratesData?.rates ?? (Array.isArray(ratesData) ? ratesData : []);
        for (const r of ratesArr) {
          const id = r.instrumentID ?? r.InstrumentID;
          if (id !== undefined) {
            ratesMap[id] = r;
            if (!instrumentNames[id]) {
              const name = r.instrumentDisplayName ?? r.InstrumentDisplayName ??
                r.symbolFull ?? r.SymbolFull ?? r.name ?? r.Name;
              if (name) instrumentNames[id] = name;
            }
          }
        }
      }

      const getName = (id: number) => instrumentNames[id] ?? `#${id}`;

      // Extract open positions from portfolio
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

      console.log("[eToro Portfolio]", {
        instruments: Object.keys(instrumentNames).length,
        positions: openPositions.length,
        ratesCount: Object.keys(ratesMap).length,
      });

      // Log raw portfolio structure for debugging deposit fields
      const cpDebug = portfolioData?.clientPortfolio ?? portfolioData;
      const mirrorsDebug = cpDebug?.mirrors ?? [];
      console.log("[eToro Portfolio Debug]", {
        topLevelKeys: Object.keys(portfolioData ?? {}),
        cpKeys: Object.keys(cpDebug ?? {}),
        cpCredit: cpDebug?.credit,
        cpEquity: cpDebug?.equity,
        cpNetDeposit: cpDebug?.netDeposit,
        cpTotalDeposit: cpDebug?.totalDeposit,
        cpTotalDeposited: cpDebug?.totalDeposited,
        cpDepositAmount: cpDebug?.depositAmount,
        cpAvailableAmount: cpDebug?.availableAmount,
        directPositionCount: cpDebug?.positions?.length ?? 0,
        mirrorCount: mirrorsDebug.length,
        mirrorKeys: mirrorsDebug.length > 0 ? Object.keys(mirrorsDebug[0]) : [],
        mirrorSample: mirrorsDebug.length > 0 ? {
          depositSummary: mirrorsDebug[0]?.depositSummary,
          withdrawalSummary: mirrorsDebug[0]?.withdrawalSummary,
          availableAmount: mirrorsDebug[0]?.availableAmount,
          credit: mirrorsDebug[0]?.credit,
          equity: mirrorsDebug[0]?.equity,
        } : null,
      });

      return NextResponse.json({
        ...portfolioData,
        _openPositions: openPositions,
        _instrumentCount: Object.keys(instrumentNames).length,
      }, {
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
      // Return raw metadata response for debugging
      let publicApiData = null;
      let publicApiError = null;
      let staticApiData = null;
      let staticApiError = null;

      try {
        publicApiData = await etoroFetch("/market-data/instruments");
      } catch (e) {
        publicApiError = e instanceof Error ? e.message : String(e);
      }

      try {
        const res = await fetch(
          "https://api.etorostatic.com/sapi/instrumentsmetadata/V1.1/instruments",
          { signal: AbortSignal.timeout(15000) }
        );
        if (res.ok) {
          staticApiData = await res.json();
        } else {
          staticApiError = `HTTP ${res.status}`;
        }
      } catch (e) {
        staticApiError = e instanceof Error ? e.message : String(e);
      }

      // Show shape info, not full data (can be huge)
      const summarize = (d: unknown) => {
        if (!d) return null;
        if (Array.isArray(d)) return { type: "array", length: d.length, sample: d[0] };
        if (typeof d === "object") {
          const keys = Object.keys(d as object);
          const summary: Record<string, unknown> = { type: "object", keys };
          for (const k of keys) {
            const v = (d as Record<string, unknown>)[k];
            if (Array.isArray(v)) summary[k] = { type: "array", length: v.length, sample: v[0] };
            else summary[k] = typeof v;
          }
          return summary;
        }
        return { type: typeof d };
      };

      return NextResponse.json({
        publicApi: publicApiError ? { error: publicApiError } : summarize(publicApiData),
        staticApi: staticApiError ? { error: staticApiError } : summarize(staticApiData),
        resolvedNames: Object.keys(await getInstrumentNames().catch(() => ({}))).length,
      });
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
        unresolved,
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
