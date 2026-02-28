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
  credit?: number;
  netEquity?: number;
  totalPL?: number;
  totalPLPercent?: number;
  totalInvested?: number;
  depositSummary?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  positions?: any[];
  connected: boolean;
}

interface UseLivePricesResult {
  prices: Record<string, LivePrice>;
  etoroPortfolio: EtoroPortfolio | null;
  unmapped: string[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  fetchPrices: (instrumentNames: string[]) => Promise<void>;
  fetchPortfolio: (skipCache?: boolean) => Promise<void>;
}

const CACHE_KEY = "etoro-portfolio-cache";
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

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

  // Fetch full portfolio + live rates from eToro API
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

      console.log("[eToro API] Fetching portfolio + rates...");

      // Step 1: Fetch portfolio (positions, credit, etc.)
      const portfolioRes = await fetch("/api/prices?action=portfolio");
      if (!portfolioRes.ok) {
        const data = await portfolioRes.json().catch(() => ({}));
        throw new Error(data.error || `Portfolio HTTP ${portfolioRes.status}`);
      }
      const portfolioData = await portfolioRes.json();
      const cp = portfolioData?.clientPortfolio ?? portfolioData;

      const credit = cp?.credit ?? 0;
      const depositSummary = cp?.depositSummary ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const directPositions: any[] = cp?.positions ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mirrors: any[] = cp?.mirrors ?? [];

      // Mirror/CopyTrader entries contain nested positions
      // Each mirror has an investedAmount and may have sub-positions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mirrorPositions: any[] = [];
      let totalMirrorInvested = 0;
      for (const m of mirrors) {
        totalMirrorInvested += m.investedAmount ?? m.amount ?? 0;
        if (Array.isArray(m.positions)) {
          mirrorPositions.push(...m.positions);
        }
      }

      // Combine direct positions + mirror sub-positions
      const allPositions = [...directPositions, ...mirrorPositions];

      console.log("[eToro API] Portfolio:", {
        credit,
        depositSummary,
        directPositions: directPositions.length,
        mirrors: mirrors.length,
        mirrorPositions: mirrorPositions.length,
        totalMirrorInvested,
        allPositions: allPositions.length,
      });

      // Log first mirror to understand structure
      if (mirrors.length > 0) {
        console.log("[eToro API] Sample mirror:", mirrors[0]);
      }
      if (directPositions.length > 0) {
        console.log("[eToro API] Sample position:", directPositions[0]);
      }

      // Step 2: Fetch live rates for all instrument IDs in the portfolio
      const instrumentIDs = [...new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allPositions.map((p: any) => p.instrumentID).filter((id: unknown) => id !== undefined)
      )];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ratesMap: Record<number, any> = {};

      if (instrumentIDs.length > 0) {
        const ratesRes = await fetch(
          `/api/prices?action=rates&instruments=${encodeURIComponent(instrumentIDs.join(","))}`
        );
        if (ratesRes.ok) {
          const ratesData = await ratesRes.json();
          console.log("[eToro API] Rates response:", ratesData);

          // Build a map of instrumentID → rate data
          if (Array.isArray(ratesData)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const r of ratesData as any[]) {
              const id = r.instrumentID ?? r.InstrumentID ?? r.instrumentId;
              if (id !== undefined) ratesMap[id] = r;
            }
          } else if (ratesData && typeof ratesData === "object") {
            // Could be keyed by instrument ID or have a rates array
            if (ratesData.rates && Array.isArray(ratesData.rates)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              for (const r of ratesData.rates as any[]) {
                const id = r.instrumentID ?? r.InstrumentID ?? r.instrumentId;
                if (id !== undefined) ratesMap[id] = r;
              }
            } else {
              // Try as keyed object
              for (const [key, val] of Object.entries(ratesData)) {
                const numKey = Number(key);
                if (!isNaN(numKey)) {
                  ratesMap[numKey] = val;
                }
              }
            }
          }
        } else {
          console.warn("[eToro API] Rates fetch failed, continuing with portfolio only");
        }
      }

      console.log("[eToro API] Rates mapped for", Object.keys(ratesMap).length, "instruments");

      // Step 3: Compute portfolio value
      // For direct positions: currentValue = units * currentRate
      // For mirrors: use investedAmount (mirrors may not expose sub-positions)
      // Portfolio value = credit + sum(position values) + sum(mirror values)
      let totalCurrentValue = 0;
      let totalInvested = 0;

      // Value direct positions using live rates
      for (const pos of directPositions) {
        const invested = pos.amount ?? 0;
        totalInvested += invested;

        const rate = ratesMap[pos.instrumentID];
        if (rate) {
          const currentPrice = pos.isBuy
            ? (rate.ask ?? rate.Ask ?? rate.lastExecution ?? rate.LastExecution ?? pos.openRate)
            : (rate.bid ?? rate.Bid ?? rate.lastExecution ?? rate.LastExecution ?? pos.openRate);
          const units = pos.units ?? (invested / pos.openRate);
          const currentValue = units * currentPrice;
          totalCurrentValue += currentValue;
        } else {
          totalCurrentValue += invested;
        }
      }

      // Value mirror sub-positions using live rates (if mirrors have sub-positions)
      if (mirrorPositions.length > 0) {
        for (const pos of mirrorPositions) {
          const invested = pos.amount ?? 0;
          totalInvested += invested;

          const rate = ratesMap[pos.instrumentID];
          if (rate) {
            const currentPrice = pos.isBuy
              ? (rate.ask ?? rate.Ask ?? rate.lastExecution ?? rate.LastExecution ?? pos.openRate)
              : (rate.bid ?? rate.Bid ?? rate.lastExecution ?? rate.LastExecution ?? pos.openRate);
            const units = pos.units ?? (invested / pos.openRate);
            const currentValue = units * currentPrice;
            totalCurrentValue += currentValue;
          } else {
            totalCurrentValue += invested;
          }
        }
      } else {
        // Mirrors don't have sub-positions exposed - use investedAmount as value
        // This is a rough estimate; P/L from mirrors won't be included
        totalCurrentValue += totalMirrorInvested;
        totalInvested += totalMirrorInvested;
      }

      const netEquity = credit + totalCurrentValue;
      // Use depositSummary if available, else total invested from positions
      const effectiveDeposited = depositSummary > 0 ? depositSummary : totalInvested;
      const totalPL = netEquity - effectiveDeposited;
      const totalPLPercent = effectiveDeposited > 0 ? (totalPL / effectiveDeposited) * 100 : 0;

      console.log("[eToro API] Computed values:", {
        credit,
        totalCurrentValue,
        netEquity,
        totalPL,
        totalPLPercent: totalPLPercent.toFixed(2) + "%",
        depositSummary,
        totalInvested,
        totalMirrorInvested,
        directPositions: directPositions.length,
        mirrorSubPositions: mirrorPositions.length,
        ratesFound: Object.keys(ratesMap).length,
        ratesMissing: instrumentIDs.length - Object.keys(ratesMap).length,
      });

      const portfolio: EtoroPortfolio = {
        raw: portfolioData,
        credit,
        netEquity,
        totalPL,
        totalPLPercent,
        totalInvested,
        depositSummary,
        positions: allPositions,
        connected: true,
      };

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

  // Fetch market rates for specific instruments
  const fetchPrices = useCallback(
    async (instrumentNames: string[]) => {
      if (instrumentNames.length === 0) return;

      setLoading(true);
      setError(null);

      try {
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
