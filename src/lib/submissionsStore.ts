import "server-only";
import fs from "fs";
import path from "path";
import { stripRawPrefix, normalizeRawKey } from "./siteUtils";

// ✅ [규격 통일] A. 데이터 규격
export type SubmissionStatus = "pending" | "confirmed";

export type Submission = {
    id: string;
    date: string;          // YYYY-MM-DD
    siteRawName: string;   // 리더가 입력한 원본 이름
    siteId?: string;       // 관리자가 매핑한 표준 ID
    workerIds: string[];   // ✅ 반드시 ID 배열만 저장
    timestamp: number;
    status: SubmissionStatus;
    workerCount?: number;
    workerNames?: string[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "db.json");

type DB = {
    locks: any[];
    submissions: Submission[];
    site_aliases: any[];
    workers: any[];
    sites: any[];
};

/**
 * ✅ [안전장치] I. 마이그레이션/초기화
 */
function ensure() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const factory = (): DB => ({
        locks: [],
        submissions: [],
        site_aliases: [],
        workers: [],
        sites: []
    });

    if (!fs.existsSync(FILE)) {
        fs.writeFileSync(FILE, JSON.stringify(factory(), null, 2), "utf-8");
        return;
    }

    // 기존 파일이 있으면 구조 검사 및 보정
    try {
        const raw = fs.readFileSync(FILE, "utf-8");
        const db = JSON.parse(raw);
        let changed = false;

        const keys: (keyof DB)[] = ["locks", "submissions", "site_aliases", "workers", "sites"];
        keys.forEach(k => {
            if (!Array.isArray(db[k])) {
                db[k] = [];
                changed = true;
            }
        });

        if (changed) {
            fs.writeFileSync(FILE, JSON.stringify(db, null, 2), "utf-8");
        }
    } catch (e) {
        // [부장님 지시] 파일 깨짐 감지 시 백업 후 초기화
        console.error("DB Corruption detected in ensure! Backing up...");
        const backupPath = `${FILE}.corrupt.${Date.now()}.json`;
        if (fs.existsSync(FILE)) fs.renameSync(FILE, backupPath);
        fs.writeFileSync(FILE, JSON.stringify(factory(), null, 2), "utf-8");
    }
}

/**
 * ✅ [안전장치] H. DB 파일 손상 방지 (Atomic Write)
 */
function writeDB(db: DB) {
    ensure();
    const tempFile = `${FILE}.tmp`;
    try {
        const content = JSON.stringify(db, null, 2);
        fs.writeFileSync(tempFile, content, "utf-8");
        fs.renameSync(tempFile, FILE);
    } catch (e) {
        console.error("Critical DB Write failure:", e);
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        throw new Error("DB_WRITE_FAILED");
    }
}

function readDB(): DB {
    ensure();
    const fallback: DB = { locks: [], submissions: [], site_aliases: [], workers: [], sites: [] };
    try {
        const raw = fs.readFileSync(FILE, "utf-8");
        if (!raw) return fallback;
        const db = JSON.parse(raw);

        // ✅ [부장님 지시] 각 필드 배열 여부 검증 및 교정
        return {
            locks: Array.isArray(db.locks) ? db.locks : [],
            submissions: Array.isArray(db.submissions) ? db.submissions : [],
            site_aliases: Array.isArray(db.site_aliases) ? db.site_aliases : [],
            workers: Array.isArray(db.workers) ? db.workers : [],
            sites: Array.isArray(db.sites) ? db.sites : []
        };
    } catch (e) {
        // [부장님 지시] 읽기 실패 시 백업 후 빈 배열 반환
        console.error("Critical DB Read failure. Corrupt? Backing up...", e);
        const backupPath = `${FILE}.corrupt.${Date.now()}.json`;
        if (fs.existsSync(FILE)) fs.renameSync(FILE, backupPath);
        return fallback;
    }
}

function makeId() {
    return `S_${Date.now().toString(16)}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

function todayISO() {
    const d = new Date();
    return d.toISOString().split('T')[0];
}

/**
 * ✅ [안전장치] B. 리더 제출 저장 (규격 준수)
 */
export function createSubmission(input: {
    siteRawName: string;
    siteId?: string;
    workerIds: string[];
    timestamp?: number;
}) {
    const db = readDB();

    const item: Submission = {
        id: makeId(),
        date: todayISO(),
        siteRawName: input.siteRawName,
        siteId: input.siteId,
        workerIds: Array.isArray(input.workerIds) ? input.workerIds.filter(Boolean) : [],
        timestamp: input.timestamp || Date.now(),
        status: "pending",
    };

    db.submissions.unshift(item);
    writeDB(db);
    return item;
}

/**
 * ✅ [안전장치] RAW_ 접두사/키 처리 (이미 siteUtils.ts로 이동됨)
 * submissionsStore.ts 내부 작업을 위해 siteUtils에서 가져온 것 사용.
 * 화면(client)은 submissionsStore가 아닌 siteUtils를 직접 볼 것.
 */
export { stripRawPrefix, normalizeRawKey };

/**
 * ✅ [안전장치] E. 관리자 인박스용 조회
 */
export function listSubmissions(filter?: { status?: SubmissionStatus; statuses?: SubmissionStatus[] }) {
    const db = readDB();
    // ✅ items 가 반드시 배열임을 보장
    let items = Array.isArray(db.submissions) ? db.submissions : [];

    const statuses = filter?.statuses || (filter?.status ? [filter.status] : null);
    if (statuses) {
        items = items.filter(s => s && statuses.includes(s.status));
    }

    // 표시 데이터 보완 (Point E)
    const workerMap = new Map((db.workers || []).map(w => [w.id || w.workerId, w.name]));
    const siteMap = new Map((db.sites || []).map(s => [s.id, s.name]));

    return items.map(s => {
        if (!s) return null;
        const workerIds = Array.isArray(s.workerIds) ? s.workerIds : [];
        const workerNames = workerIds.map(id => workerMap.get(id) || `미등록(${id})`);

        // ✅ [부장님 지시] 사이트 이름 노출 방식 고도화
        let siteLabel = "현장 미지정";
        if (s.siteId) {
            siteLabel = siteMap.get(s.siteId) || stripRawPrefix(s.siteRawName);
        } else {
            siteLabel = stripRawPrefix(s.siteRawName);
        }

        return {
            ...s,
            workerCount: workerIds.length,
            workerNames,
            siteLabel
        };
    }).filter(Boolean);
}

export function confirmSubmission(id: string) {
    const db = readDB();
    const idx = db.submissions.findIndex(s => s.id === id);
    if (idx < 0) return null;

    db.submissions[idx].status = "confirmed";
    writeDB(db);
    return db.submissions[idx];
}
