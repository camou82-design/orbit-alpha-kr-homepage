import fs from "fs";
import path from "path";
import { getChosung, normalizeName } from "./hangul";
import { normalizeWon } from "./rates";

// ✅ DB 경로 고정 (data/db.json)
const DB_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DB_DIR, "db.json");

// 경로 확인용 로그 (서버 가동 시 1회)
if (!(global as any)._dbPathLogged) {
  console.log("-----------------------------------------");
  console.log("📂 DATABASE PATH (FIXED):", DB_PATH);
  console.log("-----------------------------------------");
  (global as any)._dbPathLogged = true;
}

/** 간단 ID (prefix_ + 랜덤8자리 + 36진수 시간) */
export function uid(prefix = "ID") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function ensureDbFile() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2), "utf-8");
  }
}

export function readDb() {
  const fallback = {
    submissions: [],
    locks: [],
    site_aliases: [],
    workers: [],
    sites: [],
    rates: [],
    worker_rates: [],
    worker_profiles: [],
    attendance: [],
    teams: [],
    team_members: []
  };
  try {
    ensureDbFile();
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    if (!raw) return fallback;
    const db = JSON.parse(raw);
    return migrateDb(db);
  } catch (e) {
    console.error("Legacy DB Read failure (Corrupted JSON?). Backing up...");
    const backupPath = `${DB_PATH}.corrupt.${Date.now()}.json`;
    if (fs.existsSync(DB_PATH)) fs.renameSync(DB_PATH, backupPath);
    return fallback;
  }
}

export function writeDb(db: any) {
  ensureDbFile();
  const fixed = migrateDb(db);
  const tmpPath = `${DB_PATH}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(fixed, null, 2), "utf-8");
    fs.renameSync(tmpPath, DB_PATH);
  } catch (e) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    console.error("writeDb Error:", e);
    throw e;
  }
}

function nowISO() {
  return new Date().toISOString();
}

/** ✅ 실무형 보정: 필드 없으면 기본값 주입 */
export function migrateDb(db: any) {
  db ||= {};

  // ✅ [부장님 지시] 각 필드 배열 여부 검증 및 교정 (방탄 코드)
  db.sites = Array.isArray(db.sites) ? db.sites : [];
  db.workers = Array.isArray(db.workers) ? db.workers : [];
  db.rates = Array.isArray(db.rates) ? db.rates : [];
  db.worker_rates = Array.isArray(db.worker_rates) ? db.worker_rates : [];
  db.worker_profiles = Array.isArray(db.worker_profiles) ? db.worker_profiles : [];
  db.locks = typeof db.locks === 'object' && db.locks !== null && !Array.isArray(db.locks) ? db.locks : {};
  db.submissions = Array.isArray(db.submissions) ? db.submissions : [];
  db.site_aliases = Array.isArray(db.site_aliases) ? db.site_aliases : [];
  db.attendance = Array.isArray(db.attendance) ? db.attendance : [];
  db.teams = Array.isArray(db.teams) ? db.teams : [];
  db.team_members = Array.isArray(db.team_members) ? db.team_members : [];

  // sites
  for (const s of db.sites) {
    if (!s) continue;
    if (!s.id) s.id = uid("S");
    if (!s.name) s.name = String(s.id);

    // ✅ 표준 현장 고도화 필드
    if (s.chosung === undefined) s.chosung = getChosung(s.name);
    if (s.normalized === undefined) s.normalized = normalizeName(s.name);
    if (!Array.isArray(s.aliases)) s.aliases = [];

    if (!s.createdAt) s.createdAt = nowISO();
  }

  // workers
  for (const w of db.workers) {
    if (!w) continue;
    if (!w.id) w.id = uid("W");
    if (!w.name) w.name = "-";
    if (w.currentRateWon === undefined && w.unitPrice !== undefined) {
      w.currentRateWon = w.unitPrice;
      delete w.unitPrice;
    }
    if (typeof w.currentRateWon !== "number") {
      const r = (db.worker_rates || []).find((x: any) => String(x.workerId) === String(w.id));
      // r.won or r.dailyWage
      const wage = r ? (r.won ?? r.dailyWage ?? 0) : 0;
      w.currentRateWon = Number(wage || w.currentRateWon || 0);
    }

    // ✅ [부장님 지시] 단가 규격 정규화
    try {
      w.currentRateWon = normalizeWon(w.currentRateWon);
    } catch (e) {
      console.warn(`Worker ${w.id} 단가 보정 실패:`, e);
      w.currentRateWon = 0;
    }
    // 지급 그룹/계좌(옵션)
    if (!w.payToType) w.payToType = "PERSONAL"; // PERSONAL | LEADER | AGENCY
    if (!w.payToName) w.payToName = w.name;
    if (!w.payToAccount) w.payToAccount = "";

    // ✅ 신규 계좌 필드 (bankName, bankAccount, bankHolder)
    if (w.bankName === undefined) w.bankName = "";
    if (w.bankAccount === undefined) w.bankAccount = "";
    if (!w.bankHolder) w.bankHolder = "";

    // ✅ 팀 관련 필드 (teamId)
    if (w.teamId === undefined) w.teamId = null;

    if (!w.createdAt) w.createdAt = nowISO();
  }

  // attendance
  for (const a of db.attendance) {
    if (!a) continue;
    if (!a.id) a.id = uid("AT");
    if (!a.createdAt) a.createdAt = nowISO();
    if (typeof a.present !== "boolean") a.present = true;

    // ✅ 핵심: valid(soft delete) 기본 true
    if (typeof a.valid !== "boolean") a.valid = true;

    if (!a.source) a.source = "leader"; // leader | admin
    if (!a.payStatus) a.payStatus = "UNPAID"; // UNPAID | CONFIRMED | PAID

    // 과거 호환 필드(있어도 무방)
    if (!a.siteId && a.site) a.siteId = a.site;

    // ✅ [부장님 지시] 출근 기록 단가도 자동 보정
    if (a.unitPriceWon === undefined && a.unitPrice !== undefined) {
      a.unitPriceWon = a.unitPrice;
      delete a.unitPrice;
    }
    if (a.unitPriceWon != null) {
      try {
        a.unitPriceWon = normalizeWon(a.unitPriceWon);
      } catch (e) {
        a.unitPriceWon = 0;
      }
    }

    // ✅ 팀 관련 필드 (teamId)
    if (a.teamId === undefined) a.teamId = null;
  }

  // submissions
  for (const sub of db.submissions) {
    if (!sub) continue;
    if (sub.settlementMode === undefined) sub.settlementMode = "individual";
    if (sub.teamId === undefined) sub.teamId = null;
  }

  for (const r of db.worker_rates) {
    if (!r) continue;
    if (r.won === undefined && r.dailyWage !== undefined) {
      r.won = r.dailyWage;
      delete r.dailyWage;
    }
    try {
      r.won = normalizeWon(r.won);
    } catch (e) {
      r.won = 0;
    }
  }

  // ✅ [부장님 지시] 현장별 기본 단가도 정규화
  for (const sr of db.rates) {
    if (!sr) continue;
    if (sr.currentWon === undefined && sr.unitPrice !== undefined) {
      sr.currentWon = sr.unitPrice;
      delete sr.unitPrice;
    }
    try {
      sr.currentWon = sr.currentWon ? normalizeWon(sr.currentWon) : 0;
    } catch (e) {
      sr.currentWon = 0;
    }
  }

  return db;
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}