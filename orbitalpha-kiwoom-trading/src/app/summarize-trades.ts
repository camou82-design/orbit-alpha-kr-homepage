import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, sanitizeExperimentTag } from "../infra/config.js";
import {
  buildTradeSummaryReport,
  formatTradeSummaryConsole,
  getDefaultTradeSummaryJsonPath,
  readTradeJsonlFile,
  saveTradeSummaryJson,
} from "../reports/trade-summary.js";
import { getTradesJsonlPath } from "../reports/trades-jsonl.js";

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmdToDate(ymd: string): Date {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Invalid --date=${ymd} (expected YYYY-MM-DD)`);
  const y = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mm, d);
}

function parseArgs(argv: string[]): {
  date: string;
  save: boolean;
  topN: number;
  tag: string | null;
  reportsDir: string;
  tradesDir: string;
} {
  let date = todayYmd();
  let save = false;
  let topN = 5;

  const config = loadConfig();
  let reportsDir = resolve(process.env.REPORTS_DIR ?? "data/reports");
  let tradesDir = resolve(process.env.TRADES_DIR ?? config.tradesDir);
  let tag: string | null = config.experimentTag;

  for (const a of argv) {
    if (a.startsWith("--date=")) {
      date = a.slice("--date=".length).trim();
    } else if (a === "--save") {
      save = true;
    } else if (a.startsWith("--tag=")) {
      const raw = a.slice("--tag=".length);
      tag = raw.trim() === "" ? null : sanitizeExperimentTag(raw) ?? null;
    } else if (a.startsWith("--top=")) {
      const n = Number(a.slice("--top=".length));
      if (Number.isFinite(n) && n > 0) topN = Math.floor(n);
    }
  }

  return { date, save, topN, tag, reportsDir, tradesDir };
}

async function main(): Promise<void> {
  const { date, save, tag, reportsDir, tradesDir, topN } = parseArgs(
    process.argv.slice(2)
  );

  const when = parseYmdToDate(date);
  const path = getTradesJsonlPath(tradesDir, when, tag);

  if (!existsSync(path)) {
    console.error(`No file: ${path}`);
    process.exitCode = 1;
    return;
  }

  const records = await readTradeJsonlFile(path);
  const report = buildTradeSummaryReport(records, date, path);

  console.log(formatTradeSummaryConsole(report, topN));

  if (save) {
    const out = getDefaultTradeSummaryJsonPath(reportsDir, date, tag);
    await saveTradeSummaryJson(out, report);
    console.log(`\nSaved: ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

