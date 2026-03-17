import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * [lib/supabase.ts]
 * Supabase 클라이언트 설정 (부장님 지시: 향후 DB 전환 준비)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy_key";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("⚠️ Supabase 환경 변수가 설정되지 않았습니다. .env.local을 확인해 주세요. DB 연동은 건너뜁니다.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * [부장님 지시: Workers 이중저장 유틸리티]
 */
export async function syncWorkerToSupabase(worker: any) {
    try {
        const payload = {
            id: toUUID(worker.id, "worker"),
            original_id: worker.id, // ✅ 원본 ID 보존
            name: worker.name,
            phone: worker.phone || null,
            wage: worker.rateManwon || 0,
            bank_name: worker.bank || worker.bankName || null,
            account_number: worker.account || worker.bankAccount || null,
            account_holder: worker.holder || worker.bankHolder || null,
            memo: worker.memo || null,
            is_active: worker.status === "active",
            deleted_at: worker.deleted ? new Date(worker.deletedAt || Date.now()).toISOString() : null,
            created_at: new Date(worker.createdAt || Date.now()).toISOString(),
            updated_at: new Date(worker.updatedAt || Date.now()).toISOString(),
            team_id: worker.teamId ? toUUID(worker.teamId, "team") : null,
            payment_type: worker.paymentType || null
        };

        const { error } = await supabase
            .from("workers")
            .upsert(payload, { onConflict: "original_id" });

        if (error) {
            console.error(`[Supabase Dual-Write Error] Name: ${worker.name}`, error);
            return { ok: false, error };
        }
        return { ok: true };
    } catch (e) {
        console.error(`[Supabase Dual-Write Exception] Name: ${worker.name}`, e);
        return { ok: false, error: e };
    }
}

/**
 * [부장님 지시: Submissions 이중저장 유틸리티]
 */
export async function syncSubmissionToSupabase(submission: any, workers: any[], dbWorkers: any[] = []) {
    try {
        const subId = toUUID(submission.id, "sub");

        // 1. Submission Header
        const subPayload = {
            id: subId,
            original_id: submission.id, // ✅ 원본 ID 보존
            site_name: submission.siteName,
            payout_type: submission.payoutType?.includes("jj") ? "jj해체정리" : "원청지급",
            status: submission.status || "pending",
            submitted_at: new Date(submission.timestamp || Date.now()).toISOString(),
            submitted_date_key: submission.submittedDateKey || "",
            submitted_month_key: submission.submittedMonthKey || "",
            note: submission.note || null,
            deleted_at: submission.deleted ? new Date(submission.deletedAt || Date.now()).toISOString() : null,
            created_at: new Date(submission.timestamp || Date.now()).toISOString(),
            updated_at: new Date(),
            settlement_mode: submission.settlementMode || "individual",
            team_id: submission.teamId ? toUUID(submission.teamId, "team") : null
        };

        const { error: subError } = await supabase
            .from("submissions")
            .upsert(subPayload, { onConflict: "original_id" });

        if (subError) throw subError;

        // 2. Submission Workers (Snapshotting)
        await supabase.from("submission_workers").delete().eq("submission_id", subId);

        if (workers.length > 0) {
            const workerMap = new Map();
            dbWorkers.forEach(w => workerMap.set(w.id, w));
            dbWorkers.forEach(w => workerMap.set(w.name, w));

            const workerPayloads = workers.map((w, idx) => {
                const wIdRaw = typeof w === "string" ? w : (w.workerId || w.id);
                const wName = typeof w === "string" ? w : (w.name || "");
                const dbW = workerMap.get(wIdRaw) || workerMap.get(wName);

                return {
                    id: toUUID(`${submission.id}_${idx}`, "sw"),
                    submission_id: subId,
                    worker_id: dbW ? toUUID(dbW.id, "worker") : null,
                    worker_name: wName || dbW?.name || "알수없음",
                    phone_snapshot: dbW?.phone || null,
                    wage_snapshot: dbW?.rateManwon || 0,
                    bank_name_snapshot: dbW?.bank || dbW?.bankName || null,
                    account_number_snapshot: dbW?.account || dbW?.bankAccount || null,
                    account_holder_snapshot: dbW?.holder || dbW?.bankHolder || null,
                    sort_order: idx,
                    created_at: new Date().toISOString()
                };
            });

            const { error: swError } = await supabase
                .from("submission_workers")
                .insert(workerPayloads);

            if (swError) throw swError;
        }

        return { ok: true };
    } catch (e) {
        console.error(`[Supabase Submission Sync Error] ID: ${submission.id}`, e);
        return { ok: false, error: e };
    }
}

