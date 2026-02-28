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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mirrors?: any[];
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

  const fetchPortfolio = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);

    try {
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

      // Fetch portfolio
      const portfolioRes = await fetch("/api/prices?action=portfolio");

      if (!portfolioRes.ok) {
        const data = await portfolioRes.json().catch(() => ({}));
        throw new Error(data.error || `Portfolio HTTP ${portfolioRes.status}`);
      }

      const portfolioData = await portfolioRes.json();
      const cp = portfolioData?.clientPortfolio ?? portfolioData;

      const topCredit = cp?.credit ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const directPositions: any[] = cp?.positions ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mirrors: any[] = cp?.mirrors ?? [];

      // === COMPUTE FROM MIRROR-LEVEL SUMMARY DATA ===
      // Each mirror has: depositSummary, withdrawalSummary, closedPositionsNetProfit,
      // availableAmount, initialInvestment, positions[]
      // Mirror positions have copier's real units, amount, and openRate.
      // Portfolio value = totalAvailable + sum(position.units * currentPrice)

      let totalDeposited = 0;
      let totalWithdrawn = 0;
      let totalClosedPL = 0;
      let totalAvailable = topCredit;
      let totalOpenPositionCount = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mirrorSummaries: any[] = [];

      for (const m of mirrors) {
        const dep = m.depositSummary ?? 0;
        const wd = m.withdrawalSummary ?? 0;
        const closedPL = m.closedPositionsNetProfit ?? 0;
        const avail = m.availableAmount ?? 0;
        const posCount = Array.isArray(m.positions) ? m.positions.length : 0;

        totalDeposited += dep;
        totalWithdrawn += wd;
        totalClosedPL += closedPL;
        totalAvailable += avail;
        totalOpenPositionCount += posCount;

        mirrorSummaries.push({
          parentUsername: m.parentUsername,
          depositSummary: dep,
          withdrawalSummary: wd,
          closedPL,
          availableAmount: avail,
          netCashIn: dep - wd,
          openPositions: posCount,
        });
      }

      // Add direct position amounts
      for (const pos of directPositions) {
        totalOpenPositionCount += 1;
      }

      const netDeposited = totalDeposited - totalWithdrawn;

      console.log("[eToro API] Mirror summaries:", mirrorSummaries);
      console.log("[eToro API] Totals:", {
        topCredit,
        totalDeposited,
        totalWithdrawn,
        netDeposited,
        totalClosedPL,
        totalAvailable,
        totalOpenPositionCount,
        directPositions: directPositions.length,
        mirrors: mirrors.length,
      });

      // === DETERMINE PORTFOLIO VALUE ===
      // Compute from positions (copier's real units) + live rates
      let netEquity: number | undefined;
      let totalPL: number | undefined;
      let totalPLPercent: number | undefined;

      // If PnL endpoint didn't give us equity, compute from positions + rates
      // Mirror positions have the COPIER's real data:
      //   - units: copier's actual units (verified: units * openRate = amount)
      //   - amount: copier's invested amount in dollars
      //   - openRate: the price when position was opened
      // Only the top-level direct position has zeros for openRate/amount.
      if (netEquity === undefined) {
        console.log("[eToro API] Computing equity from positions + live rates...");
        const ratesRes = await fetch("/api/prices?action=rates").catch(() => null);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ratesMap: Record<number, any> = {};
        if (ratesRes && ratesRes.ok) {
          const ratesData = await ratesRes.json();
          const ratesArr = ratesData?.rates ?? (Array.isArray(ratesData) ? ratesData : []);
          for (const r of ratesArr) {
            const id = r.instrumentID ?? r.InstrumentID;
            if (id !== undefined) ratesMap[id] = r;
          }
          console.log("[eToro API] Rates loaded:", Object.keys(ratesMap).length, "instruments");
        }

        // Collect all positions from mirrors + direct
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allOpenPositions: any[] = [];
        for (const m of mirrors) {
          if (Array.isArray(m.positions)) allOpenPositions.push(...m.positions);
        }
        allOpenPositions.push(...directPositions);

        let totalPositionEquity = 0;
        let totalCostBasis = 0;
        let totalUnrealizedPL = 0;
        let matched = 0;
        let unmatched = 0;

        for (const pos of allOpenPositions) {
          const rate = ratesMap[pos.instrumentID];
          if (rate && pos.units > 0) {
            // Use bid for buy positions (sell price), ask for sell positions (buy-to-close price)
            const currentPrice = pos.isBuy
              ? (rate.bid ?? rate.Bid ?? 0)
              : (rate.ask ?? rate.Ask ?? 0);

            if (currentPrice > 0) {
              // Position equity = margin (amount) + unrealized P/L
              // This correctly handles leveraged positions where units * price
              // is the full leveraged exposure, not the copier's actual equity.
              // For non-leveraged: amount = units * openRate, so this equals units * currentPrice.
              // For leveraged: amount < units * openRate, so this gives the correct smaller equity.
              const direction = pos.isBuy ? 1 : -1;
              const unrealizedPL = direction * pos.units * (currentPrice - (pos.openRate ?? 0));
              const posEquity = (pos.amount ?? 0) + unrealizedPL;

              totalPositionEquity += posEquity;
              totalCostBasis += pos.amount ?? 0;
              totalUnrealizedPL += unrealizedPL;
              matched++;
            } else {
              unmatched++;
            }
          } else {
            unmatched++;
          }
        }

        // Log first 5 positions with details for verification
        let logged = 0;
        for (const pos of allOpenPositions) {
          if (logged >= 5) break;
          const rate = ratesMap[pos.instrumentID];
          const currentPrice = rate
            ? (pos.isBuy ? (rate.bid ?? rate.Bid ?? 0) : (rate.ask ?? rate.Ask ?? 0))
            : 0;
          const direction = pos.isBuy ? 1 : -1;
          const upl = direction * pos.units * (currentPrice - (pos.openRate ?? 0));
          const equity = (pos.amount ?? 0) + upl;
          console.log(`[eToro API] Position ${logged + 1}:`, {
            instrumentID: pos.instrumentID,
            units: pos.units,
            openRate: pos.openRate,
            amount: pos.amount,
            leverage: pos.openRate > 0 ? ((pos.units * pos.openRate) / pos.amount).toFixed(1) + "x" : "N/A",
            currentPrice,
            unrealizedPL: upl.toFixed(2),
            equity: equity.toFixed(2),
            mirrorID: pos.mirrorID,
          });
          logged++;
        }

        netEquity = totalAvailable + totalPositionEquity;

        console.log("[eToro API] Rates computation:", {
          totalPositions: allOpenPositions.length,
          matched,
          unmatched,
          totalCostBasis: totalCostBasis.toFixed(2),
          totalPositionEquity: totalPositionEquity.toFixed(2),
          totalUnrealizedPL: totalUnrealizedPL.toFixed(2),
          totalAvailable: totalAvailable.toFixed(2),
          netEquity: netEquity.toFixed(2),
        });
      }

      if (totalPL === undefined && netEquity !== undefined) {
        totalPL = netEquity - netDeposited;
      }

      if (totalPLPercent === undefined && netDeposited > 0 && totalPL !== undefined) {
        totalPLPercent = (totalPL / netDeposited) * 100;
      }

      console.log("[eToro API] Final values:", {
        netEquity,
        totalPL,
        totalPLPercent: totalPLPercent?.toFixed(2) + "%",
        netDeposited,
      });

      // Collect all positions for the holdings table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allPositions: any[] = [...directPositions];
      for (const m of mirrors) {
        if (Array.isArray(m.positions)) {
          allPositions.push(...m.positions);
        }
      }

      const portfolio: EtoroPortfolio = {
        raw: portfolioData,
        credit: totalAvailable,
        netEquity,
        totalPL,
        totalPLPercent,
        totalInvested: netDeposited,
        depositSummary: totalDeposited,
        positions: allPositions,
        mirrors,
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
