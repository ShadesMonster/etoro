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

      console.log("[eToro API] Fetching portfolio + PnL...");

      // Fetch portfolio and PnL in parallel
      const [portfolioRes, pnlRes] = await Promise.all([
        fetch("/api/prices?action=portfolio"),
        fetch("/api/prices?action=pnl").catch(() => null),
      ]);

      if (!portfolioRes.ok) {
        const data = await portfolioRes.json().catch(() => ({}));
        throw new Error(data.error || `Portfolio HTTP ${portfolioRes.status}`);
      }

      const portfolioData = await portfolioRes.json();
      const cp = portfolioData?.clientPortfolio ?? portfolioData;

      // Parse PnL endpoint if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let pnlData: any = null;
      if (pnlRes && pnlRes.ok) {
        pnlData = await pnlRes.json();
        console.log("[eToro API] PnL response:", pnlData);
      }

      const topCredit = cp?.credit ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const directPositions: any[] = cp?.positions ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mirrors: any[] = cp?.mirrors ?? [];

      // === COMPUTE FROM MIRROR-LEVEL SUMMARY DATA ===
      // Each mirror has: depositSummary, withdrawalSummary, closedPositionsNetProfit,
      // availableAmount, initialInvestment, positions[]
      //
      // Mirror equity = availableAmount + currentValueOfOpenPositions
      // But since position amounts are 0, we can't compute position values easily.
      //
      // Instead, use the financial flow:
      //   costBasisInOpenPositions = depositSummary - withdrawalSummary
      //                             + closedPositionsNetProfit - availableAmount
      //   This tells us how much cash is tied up in open positions (at cost).
      //
      // For portfolio value, we need PnL or we estimate from available data.

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
      // Option 1: PnL endpoint gives us total P/L directly
      // Option 2: Estimate from deposits + closed P/L (missing unrealized P/L)
      //
      // PnL data might contain equity, totalPL, etc.
      let netEquity: number | undefined;
      let totalPL: number | undefined;
      let totalPLPercent: number | undefined;

      if (pnlData) {
        // Try to extract equity/PnL from the PnL endpoint
        const pnl = pnlData?.pnl ?? pnlData?.clientPnl ?? pnlData;
        netEquity = pnl?.equity ?? pnl?.netEquity ?? pnl?.totalEquity ?? pnl?.Equity;
        totalPL = pnl?.totalPnl ?? pnl?.totalPL ?? pnl?.pnl ?? pnl?.TotalPnl;
        totalPLPercent = pnl?.totalPnlPercent ?? pnl?.totalPLPercent;

        console.log("[eToro API] PnL extracted:", { netEquity, totalPL, totalPLPercent });
      }

      // If PnL endpoint didn't give us equity, compute from rates
      if (netEquity === undefined) {
        // Fetch live rates to compute current value of open positions
        console.log("[eToro API] Fetching rates to compute unrealized P/L...");
        const ratesRes = await fetch("/api/prices?action=rates").catch(() => null);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let ratesMap: Record<number, any> = {};
        if (ratesRes && ratesRes.ok) {
          const ratesData = await ratesRes.json();
          const ratesArr = ratesData?.rates ?? (Array.isArray(ratesData) ? ratesData : []);
          for (const r of ratesArr) {
            const id = r.instrumentID ?? r.InstrumentID;
            if (id !== undefined) ratesMap[id] = r;
          }
          console.log("[eToro API] Rates loaded:", ratesArr.length, "instruments");

          // Log a sample rate to see field names
          if (ratesArr.length > 0) {
            console.log("[eToro API] Sample rate object keys:", Object.keys(ratesArr[0]));
            console.log("[eToro API] Sample rate:", ratesArr[0]);
          }
        }

        // Compute current value of all open positions across all mirrors
        let totalPositionCurrentValue = 0;
        let positionsWithRates = 0;
        let positionsWithoutRates = 0;

        // Collect all open positions from mirrors
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allOpenPositions: any[] = [];
        for (const m of mirrors) {
          if (Array.isArray(m.positions)) allOpenPositions.push(...m.positions);
        }
        allOpenPositions.push(...directPositions);

        // Log a few sample computations
        let loggedSamples = 0;

        for (const pos of allOpenPositions) {
          const rate = ratesMap[pos.instrumentID];
          if (rate && pos.units > 0) {
            // Use bid price for buy positions (what you'd get if you sold)
            // Use ask price for sell positions (what you'd pay to close)
            const currentPrice = pos.isBuy
              ? (rate.bid ?? rate.Bid ?? rate.lastExecution ?? rate.LastExecution ?? 0)
              : (rate.ask ?? rate.Ask ?? rate.lastExecution ?? rate.LastExecution ?? 0);

            if (currentPrice > 0) {
              const posValue = pos.units * currentPrice;
              totalPositionCurrentValue += posValue;
              positionsWithRates++;

              // Log first 5 positions for debugging
              if (loggedSamples < 5) {
                console.log(`[eToro API] Position sample ${loggedSamples + 1}:`, {
                  instrumentID: pos.instrumentID,
                  units: pos.units,
                  isBuy: pos.isBuy,
                  rateBid: rate.bid ?? rate.Bid,
                  rateAsk: rate.ask ?? rate.Ask,
                  currentPrice,
                  posValue,
                });
                loggedSamples++;
              }
            } else {
              positionsWithoutRates++;
            }
          } else {
            positionsWithoutRates++;
          }
        }

        netEquity = totalAvailable + totalPositionCurrentValue;

        console.log("[eToro API] Rates computation:", {
          totalAvailable,
          totalPositionCurrentValue,
          netEquity,
          positionsWithRates,
          positionsWithoutRates,
          costBasisInOpen: netDeposited + totalClosedPL - totalAvailable,
          unrealizedPL: totalPositionCurrentValue - (netDeposited + totalClosedPL - totalAvailable),
        });
      }

      if (totalPL === undefined) {
        totalPL = (netEquity ?? 0) - netDeposited;
      }

      if (totalPLPercent === undefined && netDeposited > 0) {
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