/**
 * [유틸] 레거시 ID를 결정론적 UUID로 변환
 * Supabase uuid 타입을 만족시키기 위함
 */
export function toUUID(legacyId: string, namespace: string): string {
    if (!legacyId) return "00000000-0000-0000-0000-000000000000";
    const hash = crypto.createHash('sha1').update(namespace + legacyId).digest('hex');
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        '4' + hash.slice(13, 16),
        (parseInt(hash[16], 16) & 0x3 | 0x8).toString(16) + hash.slice(17, 20),
        hash.slice(20, 32)
    ].join('-');
}

/**
 * [부장님 지시: 팀 이중저장 유틸리티]
 */
export async function syncTeamToSupabase(team: any) {
    try {
        const payload = {
            id: toUUID(team.id, "team"),
            original_id: team.id,
            team_name: team.teamName,
            leader_name: team.leaderName || null,
            leader_phone: team.leaderPhone || null,
            leader_bank_name: team.leaderBankName || null,
            leader_account_number: team.leaderAccountNumber || null,
            leader_account_holder: team.leaderAccountHolder || null,
            team_type: team.teamType || null,
            is_active: !!team.isActive,
            deleted_at: team.deletedAt ? new Date(team.deletedAt).toISOString() : null,
            created_at: new Date(team.createdAt || Date.now()).toISOString(),
            updated_at: new Date(team.updatedAt || Date.now()).toISOString()
        };

        const { error } = await supabase
            .from("teams")
            .upsert(payload, { onConflict: "original_id" });

        if (error) {
            console.error(`[Supabase Team Sync Error] Name: ${team.teamName}`, error);
            return { ok: false, error };
        }
        return { ok: true };
    } catch (e) {
        console.error(`[Supabase Team Sync Exception] Name: ${team.teamName}`, e);
        return { ok: false, error: e };
    }
}

/**
 * [부장님 지시: 읽기 전환용 조력자]
 */

