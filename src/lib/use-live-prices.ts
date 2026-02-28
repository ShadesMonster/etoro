"use client";

import { useState, useCallback } from "react";

interface LivePrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface EtoroPortfolio {
  raw: Record<string, unknown>;
  // Parsed fields - we'll populate what the API gives us
  credit?: number;
  netEquity?: number;
  totalPL?: number;
  totalPLPercent?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  positions?: any[];
  // Whether we successfully got data from the API (even if some fields are missing)
  connected: boolean;
}

interface UseLivePricesResult {
  // instrument name → live price data
  prices: Record<string, LivePrice>;
  // Full eToro portfolio data (if available)
  etoroPortfolio: EtoroPortfolio | null;
  // instrument names we couldn't resolve to tickers
  unmapped: string[];
  // loading state
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  // trigger a refresh
  fetchPrices: (instrumentNames: string[]) => Promise<void>;
  // fetch full portfolio from eToro API (skipCache=true to force fresh fetch)
  fetchPortfolio: (skipCache?: boolean) => Promise<void>;
}

const CACHE_KEY = "etoro-portfolio-cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedPortfolio(): EtoroPortfolio | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function setCachedPortfolio(data: EtoroPortfolio) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // localStorage full or unavailable
  }
}

export function useLivePrices(): UseLivePricesResult {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [etoroPortfolio, setEtoroPortfolio] = useState<EtoroPortfolio | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch full portfolio directly from eToro API
  const fetchPortfolio = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);

    try {
      // Check cache first (unless skipping)
      if (!skipCache) {
        const cached = getCachedPortfolio();
        if (cached) {
          setEtoroPortfolio(cached);
          setLastUpdated(new Date());
          setLoading(false);
          return;
        }
      }

      console.log("[eToro API] Fetching portfolio...");
      const res = await fetch("/api/prices?action=portfolio");

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error || `HTTP ${res.status}`;
        console.error("[eToro API] Error:", errMsg);
        throw new Error(errMsg);
      }

      const data = await res.json();
      console.log("[eToro API] Raw response:", data);

      // eToro API uses PascalCase field names
      // Portfolio response may be nested: data.Content.ClientPortfolio or flat
      const clientPortfolio = data?.Content?.ClientPortfolio ?? data?.ClientPortfolio ?? data;

      // Positions are in the portfolio object
      const positions = clientPortfolio?.Positions ?? clientPortfolio?.positions ?? data?.Positions ?? data?.positions;

      // Compute total P/L from positions if available
      let totalPLFromPositions: number | undefined;
      if (Array.isArray(positions)) {
        totalPLFromPositions = positions.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sum: number, p: any) => sum + (p.NetProfit ?? p.netProfit ?? 0),
          0
        );
      }

      // Net equity = credit + sum of position values
      let netEquity: number | undefined;
      const credit = clientPortfolio?.Credit ?? clientPortfolio?.credit ?? data?.Credit ?? data?.credit;
      if (credit !== undefined && Array.isArray(positions)) {
        const positionsValue = positions.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sum: number, p: any) => sum + (p.Amount ?? p.amount ?? 0) + (p.NetProfit ?? p.netProfit ?? 0),
          0
        );
        netEquity = credit + positionsValue;
      }

      const portfolio: EtoroPortfolio = {
        raw: data,
        credit,
        netEquity: netEquity ?? data?.netEquity ?? data?.equity,
        totalPL: totalPLFromPositions ?? data?.totalPL ?? data?.TotalPL ?? data?.pnl,
        totalPLPercent: data?.totalPLPercent ?? data?.TotalPLPercent ?? data?.pnlPercent,
        positions,
        connected: true,
      };

      console.log("[eToro API] Parsed portfolio:", {
        credit: portfolio.credit,
        netEquity: portfolio.netEquity,
        totalPL: portfolio.totalPL,
        positionCount: Array.isArray(positions) ? positions.length : "N/A",
      });

      setCachedPortfolio(portfolio);
      setEtoroPortfolio(portfolio);
      setLastUpdated(new Date());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch portfolio";
      console.error("[eToro API] Failed:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch market rates for specific instruments (fallback if portfolio doesn't include prices)
  const fetchPrices = useCallback(
    async (instrumentNames: string[]) => {
      if (instrumentNames.length === 0) return;

      setLoading(true);
      setError(null);

      try {
        // Send instrument names directly to eToro search/rates
        const res = await fetch("/api/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: instrumentNames }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        if (data.error) throw new Error(data.error);

        // Map instrument names to their price data
        const instrumentPrices: Record<string, LivePrice> = {};
        const unresolvedNames: string[] = [];

        if (data.prices) {
          for (const [key, val] of Object.entries(data.prices)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const item = val as any;
            if (item && item.price > 0) {
              instrumentPrices[key] = {
                symbol: key,
                price: item.price,
                change: item.change || 0,
                changePercent: item.changePercent || 0,
                currency: item.currency || "USD",
                name: item.name || key,
              };
            }
          }
        }

        // Track unresolved
        for (const name of instrumentNames) {
          if (!instrumentPrices[name]) {
            unresolvedNames.push(name);
          }
        }

        setPrices(instrumentPrices);
        setUnmapped(unresolvedNames);
        setLastUpdated(new Date());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch prices");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    prices,
    etoroPortfolio,
    unmapped,
    loading,
    error,
    lastUpdated,
    fetchPrices,
    fetchPortfolio,
  };
}
