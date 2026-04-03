import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface LiveTestOrderDayState {
  date: string;
  count: number;
}

function defaultPath(): string {
  const raw = process.env.LIVE_TEST_STATE_FILE?.trim();
  if (raw && raw.length > 0) return join(process.cwd(), raw);
  return join(process.cwd(), "data", "live-test-order-state.json");
}

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ ?? "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function readLiveTestOrderDayState(): LiveTestOrderDayState {
  const path = defaultPath();
  try {
    const t = readFileSync(path, "utf8");
    const j = JSON.parse(t) as LiveTestOrderDayState;
    if (typeof j.date === "string" && typeof j.count === "number") return j;
  } catch {
    /* empty */
  }
  return { date: todayKst(), count: 0 };
}

export function getLiveTestOrdersToday(): number {
  const st = readLiveTestOrderDayState();
  const d = todayKst();
  if (st.date !== d) return 0;
  return st.count;
}

export function incrementLiveTestOrdersToday(): LiveTestOrderDayState {
  const path = defaultPath();
  mkdirSync(dirname(path), { recursive: true });
  const d = todayKst();
  const prev = readLiveTestOrderDayState();
  const next: LiveTestOrderDayState =
    prev.date === d
      ? { date: d, count: prev.count + 1 }
      : { date: d, count: 1 };
  writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
  return next;
}
