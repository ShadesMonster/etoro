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

      const topCredit = cp?.credit ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const directPositions: any[] = cp?.positions ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mirrors: any[] = cp?.mirrors ?? [];

      // Aggregate mirror-level financial data.
      // initialInvestment = first allocation to copy-trader (from deposits)
      // depositSummary = subsequent additional deposits into the mirror
      // withdrawalSummary = money moved back from mirror to account
      // availableAmount = uninvested cash within the copy-trader (realized profits etc.)
      let mirrorInitial = 0;
      let mirrorDeposits = 0;
      let mirrorWithdrawals = 0;
      let mirrorAvailableCash = 0;
      for (const m of mirrors) {
        mirrorInitial += m.initialInvestment ?? 0;
        mirrorDeposits += m.depositSummary ?? 0;
        mirrorWithdrawals += m.withdrawalSummary ?? 0;
        mirrorAvailableCash += m.availableAmount ?? 0;
      }

      // Direct position amounts (outside copy-trading mirrors)
      let directAmounts = 0;
      for (const pos of directPositions) {
        directAmounts += pos.amount ?? 0;
      }

      // === COMPUTE PORTFOLIO VALUE FROM POSITIONS + LIVE RATES ===
      // eToro's breakdown: Cash + Total Invested + P/L = Total Value
      //   Cash = topCredit (eToro separates this from invested)
      //   Total Invested = deposit-based, NOT sum(pos.amount) which includes reinvested profits
      //   P/L = Total Value - Cash - Total Invested (derived to keep equation balanced)
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

      // Collect all open positions (from mirrors + direct)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allPositions: any[] = [];
      for (const m of mirrors) {
        if (Array.isArray(m.positions)) allPositions.push(...m.positions);
      }
      allPositions.push(...directPositions);

      let totalPositionEquity = 0;
      let totalPositionAmounts = 0;
      let matched = 0;

      for (const pos of allPositions) {
        const amount = pos.amount ?? 0;
        totalPositionAmounts += amount;

        const rate = ratesMap[pos.instrumentID];
        if (!rate || pos.units <= 0) {
          // No rate: assume equity = amount (P/L = 0)
          totalPositionEquity += amount;
          continue;
        }

        const currentPrice = pos.isBuy
          ? (rate.bid ?? rate.Bid ?? 0)
          : (rate.ask ?? rate.Ask ?? 0);
        if (currentPrice <= 0) {
          totalPositionEquity += amount;
          continue;
        }

        const direction = pos.isBuy ? 1 : -1;
        const convRate = pos.openConversionRate ?? 1;
        const upl = direction * pos.units * (currentPrice - (pos.openRate ?? 0)) * convRate;
        const equity = amount + upl + (pos.totalFees ?? 0);

        totalPositionEquity += equity;
        matched++;
      }

      // Total Value = topCredit + totalPositionEquity + mirrorAvailableCash
      const netEquity = topCredit + totalPositionEquity + mirrorAvailableCash;

      // Total Invested: deposit-based (not sum(pos.amount) which includes reinvested profits)
      // Per mirror: initialInvestment + depositSummary - withdrawalSummary
      // Plus direct positions. Cash (topCredit) excluded - eToro shows it separately.
      const totalInvested = mirrorInitial + mirrorDeposits - mirrorWithdrawals + directAmounts;

      // P/L = remainder to balance the equation: Total Value - Cash - Total Invested
      const totalPL = netEquity - topCredit - totalInvested;
      const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : undefined;

      console.log("[eToro API] Portfolio:", {
        positions: `${matched}/${allPositions.length}`,
        cash: topCredit.toFixed(2),
        invested: totalInvested.toFixed(2),
        pl: totalPL.toFixed(2),
        plPercent: totalPLPercent?.toFixed(1) + "%",
        total: netEquity.toFixed(2),
      });

      const portfolio: EtoroPortfolio = {
        raw: portfolioData,
        credit: topCredit,
        netEquity,
        totalPL,
        totalPLPercent,
        totalInvested,
        depositSummary: totalInvested,
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
