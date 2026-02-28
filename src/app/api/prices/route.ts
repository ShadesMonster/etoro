import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = require("yahoo-finance2").default || require("yahoo-finance2") as any;

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  name: string;
}

// POST /api/prices - fetch prices for multiple symbols in one batch
// Body: { symbols: ["AAPL", "TSLA", "BTC-USD"] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = body.symbols || [];

    if (symbols.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    // Limit to 100 symbols per request, deduplicate
    const limited = [...new Set(symbols)].slice(0, 100);

    const prices: Record<string, PriceData> = {};

    // Fetch in parallel batches of 10
    for (let i = 0; i < limited.length; i += 10) {
      const batch = limited.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(async (symbol) => {
          // Single symbol quote returns a Quote object
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const q: any = await yahooFinance.quote(symbol);
          return { symbol, q };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          const { symbol, q } = result.value;
          if (q) {
            const sym = (q.symbol as string) || symbol;
            prices[sym] = {
              price: (q.regularMarketPrice as number) ?? 0,
              change: (q.regularMarketChange as number) ?? 0,
              changePercent: (q.regularMarketChangePercent as number) ?? 0,
              currency: (q.currency as string) ?? "USD",
              name: (q.shortName as string) ?? (q.longName as string) ?? "",
            };
          }
        }
      }
    }

    return NextResponse.json(
      { prices },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    console.error("Yahoo Finance error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch prices" },
      { status: 500 }
    );
  }
}

// GET /api/prices?q=Apple - search for ticker symbol by name
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any = await yahooFinance.search(q, { quotesCount: 5, newsCount: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = (results.quotes || []).map((item: any) => ({
      symbol: item.symbol || "",
      name: item.shortname || item.longname || "",
      type: item.quoteType || "",
    }));
    return NextResponse.json({ results: quotes });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
