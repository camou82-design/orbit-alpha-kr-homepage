// src/lib/semi/server/db.ts

import fs from "fs";
import path from "path";
import { FinalSubmission } from "../shared/types";

const DATA_DIR = path.join(process.cwd(), "src/data");
const DB_FILE = path.join(DATA_DIR, "submissions.jsonl");

// 데이터 디렉토리 확인
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function saveSubmission(submission: FinalSubmission) {
    const line = JSON.stringify(submission) + "\n";
    fs.appendFileSync(DB_FILE, line, "utf8");

    // 매번 엑셀을 갱신할지, 아니면 요청 시 할지는 정책에 따라 결정
    // 여기서는 파일 추가만 우선 수행
}

export function loadAllSubmissions(): FinalSubmission[] {
    if (!fs.existsSync(DB_FILE)) return [];
    const content = fs.readFileSync(DB_FILE, "utf8");
    return content.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
}
