"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useFinanceStore } from "@/lib/store";
import { useToastStore } from "@/lib/toast";
import { Transaction } from "@/lib/types";
import { categorizeTransaction } from "@/lib/categorize";

interface BankInfo {
  name: string;
  country: string;
  logo?: string;
  auth_methods?: Array<{ name: string; approach: string }>;
}

export default function BankSyncPage() {
  const searchParams = useSearchParams();
  const {
    addTransactions,
    bankSyncSessions,
    addBankSyncSession,
    updateBankSyncSession,
    removeBankSyncSession,
    categoryRules,
  } = useFinanceStore();
  const addToast = useToastStore((s) => s.addToast);

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [bankFilter, setBankFilter] = useState("");

  // Check if API is configured
  useEffect(() => {
    fetch("/api/banksync?action=status")
      .then((r) => r.json())
      .then((d) => setConfigured(d.configured))
      .catch(() => setConfigured(false));
  }, []);

  // Handle OAuth callback - if we have a code in the URL
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;

    const createSession = async () => {
      try {
        const res = await fetch("/api/banksync?action=session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create session");
        }
        const data = await res.json();

        addBankSyncSession({
          sessionId: data.session_id,
          bankName: data.aspsp?.name || "Unknown Bank",
          bankCountry: data.aspsp?.country || "GB",
          accounts: (data.accounts || []).map((a: { uid: string; iban?: string }) => ({
            uid: a.uid,
            iban: a.iban,
          })),
          connectedAt: new Date().toISOString(),
          validUntil: data.access?.valid_until,
        });

        addToast(
          `Connected to ${data.aspsp?.name || "bank"} with ${data.accounts?.length || 0} account(s)`,
          "success"
        );

        // Clean up URL
        window.history.replaceState({}, "", "/banksync");
      } catch (e) {
        addToast(`Connection failed: ${e instanceof Error ? e.message : "Unknown error"}`, "error");
        window.history.replaceState({}, "", "/banksync");
      }
    };

    createSession();
  }, [searchParams, addBankSyncSession, addToast]);

  // Load available banks
  const loadBanks = useCallback(async () => {
    setLoadingBanks(true);
    try {
      const res = await fetch("/api/banksync?action=banks&country=GB");
      if (!res.ok) throw new Error("Failed to load banks");
      const data = await res.json();
      setBanks(Array.isArray(data) ? data : data.aspsps || []);
    } catch (e) {
      addToast(`Failed to load banks: ${e instanceof Error ? e.message : "Unknown error"}`, "error");
    } finally {
      setLoadingBanks(false);
    }
  }, [addToast]);

  // Connect to a bank
  const connectBank = useCallback(
    async (bank: BankInfo) => {
      setConnecting(true);
      try {
        const redirectUrl = `${window.location.origin}/banksync`;
        const res = await fetch("/api/banksync?action=connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankName: bank.name,
            bankCountry: bank.country,
            redirectUrl,
            state: `connect-${Date.now()}`,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to initiate connection");
        }
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error("No redirect URL received from bank");
        }
      } catch (e) {
        addToast(`Connection failed: ${e instanceof Error ? e.message : "Unknown error"}`, "error");
        setConnecting(false);
      }
    },
    [addToast]
  );

  // Sync transactions from an account
  const syncTransactions = useCallback(
    async (sessionId: string, accountUid: string) => {
      setSyncing(accountUid);
      try {
        // Fetch last 90 days
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const allTransactions: Transaction[] = [];
        let continuationKey: string | null = null;
        const rules = categoryRules?.length > 0 ? categoryRules : undefined;

        do {
          const params = new URLSearchParams({
            action: "transactions",
            account_id: accountUid,
            date_from: dateFrom,
            date_to: dateTo,
          });
          if (continuationKey) params.set("continuation_key", continuationKey);

          const res = await fetch(`/api/banksync?${params.toString()}`);
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to fetch transactions");
          }
          const data = await res.json();
          const txns = data.transactions || [];

          for (const tx of txns) {
            const amount = tx.transaction_amount
              ? parseFloat(tx.transaction_amount.amount)
              : 0;
            // Enable Banking normalizes across banks — handle various field formats
            const description =
              tx.remittance_information_unstructured ||
              tx.remittance_information_unstructured_array?.join(" ") ||
              (Array.isArray(tx.remittance_information) ? tx.remittance_information.join(" ") : tx.remittance_information) ||
              tx.creditor_name ||
              tx.creditor?.name ||
              tx.debtor_name ||
              tx.debtor?.name ||
              "";

            allTransactions.push({
              id: `eb-${tx.entry_reference || tx.transaction_id || `${accountUid}-${tx.booking_date}-${amount}-${allTransactions.length}`}`,
              date: tx.booking_date || tx.value_date || dateTo,
              description: description.trim(),
              amount,
              category: categorizeTransaction(description, amount, rules),
              source: "barclays",
            });
          }

          continuationKey = data.continuation_key || null;
        } while (continuationKey);

        if (allTransactions.length > 0) {
          addTransactions(allTransactions);
        }

        // Update last sync time
        updateBankSyncSession(sessionId, { lastSyncAt: new Date().toISOString() });

        addToast(`Synced ${allTransactions.length} transactions`, "success");
      } catch (e) {
        addToast(
          `Sync failed: ${e instanceof Error ? e.message : "Unknown error"}`,
          "error"
        );
      } finally {
        setSyncing(null);
      }
    },
    [addTransactions, updateBankSyncSession, addToast, categoryRules]
  );

  const filteredBanks = useMemo(() => {
    if (!bankFilter) return banks;
    const q = bankFilter.toLowerCase();
    return banks.filter((b) => b.name.toLowerCase().includes(q));
  }, [banks, bankFilter]);

  // Not configured — show setup instructions
  if (configured === false) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Bank Sync</h1>
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Setup Required</h2>
          <p className="text-[var(--muted)] mb-4">
            Bank Sync uses Enable Banking to securely connect to your bank via Open Banking.
            It&apos;s free for personal use.
          </p>
          <ol className="list-decimal list-inside space-y-3 text-sm text-[var(--muted)]">
            <li>
              Sign up at{" "}
              <a
                href="https://enablebanking.com/sign-in/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] underline"
              >
                enablebanking.com
              </a>{" "}
              (just enter your email)
            </li>
            <li>
              Create a new application in the Control Panel — set the redirect URL to{" "}
              <code className="bg-[var(--card-border)] px-1 rounded text-xs">
                {typeof window !== "undefined" ? `${window.location.origin}/banksync` : "http://localhost:3000/banksync"}
              </code>
            </li>
            <li>Download the private key (.pem file) when you create the application</li>
            <li>
              Add these to your <code className="bg-[var(--card-border)] px-1 rounded text-xs">.env.local</code> file:
              <pre className="mt-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3 text-xs overflow-x-auto">
{`ENABLE_BANKING_APP_ID=your-app-id-here
ENABLE_BANKING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEvg...your-key...\\n-----END PRIVATE KEY-----"`}
              </pre>
            </li>
            <li>Restart the dev server</li>
          </ol>
        </div>
      </div>
    );
  }

  // Still loading
  if (configured === null) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Bank Sync</h1>
        <div className="card text-center py-8 text-[var(--muted)]">Checking configuration...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Bank Sync</h1>

      {/* Connected accounts */}
      {bankSyncSessions.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Connected Accounts</h2>
          <div className="space-y-3">
            {bankSyncSessions.map((session) => (
              <div
                key={session.sessionId}
                className="border border-[var(--card-border)] rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-medium text-white">{session.bankName}</h3>
                    <p className="text-xs text-[var(--muted)]">
                      Connected {new Date(session.connectedAt).toLocaleDateString()}
                      {session.lastSyncAt && (
                        <> &middot; Last synced {new Date(session.lastSyncAt).toLocaleString()}</>
                      )}
                      {session.validUntil && (
                        <> &middot; Expires {new Date(session.validUntil).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => removeBankSyncSession(session.sessionId)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Disconnect
                  </button>
                </div>
                <div className="space-y-2">
                  {session.accounts.map((account) => (
                    <div
                      key={account.uid}
                      className="flex items-center justify-between bg-[var(--background)] rounded px-3 py-2"
                    >
                      <span className="text-sm text-[var(--muted)]">
                        {account.iban || account.name || account.uid.slice(0, 16) + "..."}
                      </span>
                      <button
                        onClick={() => syncTransactions(session.sessionId, account.uid)}
                        disabled={syncing === account.uid}
                        className="btn-primary text-xs"
                      >
                        {syncing === account.uid ? "Syncing..." : "Sync Transactions"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connect new bank */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Connect a Bank</h2>
        {banks.length === 0 ? (
          <button
            onClick={loadBanks}
            disabled={loadingBanks}
            className="btn-primary text-sm"
          >
            {loadingBanks ? "Loading UK banks..." : "Load Available UK Banks"}
          </button>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Search banks..."
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              className="w-full"
            />
            <div className="max-h-80 overflow-y-auto space-y-1">
              {filteredBanks.map((bank) => (
                <button
                  key={bank.name}
                  onClick={() => connectBank(bank)}
                  disabled={connecting}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left hover:bg-[var(--card-border)] transition-colors"
                >
                  <span className="text-white">{bank.name}</span>
                  <span className="text-xs text-[var(--accent)]">
                    {connecting ? "Connecting..." : "Connect"}
                  </span>
                </button>
              ))}
              {filteredBanks.length === 0 && (
                <p className="text-sm text-[var(--muted)] py-4 text-center">
                  No banks found matching &ldquo;{bankFilter}&rdquo;
                </p>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              {banks.length} UK banks available via Enable Banking
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="card text-sm text-[var(--muted)] space-y-2">
        <p>
          Bank Sync uses <strong className="text-white">Enable Banking</strong> (FCA-registered AISP)
          to connect via UK Open Banking. Your credentials are never shared — you
          authenticate directly with your bank.
        </p>
        <p>
          Sessions last up to 180 days. You can sync up to 4 times per day per account
          (PSD2 standard limit).
        </p>
      </div>
    </div>
  );
}
