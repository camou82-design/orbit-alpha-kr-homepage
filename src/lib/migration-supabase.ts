import { readDB } from "./db.server";
import { supabase } from "./supabase";

/**
 * [lib/migration-supabase.ts]
 * db.json -> Supabase Migration 수동 실행용 초안
 * 🚨 주의: 지금 당장 자동 실행 금지. 필요 시 수동 호출하여 사용.
 */

export async function migrateToSupabase() {
    console.log("🚀 Migration Start: db.json -> Supabase");
    const db = readDB();

    // 1. Workers Migration
    console.log(`- Migrating ${db.workers.length} workers...`);
    for (const w of db.workers) {
        const { error } = await supabase.from("workers").upsert({
            name: w.name,
            phone: w.phone,
            wage: w.rateManwon || 0,
            bank_name: w.bank || w.bankName,
            account_number: w.account || w.bankAccount,
            account_holder: w.holder || w.bankHolder,
            memo: w.memo,
            is_active: w.status === "active",
            deleted_at: w.deleted ? new Date(w.deletedAt || Date.now()).toISOString() : null,
            created_at: new Date(w.createdAt).toISOString(),
            updated_at: new Date(w.updatedAt).toISOString(),
        }, { onConflict: "name" }); // 이름 중복 시 업데이트 (예시)
        if (error) console.error(`  ❌ Worker error (${w.name}):`, error.message);
    }

    // 2. Submissions Migration
    console.log(`- Migrating ${db.submissions.length} submissions...`);
    for (const sub of db.submissions) {
        // submissions 테이블 삽입
        const { data: subData, error: subError } = await supabase.from("submissions").insert({
            site_name: sub.siteName,
            payout_type: (sub.payoutType || "").includes("원청") ? "원청지급" : "jj해체정리",
            status: sub.status,
            submitted_at: new Date(sub.timestamp).toISOString(),
            submitted_date_key: sub.submittedDateKey || "",
            submitted_month_key: sub.submittedMonthKey || "",
            created_at: new Date(sub.timestamp).toISOString(),
        }).select("id").single();

        if (subError) {
            console.error(`  ❌ Submission error (${sub.siteName}):`, subError.message);
            continue;
        }

        const submissionId = subData.id;

        // 3. Submission Workers (Nested) Migration
        // db.json의 submission.workers는 string[] 또는 object[] 일 수 있음
        const workersArray = Array.isArray(sub.workers) ? sub.workers : [];
        for (let i = 0; i < workersArray.length; i++) {
            const wObj = workersArray[i];
            const workerName = typeof wObj === "string" ? wObj : (wObj as any).name;

            // 실제 worker 매칭 (간략화된 예시)
            const dbWorker = db.workers.find(dw => dw.name === workerName);

            const { error: wError } = await supabase.from("submission_workers").insert({
                submission_id: submissionId,
                worker_id: null, // 필요 시 mapping 로직 추가 가능
                worker_name: workerName,
                wage_snapshot: dbWorker?.rateManwon || 0,
                bank_name_snapshot: dbWorker?.bank || dbWorker?.bankName,
                account_number_snapshot: dbWorker?.account || dbWorker?.bankAccount,
                account_holder_snapshot: dbWorker?.holder || dbWorker?.bankHolder,
                sort_order: i,
            });
            if (wError) console.error(`    ❌ Sub-Worker error (${workerName}):`, wError.message);
        }
    }

    console.log("✅ Migration Complete!");
}
