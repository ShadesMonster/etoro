"use client";

import { useState, useCallback, useRef } from "react";
import { useFinanceStore } from "./store";
import type { EtoroPosition } from "./types";

const SYNC_TS_KEY = "etoro-sync-ts";
const SYNC_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

export function useEtoroSync() {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(() => {
    try {
      const ts = localStorage.getItem(SYNC_TS_KEY);
      return ts ? new Date(Number(ts)) : null;
    } catch {
      return null;
    }
  });
  const setApiPositions = useFinanceStore((s) => s.setApiEtoroPositions);
  const syncingRef = useRef(false);

  const sync = useCallback(async (force = false) => {
    // Prevent concurrent syncs
    if (syncingRef.current) return;

    // Check if we synced recently (unless forced)
    if (!force) {
      try {
        const ts = localStorage.getItem(SYNC_TS_KEY);
        if (ts && Date.now() - Number(ts) < SYNC_INTERVAL) {
          return;
        }
      } catch {}
    }

    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);

    try {
      const res = await fetch("/api/prices?action=sync");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Sync failed: ${res.status}`);
      }

      const data = await res.json();

      // Map API response to EtoroPosition format
      const positions: EtoroPosition[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (data.openPositions ?? []) as any[]) {
        positions.push({
          id: p.id,
          instrument: p.instrument,
          units: p.units,
          openRate: p.openRate,
          currentRate: p.currentRate,
          profit: p.profit,
          profitPercent: p.profitPercent,
          openDate: p.openDate ? p.openDate.slice(0, 10) : "",
          type: p.type,
          status: "open",
          positionId: p.positionId,
          amount: p.amount,
          leverage: p.leverage,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (data.closedPositions ?? []) as any[]) {
        positions.push({
          id: p.id,
          instrument: p.instrument,
          units: p.units,
          openRate: p.openRate,
          currentRate: p.currentRate,
          profit: p.profit,
          profitPercent: p.profitPercent,
          openDate: p.openDate ? p.openDate.slice(0, 10) : "",
          closeDate: p.closeDate ? p.closeDate.slice(0, 10) : undefined,
          type: p.type,
          status: "closed",
          positionId: p.positionId,
          amount: p.amount,
          leverage: p.leverage,
        });
      }

      if (positions.length > 0) {
        setApiPositions(positions);
        // Only cache the sync timestamp when we actually got positions
        // Otherwise, allow re-sync on next page load
        const now = Date.now();
        try { localStorage.setItem(SYNC_TS_KEY, String(now)); } catch {}
        setLastSynced(new Date(now));
      }

      console.log(`[eToro Sync] Stored ${positions.length} positions (${data.openPositions?.length ?? 0} open, ${data.closedPositions?.length ?? 0} closed, ${data.instrumentCount ?? 0} instruments, ${data.unresolved ?? 0} unresolved)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      console.error("[eToro Sync] Error:", msg);
      setSyncError(msg);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [setApiPositions]);

  return { sync, syncing, syncError, lastSynced };
}
