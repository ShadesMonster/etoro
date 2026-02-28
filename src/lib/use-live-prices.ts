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
  // fetch full portfolio from eToro API
  fetchPortfolio: () => Promise<void>;
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
  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const cached = getCachedPortfolio();
      if (cached) {
        setEtoroPortfolio(cached);
        setLastUpdated(new Date());
        setLoading(false);
        return;
      }

      const res = await fetch("/api/prices?action=portfolio");

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      const portfolio: EtoroPortfolio = {
        raw: data,
        credit: data.credit ?? data.availableBalance ?? data.cash,
        netEquity: data.netEquity ?? data.equity ?? data.totalValue,
        totalPL: data.totalPL ?? data.pnl ?? data.profit,
        totalPLPercent: data.totalPLPercent ?? data.pnlPercent,
        positions: data.positions ?? data.openPositions ?? data.trades,
      };

      setCachedPortfolio(portfolio);
      setEtoroPortfolio(portfolio);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch portfolio");
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
