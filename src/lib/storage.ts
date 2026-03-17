"use client";

import { KEY_PREFIX } from "./config";
import { getRules, normalizeIndustry, type IndustryKey } from "@/lib/semi";

// --- Helpers ---
function safeStringify(obj: any) {
    try {
        return JSON.stringify(obj);
    } catch (e) {
        return "";
    }
}

function safeParse<T>(str: string | null, fallback: T): T {
    if (!str) return fallback;
    try {
        return JSON.parse(str) as T;
    } catch (e) {
        return fallback;
    }
}

export type SemiSubmission = {
    timestamp: string;
    step1: any;
    step2: any;
    step3: any;
    step4: any;
    step5: {
        confirmed: boolean;
        evaluation?: any;
    };
};

export type AuthState = {
    loggedIn: boolean;
    role: "worker" | "admin";
    name?: string;
    loginAt: string;
};

const AUTH_KEY = `${KEY_PREFIX}:auth`;

const KEY = {
    semiStep1: `${KEY_PREFIX}:semi:step1`,
    semiStep2: `${KEY_PREFIX}:semi:step2`,
    semiStep3: `${KEY_PREFIX}:semi:step3`,
    semiStep4: `${KEY_PREFIX}:semi:step4`,
    semiStep5: `${KEY_PREFIX}:semi:step5`,
    semiSubmissions: `${KEY_PREFIX}:semi:submissions:v1`,
};

