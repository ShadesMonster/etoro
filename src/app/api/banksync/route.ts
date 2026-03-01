import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const EB_API = "https://api.enablebanking.com";

function getConfig() {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const privateKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (!appId || !privateKey) {
    throw new Error("ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY must be set");
  }
  // The private key is stored with literal \n — convert to real newlines
  return { appId, privateKey: privateKey.replace(/\\n/g, "\n") };
}

function makeJWT() {
  const { appId, privateKey } = getConfig();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 },
    privateKey,
    { algorithm: "RS256", header: { typ: "JWT", alg: "RS256", kid: appId } }
  );
}

async function ebFetch(path: string, options?: RequestInit) {
  const token = makeJWT();
  const res = await fetch(`${EB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Enable Banking API ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

// GET: list banks, get session info, get accounts/transactions
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  try {
    if (action === "banks") {
      const country = req.nextUrl.searchParams.get("country") || "GB";
      const data = await ebFetch(`/aspsps?country=${country}&psu_type=personal`);
      return NextResponse.json(data);
    }

    if (action === "session") {
      const sessionId = req.nextUrl.searchParams.get("session_id");
      if (!sessionId) return NextResponse.json({ error: "session_id required" }, { status: 400 });
      const data = await ebFetch(`/sessions/${sessionId}`);
      return NextResponse.json(data);
    }

    if (action === "balances") {
      const accountId = req.nextUrl.searchParams.get("account_id");
      if (!accountId) return NextResponse.json({ error: "account_id required" }, { status: 400 });
      const data = await ebFetch(`/accounts/${accountId}/balances`);
      return NextResponse.json(data);
    }

    if (action === "transactions") {
      const accountId = req.nextUrl.searchParams.get("account_id");
      if (!accountId) return NextResponse.json({ error: "account_id required" }, { status: 400 });
      const dateFrom = req.nextUrl.searchParams.get("date_from") || "";
      const dateTo = req.nextUrl.searchParams.get("date_to") || "";
      const continuationKey = req.nextUrl.searchParams.get("continuation_key") || "";
      let path = `/accounts/${accountId}/transactions`;
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (continuationKey) params.set("continuation_key", continuationKey);
      if (params.toString()) path += `?${params.toString()}`;
      const data = await ebFetch(path);
      return NextResponse.json(data);
    }

    if (action === "status") {
      // Quick check that credentials are configured
      try {
        getConfig();
        return NextResponse.json({ configured: true });
      } catch {
        return NextResponse.json({ configured: false });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("must be set") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST: initiate auth, create session
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  try {
    if (action === "connect") {
      const body = await req.json();
      const { bankName, bankCountry, redirectUrl, state } = body;
      if (!bankName || !redirectUrl) {
        return NextResponse.json({ error: "bankName and redirectUrl required" }, { status: 400 });
      }

      const validUntil = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const data = await ebFetch("/auth", {
        method: "POST",
        body: JSON.stringify({
          access: {
            valid_until: validUntil,
            balances: { iban: [] },
            transactions: { iban: [] },
          },
          aspsp: { name: bankName, country: bankCountry || "GB" },
          state: state || "banksync",
          redirect_url: redirectUrl,
          psu_type: "personal",
        }),
      });

      return NextResponse.json(data);
    }

    if (action === "session") {
      const body = await req.json();
      const { code } = body;
      if (!code) {
        return NextResponse.json({ error: "code required" }, { status: 400 });
      }

      const data = await ebFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("must be set") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
