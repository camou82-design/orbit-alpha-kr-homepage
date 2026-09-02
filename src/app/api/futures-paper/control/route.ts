import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADER_TOKEN = "x-orbitalpha-futures-paper-token";
const CONTROL_PATH = "/api/futures-paper/control";

function readServerConfig() {
  const apiUrl = process.env.ORBITALPHA_FUTURES_PAPER_API_URL?.trim();
  const secret = process.env.ORBITALPHA_FUTURES_PAPER_API_SECRET?.trim();

  if (!apiUrl) {
    return { error: NextResponse.json({ error: "ORBITALPHA_FUTURES_PAPER_API_URL is not configured." }, { status: 500 }) };
  }
  if (!secret) {
    return {
      error: NextResponse.json({ error: "ORBITALPHA_FUTURES_PAPER_API_SECRET is not configured." }, { status: 500 })
    };
  }

  const remoteUrl = `${apiUrl.replace(/\/+$/, "")}${CONTROL_PATH}`;
  return { apiUrl, secret, remoteUrl };
}

/**
 * GET /api/futures-paper/control
 * Returns current tradeControl state from Lightsail API.
 */
export async function GET() {
  try {
    const cfg = readServerConfig();
    if ("error" in cfg) return cfg.error;

    const res = await fetch(cfg.remoteUrl, {
      method: "GET",
      headers: {
        [HEADER_TOKEN]: cfg.secret
      },
      cache: "no-store"
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Remote API error: ${res.status} - ${errorText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[futures-paper/control] GET Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/futures-paper/control
 * Accepts:
 *  - { action: "SET_TRADE", enabled: boolean }
 *  - { action: "SET_LEVERAGE", symbol: "BTCUSDT" | "ETHUSDT", leverage: 10 | 25 | 50 | 100 }
 * Proxies to Lightsail API while preserving existing control state.
 */
export async function POST(req: Request) {
  try {
    const cfg = readServerConfig();
    if ("error" in cfg) return cfg.error;

    const body = (await req.json()) as {
      action?: unknown;
      enabled?: unknown;
      symbol?: unknown;
      leverage?: unknown;
    };

    let remoteBody: Record<string, unknown>;

    if (body.action === "SET_TRADE") {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
      }
      remoteBody = {
        serverTradeEnabled: body.enabled,
        updatedBy: "homepage",
        reason: body.enabled ? "homepage_enable" : "homepage_disable"
      };
    } else if (body.action === "SET_LEVERAGE") {
      const allowed = [10, 25, 50, 100];
      const lev = Number(body.leverage);
      if (!allowed.includes(lev)) {
        return NextResponse.json(
          { error: "leverage must be one of [10, 25, 50, 100]." },
          { status: 400 }
        );
      }
      const sym = String(body.symbol);
      if (sym !== "BTCUSDT" && sym !== "ETHUSDT") {
        return NextResponse.json(
          { error: "symbol must be BTCUSDT or ETHUSDT." },
          { status: 400 }
        );
      }
      remoteBody = {
        selectedLeverageBySymbol: {
          [sym]: lev
        },
        updatedBy: "homepage",
        reason: `homepage_set_${sym}_leverage_${lev}x`
      };
    } else {
      return NextResponse.json(
        { error: "Unsupported action. Only SET_TRADE or SET_LEVERAGE is allowed." },
        { status: 400 }
      );
    }

    const res = await fetch(cfg.remoteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [HEADER_TOKEN]: cfg.secret
      },
      body: JSON.stringify(remoteBody)
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Remote API error: ${res.status} - ${errorText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[futures-paper/control] POST Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}