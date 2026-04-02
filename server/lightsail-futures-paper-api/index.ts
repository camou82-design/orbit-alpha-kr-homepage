/**
 * Read-only API for orbitalpha-futures-paper `data/` on this machine (e.g. Lightsail).
 * Run from homepage repo root context so shared bundle logic resolves.
 *
 * Env:
 *   ORBITALPHA_FUTURES_PAPER_ROOT — project root (contains data/)
 *   ORBITALPHA_FUTURES_PAPER_API_SECRET — must match Vercel ORBITALPHA_FUTURES_PAPER_API_SECRET
 *   PORT — default 3991
 */
import express from "express";
import { loadFuturesPaperBundleFromDiskRoot } from "../../src/lib/futuresPaperBundleCore.ts";

const app = express();
const PORT = Number(process.env.PORT ?? 3991);
const secret = process.env.ORBITALPHA_FUTURES_PAPER_API_SECRET?.trim();
const root = process.env.ORBITALPHA_FUTURES_PAPER_ROOT?.trim();

app.disable("x-powered-by");

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "lightsail-futures-paper-api" });
});

app.get("/api/futures-paper/data", async (req, res) => {
  const token = String(req.headers["x-orbitalpha-futures-paper-token"] ?? "").trim();
  if (!secret || token !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!root) {
    res.status(500).json({ error: "ORBITALPHA_FUTURES_PAPER_ROOT not set" });
    return;
  }
  try {
    const bundle = await loadFuturesPaperBundleFromDiskRoot(root);
    res.json(bundle);
  } catch (e) {
    console.error("[lightsail-futures-paper-api]", e);
    res.status(500).json({ error: "bundle_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`lightsail-futures-paper-api listening on :${PORT}`);
});
