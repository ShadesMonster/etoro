"use client";

import { useState, useCallback } from "react";
import { useFinanceStore } from "./store";
import type { EtoroPosition } from "./types";

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
  const setApiPositions = useFinanceStore((s) => s.setApiEtoroPositions);

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

      // Fetch portfolio from eToro API
      const portfolioRes = await fetch("/api/prices?action=portfolio");

      if (!portfolioRes.ok) {
        const data = await portfolioRes.json().catch(() => ({}));
        throw new Error(data.error || `Portfolio HTTP ${portfolioRes.status}`);
      }

      const portfolioData = await portfolioRes.json();
      const cp = portfolioData?.clientPortfolio ?? portfolioData;

      // Log raw API structure to browser console for debugging
      console.log("[eToro Raw] clientPortfolio keys:", Object.keys(cp ?? {}));
      console.log("[eToro Raw] clientPortfolio top-level:", {
        credit: cp?.credit,
        equity: cp?.equity,
        totalDeposited: cp?.totalDeposited,
        netDeposit: cp?.netDeposit,
        depositAmount: cp?.depositAmount,
        depositSummary: cp?.depositSummary,
        balance: cp?.balance,
        netAmount: cp?.netAmount,
        totalRealizedEquity: cp?.totalRealizedEquity,
        realizedEquity: cp?.realizedEquity,
      });
      if (cp?.mirrors?.length > 0) {
        console.log("[eToro Raw] mirror[0] keys:", Object.keys(cp.mirrors[0]));
        console.log("[eToro Raw] mirror[0] sample:", JSON.stringify(cp.mirrors[0], null, 2).slice(0, 800));
      }
      console.log("[eToro Raw] direct positions:", cp?.positions?.length ?? 0);

      const topCredit = cp?.credit ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const directPositions: any[] = cp?.positions ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mirrors: any[] = cp?.mirrors ?? [];

      // Aggregate deposit data from all mirrors + direct positions
      let mirrorDeposits = 0;
      let mirrorInitialInvestments = 0;
      let mirrorWithdrawals = 0;
      let mirrorClosedPL = 0;
      let totalAvailable = topCredit;

      for (const m of mirrors) {
        mirrorDeposits += m.depositSummary ?? 0;
        mirrorInitialInvestments += m.initialInvestment ?? 0;
        mirrorWithdrawals += m.withdrawalSummary ?? 0;
        mirrorClosedPL += m.closedPositionsNetProfit ?? 0;
        totalAvailable += m.availableAmount ?? 0;
      }

      // Direct position amounts (capital invested outside copy-trading mirrors)
      let directPositionAmounts = 0;
      for (const pos of directPositions) {
        directPositionAmounts += pos.amount ?? 0;
      }

      // Log all deposit sources for debugging
      console.log("[eToro Deposits]", {
        mirrorCount: mirrors.length,
        mirrorDeposits: mirrorDeposits.toFixed(2),
        mirrorInitialInvestments: mirrorInitialInvestments.toFixed(2),
        mirrorWithdrawals: mirrorWithdrawals.toFixed(2),
        mirrorClosedPL: mirrorClosedPL.toFixed(2),
        directPositionAmounts: directPositionAmounts.toFixed(2),
        topCredit: topCredit.toFixed(2),
        totalAvailable: totalAvailable.toFixed(2),
        // Show per-mirror breakdown
        perMirror: mirrors.map((m: Record<string, unknown>) => ({
          parent: m.parentUsername,
          initial: m.initialInvestment,
          deposits: m.depositSummary,
          withdrawals: m.withdrawalSummary,
          closedPL: m.closedPositionsNetProfit,
          available: m.availableAmount,
        })),
      });

      // Compute total deposited from best available data.
      // initialInvestment = initial allocation to each copy-trader (from actual deposits)
      // depositSummary = subsequent additional deposits into the mirror
      // These may overlap (depositSummary might include initialInvestment) or be separate.
      // Try both and pick the one that makes more sense:
      const sumInitialPlusDeposits = mirrorInitialInvestments + mirrorDeposits;
      const bestMirrorDeposits = Math.max(mirrorDeposits, mirrorInitialInvestments, sumInitialPlusDeposits);

      // Total deposited = mirror allocations + direct positions + uninvested cash
      const totalDeposited = bestMirrorDeposits + directPositionAmounts + topCredit;
      const totalWithdrawn = mirrorWithdrawals;
      const netDeposited = totalDeposited - totalWithdrawn;

      console.log("[eToro Net Invested]", {
        "depositSummary total": mirrorDeposits.toFixed(2),
        "initialInvestment total": mirrorInitialInvestments.toFixed(2),
        "initial + deposits": sumInitialPlusDeposits.toFixed(2),
        "bestMirrorDeposits (max)": bestMirrorDeposits.toFixed(2),
        "- withdrawals": totalWithdrawn.toFixed(2),
        "= netDeposited": netDeposited.toFixed(2),
      });

      // === COMPUTE PORTFOLIO VALUE FROM POSITIONS + LIVE RATES ===
      // Each position has: units, openRate, amount, openConversionRate, isBuy
      // positionEquity = amount + direction * units * (currentPrice - openRate) * openConversionRate
      // openConversionRate converts from instrument currency to USD
      // (e.g. 1.0 for USD instruments, ~0.0137 for GBP pence instruments)
      let netEquity = 0;
      let totalPL = 0;
      let totalPLPercent: number | undefined;

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
      }

      // Collect all open positions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allPositions: any[] = [];
      for (const m of mirrors) {
        if (Array.isArray(m.positions)) allPositions.push(...m.positions);
      }
      allPositions.push(...directPositions);

      let totalPositionEquity = 0;
      let matched = 0;

      for (const pos of allPositions) {
        const rate = ratesMap[pos.instrumentID];
        if (!rate || pos.units <= 0) continue;

        const currentPrice = pos.isBuy
          ? (rate.bid ?? rate.Bid ?? 0)
          : (rate.ask ?? rate.Ask ?? 0);
        if (currentPrice <= 0) continue;

        const direction = pos.isBuy ? 1 : -1;
        const convRate = pos.openConversionRate ?? 1;
        const upl = direction * pos.units * (currentPrice - (pos.openRate ?? 0)) * convRate;
        const equity = (pos.amount ?? 0) + upl + (pos.totalFees ?? 0);

        totalPositionEquity += equity;
        matched++;
      }

      netEquity = totalAvailable + totalPositionEquity;
      totalPL = netEquity - netDeposited;
      if (netDeposited > 0) {
        totalPLPercent = (totalPL / netDeposited) * 100;
      }

      console.log("[eToro API] Portfolio:", {
        positions: `${matched}/${allPositions.length}`,
        equity: netEquity.toFixed(2),
        pl: totalPL.toFixed(2),
        plPercent: totalPLPercent?.toFixed(1) + "%",
        mirrors: mirrors.length,
      });

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

      // Store individual positions from the API response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiPositions: any[] = portfolioData._openPositions ?? [];
      if (apiPositions.length > 0) {
        const mapped: EtoroPosition[] = apiPositions.map((p) => ({
          id: p.id,
          instrument: p.instrument,
          units: p.units,
          openRate: p.openRate,
          currentRate: p.currentRate,
          profit: p.profit,
          profitPercent: p.profitPercent,
          openDate: p.openDate ? p.openDate.slice(0, 10) : "",
          type: p.type,
          status: "open" as const,
          positionId: p.positionId,
          amount: p.amount,
          leverage: p.leverage,
        }));
        setApiPositions(mapped);
        console.log(`[eToro API] Stored ${mapped.length} open positions from portfolio`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch portfolio";
      console.error("[eToro API] Failed:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setApiPositions]);

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
