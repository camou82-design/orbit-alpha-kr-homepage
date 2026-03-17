import fs from "fs";
import path from "path";

/**
 * [lib/db.server.ts]
 * JSON 파일 기반 DB 접근 레이어 (db.json)
 */

export type WorkerStatus = "active" | "inactive";

export type Worker = {
    id: string;
    name: string;
    phone?: string;
    bank?: string;
    account?: string;
    holder?: string;
    wage?: string;
    memo?: string;
    status: WorkerStatus;
    rateManwon: number;
    createdAt: number;
    updatedAt: number;
    deleted?: boolean;
    deletedAt?: number;
    transferConfirmed?: boolean; // rates 필드
    isTransferred?: boolean;     // legacy 필드
    paid?: boolean;              // legacy 필드
    bankName?: string;
    bankAccount?: string;
    bankHolder?: string;
    teamId?: string | null;
    paymentType?: string | null;
};

export type Team = {
    id: string;
    teamName: string;
    leaderName?: string;
    leaderPhone?: string;
    leaderBankName?: string;
    leaderAccountNumber?: string;
    leaderAccountHolder?: string;
    teamType?: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string;
};

export type Site = {
    id: string;
    name: string;
    deleted?: boolean;
    deletedAt?: number;
};

export type Attendance = {
    id: string;
    date: string; // YYYY-MM-DD
    workerId: string;
    siteId: string;
    createdAt: number;
};

export type Rate = {
    id: string;
    workerId: string;
    siteId: string;
    siteName?: string;
    workerName?: string;
    rateManwon: number;
    updatedAt: number;
};

export type SubmissionStatus = "pending" | "confirmed";

export type Submission = {
    id: string;
    siteId: string;
    siteName: string;
    workers: any[]; // [부장님 지시] 객체 배열로 변경하여 데이터 보존
    timestamp: number;
    status: SubmissionStatus;
    payoutType?: string;
    submittedDateKey?: string;
    submittedMonthKey?: string;
    deleted?: boolean;
    deletedAt?: number;
    updatedAt?: number;
    workerCount?: number;
    workerNames?: string[];
};

type DB = {
    workers: Worker[];
    sites: Site[];
    attendance: Attendance[];
    rates: Rate[];
    submissions: Submission[];
    teams: Team[];
};

const DB_PATH = path.join(process.cwd(), "data", "db.json");

export function readDB(): DB {
    if (!fs.existsSync(DB_PATH)) {
        return { workers: [], sites: [], attendance: [], rates: [], submissions: [], teams: [] };
    }
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
}

export function writeDB(db: DB) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export function uid(prefix = "") {
    return prefix + Math.random().toString(36).slice(2, 11).toUpperCase();
}

/**
 * 환경변수 기반 KST 보정 (배포 환경 대비)
 * Vercel 등은 기본적으로 UTC 기준이므로 +9시간 필요
 */
export function getKSTDate() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kstOffset = 9 * 60 * 60000;
    return new Date(utc + kstOffset);
}

export function todayYMD() {
    const d = getKSTDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

import { parseWageMan } from "./rates";

export function normalizeRateManwon(v: any): number {
    return parseWageMan(v);
}
