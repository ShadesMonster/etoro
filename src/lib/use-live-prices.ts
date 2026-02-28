"use client";

import { useState, useCallback } from "react";
import { useFinanceStore } from "./store";
import { resolveTickerFromName } from "./ticker-map";

interface LivePrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  name: string;
}

interface UseLivePricesResult {
  // instrument name → live price data
  prices: Record<string, LivePrice>;
  // instrument names we couldn't resolve to tickers
  unmapped: string[];
  // loading state
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  // trigger a refresh
  fetchPrices: (instrumentNames: string[]) => Promise<void>;
}

const CACHE_KEY = "live-prices-cache";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

interface PriceCache {
  prices: Record<string, LivePrice>;
  timestamp: number;
}

function getCachedPrices(): PriceCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache: PriceCache = JSON.parse(raw);
    if (Date.now() - cache.timestamp > CACHE_TTL) return null;
    return cache;
  } catch {
    return null;
  }
}

function setCachedPrices(prices: Record<string, LivePrice>) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ prices, timestamp: Date.now() })
    );
  } catch {
    // localStorage full or unavailable
  }
}

export function useLivePrices(): UseLivePricesResult {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { tickerMappings, setTickerMappings } = useFinanceStore();

  const fetchPrices = useCallback(
    async (instrumentNames: string[]) => {
      if (instrumentNames.length === 0) return;

      setLoading(true);
      setError(null);

      try {
        // Deduplicate instrument names
        const uniqueNames = [...new Set(instrumentNames)];

        // Resolve instrument names to ticker symbols
        const resolvedMappings: Record<string, string> = {};
        const unresolvedNames: string[] = [];

        for (const name of uniqueNames) {
          // Check user's saved mappings first
          const savedTicker = tickerMappings[name];
          if (savedTicker) {
            resolvedMappings[name] = savedTicker;
            continue;
          }

          // Try automatic resolution
          const ticker = resolveTickerFromName(name);
          if (ticker) {
            resolvedMappings[name] = ticker;
          } else {
            unresolvedNames.push(name);
          }
        }

        // Try to auto-resolve unmapped names via Yahoo Finance search
        for (const name of unresolvedNames) {
          try {
            const res = await fetch(
              `/api/prices?q=${encodeURIComponent(name)}`
            );
            if (res.ok) {
              const data = await res.json();
              const results = data.results || [];
              // Pick the first stock/ETF/crypto result
              const match = results.find(
                (r: { type: string }) =>
                  r.type === "EQUITY" ||
                  r.type === "ETF" ||
                  r.type === "CRYPTOCURRENCY"
              );
              if (match?.symbol) {
                resolvedMappings[name] = match.symbol;
                // Remove from unresolved
                const idx = unresolvedNames.indexOf(name);
                if (idx >= 0) unresolvedNames.splice(idx, 1);
              }
            }
          } catch {
            // Search failed, leave as unmapped
          }
        }

        // Save all resolved mappings for future use
        if (Object.keys(resolvedMappings).length > 0) {
          setTickerMappings(resolvedMappings);
        }

        setUnmapped(unresolvedNames);

        // Get the unique symbols to fetch
        const symbols = [...new Set(Object.values(resolvedMappings))];

        if (symbols.length === 0) {
          setLoading(false);
          return;
        }

        // Check cache first
        const cache = getCachedPrices();
        const cachedSymbols = cache ? Object.keys(cache.prices) : [];
        const missingSymbols = symbols.filter(
          (s) => !cachedSymbols.includes(s)
        );

        let allPriceData: Record<
          string,
          { price: number; change: number; changePercent: number; currency: string; name: string }
        > = cache?.prices
          ? Object.fromEntries(
              Object.entries(cache.prices).map(([k, v]) => [k, v])
            )
          : {};

        // Fetch missing prices from API
        if (missingSymbols.length > 0 || !cache) {
          const symbolsToFetch = cache ? missingSymbols : symbols;
          if (symbolsToFetch.length > 0) {
            const res = await fetch("/api/prices", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ symbols: symbolsToFetch }),
            });

            if (!res.ok) {
              throw new Error(`Failed to fetch prices: ${res.status}`);
            }

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            allPriceData = { ...allPriceData, ...data.prices };
          }
        }

        // Map instrument names to their price data
        const instrumentPrices: Record<string, LivePrice> = {};
        for (const [name, symbol] of Object.entries(resolvedMappings)) {
          const priceData = allPriceData[symbol];
          if (priceData && priceData.price > 0) {
            instrumentPrices[name] = {
              symbol,
              price: priceData.price,
              change: priceData.change,
              changePercent: priceData.changePercent,
              currency: priceData.currency,
              name: priceData.name,
            };
          }
        }

        // Cache all fetched prices
        const cachePrices: Record<string, LivePrice> = {};
        for (const [symbol, data] of Object.entries(allPriceData)) {
          if (data && data.price > 0) {
            cachePrices[symbol] = {
              symbol,
              price: data.price,
              change: data.change,
              changePercent: data.changePercent,
              currency: data.currency,
              name: data.name,
            };
          }
        }
        setCachedPrices(cachePrices);

        setPrices(instrumentPrices);
        setLastUpdated(new Date());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch prices");
      } finally {
        setLoading(false);
      }
    },
    [tickerMappings, setTickerMappings]
  );

  return { prices, unmapped, loading, error, lastUpdated, fetchPrices };
}