// 1. 작업자 목록 읽기
export async function getSupabaseWorkers() {
    try {
        const { data, error } = await supabase
            .from("workers")
            .select("*")
            .is("deleted_at", null)
            .order("name", { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) return null;

        return data.map(w => ({
            id: w.original_id || w.id, // ✅ 원본 ID 우선 반환
            name: w.name,
            phone: w.phone,
            rateManwon: Number(w.wage || 0),
            bank: w.bank_name,
            account: w.account_number,
            holder: w.account_holder,
            memo: w.memo,
            status: w.is_active ? "active" : "inactive",
            updatedAt: new Date(w.updated_at).getTime(),
            teamId: w.team_id,
            paymentType: w.payment_type || null
        }));
    } catch (e) {
        console.error("[Supabase Read Workers Error]", e);
        return null;
    }
}

// 2. 제출서 목록 읽기 (상세 스냅샷 포함)
export async function getSupabaseSubmissions(options: {
    includeOld?: boolean;
    dateKey?: string;
    monthKey?: string; // ✅ 월별 조회를 위함 (Reports 페이지용)
} = {}) {
    try {
        let query = supabase
            .from("submissions")
            .select(`
                *,
                submission_workers (*)
            `)
            .is("deleted_at", null);

        if (options.dateKey) {
            query = query.eq("submitted_date_key", options.dateKey);
        }

        if (options.monthKey) {
            query = query.eq("submitted_month_key", options.monthKey);
        }

        const { data, error } = await query
            .order("submitted_at", { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) return null;

        return data.map(s => ({
            id: s.original_id || s.id, // ✅ 원본 ID 우선 반환
            siteName: s.site_name,
            payoutType: s.payout_type,
            status: s.status,
            timestamp: new Date(s.submitted_at).getTime(),
            submittedDateKey: s.submitted_date_key,
            submittedMonthKey: s.submitted_month_key,
            workers: (s.submission_workers || []).map((sw: any) => ({
                workerId: sw.worker_name, // 이름 기반 매칭이 많으므로 이름 반환
                name: sw.worker_name,
                phone: sw.phone_snapshot,
                rateManwon: Number(sw.wage_snapshot || 0),
                bank: sw.bank_name_snapshot,
                account: sw.account_number_snapshot,
                holder: sw.account_holder_snapshot,
                sortOrder: sw.sort_order,
                transferConfirmed: sw.transfer_confirmed
            }))
        }));
    } catch (e) {
        console.error("[Supabase Read Submissions Error]", e);
        return null;
    }
}

// 3. 백업 데이터 전체 읽기 (비상용)
export async function getSupabaseBackupData() {
    try {
        const [wRes, sRes, swRes] = await Promise.all([
            supabase.from("workers").select("*").order("created_at", { ascending: true }),
            supabase.from("submissions").select("*").order("created_at", { ascending: true }),
            supabase.from("submission_workers").select("*").order("created_at", { ascending: true })
        ]);

        if (wRes.error) throw wRes.error;
        if (sRes.error) throw sRes.error;
        if (swRes.error) throw swRes.error;

        return {
            exportedAt: new Date().toISOString(),
            workers: wRes.data || [],
            submissions: sRes.data || [],
            submission_workers: swRes.data || []
        };
    } catch (e) {
        console.error("[Supabase Backup Export Error]", e);
        return null;
    }
}

/**
 * [복구 준비] JSON 데이터를 Supabase에 Upsert (복구용 초안)
 */
export async function restoreSupabaseFromBackup(backup: any) {
    try {
        if (!backup) throw new Error("BACKUP_DATA_MISSING");

        // 1. Workers 복구
        if (backup.workers?.length > 0) {
            const { error: wErr } = await supabase.from("workers").upsert(backup.workers);
            if (wErr) throw wErr;
        }

        // 2. Submissions 복구
        if (backup.submissions?.length > 0) {
            const { error: sErr } = await supabase.from("submissions").upsert(backup.submissions);
            if (sErr) throw sErr;
        }

        // 3. Submission Workers 복구
        if (backup.submission_workers?.length > 0) {
            const { error: swErr } = await supabase.from("submission_workers").upsert(backup.submission_workers);
            if (swErr) throw swErr;
        }

        return { ok: true };
    } catch (e) {
        console.error("[Supabase Restore Error]", e);
        return { ok: false, error: e };
    }
}

/**
 * [부장님 지시: Audit Log 저장 유틸리티]
 * 무엇이 언제 어떻게 바뀌었는지를 기록합니다.
 */
export async function saveAuditLog(params: {
    entityType: "worker" | "submission" | "submission_worker";
    entityId: string;
    action: "create" | "update" | "soft_delete" | "transfer_toggle";
    before?: any;
    after?: any;
    note?: string;
}) {
    try {
        const { entityType, entityId, action, before, after } = params;

        // 변경된 필드 추출
        const changedFields: string[] = [];
        if (action === "update" || action === "transfer_toggle") {
            const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
            for (const k of keys) {
                if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) {
                    changedFields.push(k);
                }
            }
        }

        // 끄덕끄덕 읽기 좋은 노트 생성
        let finalNote = params.note || "";
        if (!finalNote) {
            if (action === "create") finalNote = `${entityType} 신규 생성`;
            else if (action === "soft_delete") finalNote = `${entityType} 삭제(소프트)`;
            else if (changedFields.length > 0) finalNote = `${changedFields.join(", ")} 변경`;
        }

        const payload = {
            entity_type: entityType,
            entity_id: entityId,
            action,
            actor: "single-admin",
            before_data: before || null,
            after_data: after || null,
            changed_fields: changedFields,
            note: finalNote,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from("audit_logs").insert(payload);
        if (error) {
            console.error("[Audit Log Error]", error);
        }
    } catch (e) {
        // 비즈니스 로직에 영향을 주지 않도록 예외 처리
        console.error("[Audit Log Exception]", e);
    }
}

/**
 * [부장님 지시: 최근 이력 조회]
 */
export async function getAuditLogs(limit = 20) {
    try {
        const { data, error } = await supabase
            .from("audit_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error("[Audit Log Fetch Error]", e);
        return [];
    }
}

/**
 * [데이터 매핑 가이드]
 * 1. db.json: workers -> Table: workers
 * 2. db.json: submissions -> Table: submissions
 * 3. submission.workers[] -> Table: submission_workers (submission_id로 연결)
 */
