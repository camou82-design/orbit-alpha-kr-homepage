import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, sanitizeExperimentTag } from "../infra/config.js";
import {
  buildSignalSummaryReport,
  formatSignalSummaryConsole,
  getDefaultSignalJsonlPath,
  getDefaultSummaryJsonPath,
  readSignalJsonlFile,
  saveSignalSummaryJson,
} from "../reports/signal-summary.js";

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseArgs(argv: string[]): {
  date: string;
  save: boolean;
  topN: number;
  signalsDir: string;
  reportsDir: string;
  experimentTag: string | null;
} {
  let date = todayYmd();
  let save = false;
  let topN = 5;
  const config = loadConfig();
  let signalsDir = resolve(process.env.SIGNALS_DIR ?? config.signalsDir);
  let reportsDir = resolve(process.env.REPORTS_DIR ?? "data/reports");
  let experimentTag: string | null = config.experimentTag;

  for (const a of argv) {
    if (a.startsWith("--date=")) {
      date = a.slice("--date=".length).trim();
    } else if (a === "--save") {
      save = true;
    } else if (a.startsWith("--top=")) {
      const n = Number(a.slice("--top=".length));
      if (Number.isFinite(n) && n > 0) topN = Math.floor(n);
    } else if (a.startsWith("--signals-dir=")) {
      signalsDir = resolve(a.slice("--signals-dir=".length));
    } else if (a.startsWith("--reports-dir=")) {
      reportsDir = resolve(a.slice("--reports-dir=".length));
    } else if (a.startsWith("--tag=")) {
      const raw = a.slice("--tag=".length);
      experimentTag =
        raw.trim() === "" ? null : sanitizeExperimentTag(raw) ?? null;
    }
  }

  return { date, save, topN, signalsDir, reportsDir, experimentTag };
}

async function main(): Promise<void> {
  const { date, save, topN, signalsDir, reportsDir, experimentTag } = parseArgs(
    process.argv.slice(2)
  );
  const path = getDefaultSignalJsonlPath(signalsDir, date, experimentTag);

  if (!existsSync(path)) {
    console.error(`No file: ${path}`);
    process.exitCode = 1;
    return;
  }

  const records = await readSignalJsonlFile(path);
  const report = buildSignalSummaryReport(records, date, path, topN);

  console.log(formatSignalSummaryConsole(report));

  if (save) {
    const out = getDefaultSummaryJsonPath(reportsDir, date, experimentTag);
    await saveSignalSummaryJson(out, report);
    console.log(`\nSaved: ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