export const Storage = {
    semi: {
        // ---- Step 0 (Clear) ----
        resetDraft() {
            if (typeof window === "undefined") return;
            localStorage.removeItem(KEY.semiStep1);
            localStorage.removeItem(KEY.semiStep2);
            localStorage.removeItem(KEY.semiStep3);
            localStorage.removeItem(KEY.semiStep4);
            localStorage.removeItem(KEY.semiStep5);
        },

        // ---- Step 1 ----
        saveStep1(payload: {
            workArea: string;
            vendor: string;
            industry: string;
            detailLocation: string;
            crewCount: number; // ✅
        }) {
            if (typeof window === "undefined") return;
            localStorage.setItem(KEY.semiStep1, safeStringify(payload));
        },
        loadStep1(): {
            workArea: string;
            vendor: string;
            industry: string;
            detailLocation: string;
            crewCount: number;
        } | null {
            if (typeof window === "undefined") return null;
            const data = safeParse<any>(localStorage.getItem(KEY.semiStep1), null);
            if (data) {
                if (data.industry) {
                    data.industry = normalizeIndustry(data.industry);
                }
                if (data.people && data.crewCount === undefined) {
                    data.crewCount = parseInt(data.people, 10) || 1;
                }
                if (data.crewCount === undefined) data.crewCount = 1;
            }
            return data;
        },

        // ---- Step 2 ----
        saveStep2(payload: {
            industry: string;
            workTypes: string[];
            riskFlags: string[];
            checklistRate?: number;
            // ✅ crewCount 제거
        }) {
            if (typeof window === "undefined") return;
            localStorage.setItem(KEY.semiStep2, safeStringify(payload));
        },
        loadStep2(): {
            industry: string;
            workTypes: string[];
            riskFlags: string[];
            checklistRate?: number;
            // ✅ crewCount 제거
        } | null {
            if (typeof window === "undefined") return null;
            return safeParse(localStorage.getItem(KEY.semiStep2), null);
        },

        // ---- Step 3 (Equipments) ----
        saveStep3(payload: { equipments: string[]; evaluation?: any }) {
            if (typeof window === "undefined") return;
            localStorage.setItem(KEY.semiStep3, safeStringify(payload));
        },
        loadStep3(): { equipments: string[]; evaluation?: any } | null {
            if (typeof window === "undefined") return null;
            return safeParse<any>(localStorage.getItem(KEY.semiStep3), null);
        },

        // ---- Step 4 (Checks) ----
        saveStep4(payload: { safetyChecks: any[]; uncheckedAdds?: string[] }) {
            if (typeof window === "undefined") return;
            localStorage.setItem(KEY.semiStep4, safeStringify(payload));
        },
        loadStep4(): { safetyChecks: any[]; uncheckedAdds?: string[] } | null {
            if (typeof window === "undefined") return null;
            return safeParse<any>(localStorage.getItem(KEY.semiStep4), null);
        },

        // ---- Step 5 (Final) ----
        saveStep5(payload: { confirmed: boolean; evaluation?: any }) {
            if (typeof window === "undefined") return;
            localStorage.setItem(KEY.semiStep5, safeStringify(payload));
        },
        loadStep5(): { confirmed: boolean; evaluation?: any } | null {
            if (typeof window === "undefined") return null;
            const data = localStorage.getItem(KEY.semiStep5);
            return data ? JSON.parse(data) : null;
        },

        // ---- Result ----
        loadResult() {
            if (typeof window === "undefined") return null;
            try {
                return JSON.parse(localStorage.getItem("semi_result") || "null");
            } catch {
                return null;
            }
        },
        clearResult() {
            if (typeof window === "undefined") return;
            localStorage.removeItem("semi_result");
        },

        // Submissions API
        loadSubmissions(): SemiSubmission[] {
            if (typeof window === "undefined") return [];
            const data = localStorage.getItem(KEY.semiSubmissions);
            return data ? JSON.parse(data) : [];
        },
        appendSubmission(item: SemiSubmission) {
            if (typeof window === "undefined") return;
            const list = this.loadSubmissions();
            list.push(item);
            localStorage.setItem(KEY.semiSubmissions, JSON.stringify(list));
        },
        clearSubmissions() {
            if (typeof window === "undefined") return;
            localStorage.removeItem(KEY.semiSubmissions);
        },

        // ✅ 관리자 인증 추가
        loadAuth(): AuthState | null {
            if (typeof window === "undefined") return null;
            const raw = localStorage.getItem(AUTH_KEY);
            return raw ? JSON.parse(raw) : null;
        },

        saveAuth(data: { role: "admin" | "worker"; name?: string }) {
            if (typeof window === "undefined") return;
            const payload: AuthState = {
                loggedIn: true,
                role: data.role,
                name: data.name,
                loginAt: new Date().toISOString(),
            };
            localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
        },

        clearAuth() {
            if (typeof window === "undefined") return;
            localStorage.removeItem(AUTH_KEY);
        },

        // [PATCH] 업종 변경 시 다운스트림 정리 (꼬임 방지)
        sanitizeDownstreamByIndustry(industry: IndustryKey) {
            if (typeof window === "undefined") return;
            try {
                const rules = getRules(industry);
                const step1Key = KEY.semiStep1;
                const prevStep1 = safeParse<any>(localStorage.getItem(step1Key), null);
                const prevIndustry = normalizeIndustry(prevStep1?.industry);

                // 업종이 바뀌었거나 초기화가 필요한 경우 Step3 강제 초기화
                const industryChanged = prevIndustry !== industry;

                const step2 = this.loadStep2() || { workTypes: [], riskFlags: [], checklistRate: 0 };
                const step3 = this.loadStep3() || { equipments: [] };

                const allowWork = rules.allowedWorkTypes ?? new Set();
                const allowRisk = rules.allowedRisks ?? new Set();
                const allowEquip = rules.allowedEquipments ?? new Set();

                const nextWork = (step2.workTypes || []).filter(w => allowWork.has(w as any));
                const nextRisk = (step2.riskFlags || []).filter(r => allowRisk.has(r as any));

                // 업종 변경 시에는 장비를 아예 비우거나 필터링 강화
                let nextEquip = (step3.equipments || []).filter(e => allowEquip.has(e as any));
                if (industryChanged) {
                    nextEquip = []; // 유저 요구사항: 업종 변경 및 로드 시 equipments 강제 초기화
                    console.log("🛠 [Storage] Industry changed or first load, clearing Step 3 equipments to force integrity.");
                }

                const changed =
                    industryChanged ||
                    JSON.stringify(step2.workTypes || []) !== JSON.stringify(nextWork) ||
                    JSON.stringify(step2.riskFlags || []) !== JSON.stringify(nextRisk) ||
                    JSON.stringify(step3.equipments || []) !== JSON.stringify(nextEquip);

                if (changed) {
                    this.saveStep2({ ...step2, workTypes: nextWork, riskFlags: nextRisk });
                    this.saveStep3({ ...step3, equipments: nextEquip });
                }
            } catch (err) {
                console.error("sanitizeDownstreamByIndustry error:", err);
            }
        }
    }
};
