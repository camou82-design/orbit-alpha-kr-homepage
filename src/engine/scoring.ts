import type { Trigger } from "@/lib/triggerEngine";

export function computeFinalScore(baseScore: number, triggers: Trigger[]) {
    const safeBase = Number.isFinite(baseScore) ? baseScore : 0;
    const list = Array.isArray(triggers) ? triggers : [];

    const redCount = list.filter((t) => t?.severity === "RED").length;
    const amberCount = list.filter((t) => t?.severity === "AMBER").length;

    let finalScore = safeBase;

    // 가중치
    if (redCount === 1) finalScore += 20;
    if (redCount >= 2) finalScore += 35;
    if (amberCount >= 1) finalScore += 10;

    // 최소점 보장
    if (redCount >= 1 && finalScore < 65) finalScore = 65;
    if (redCount >= 2 && finalScore < 75) finalScore = 75;

    // 상/하한
    finalScore = Math.max(0, Math.min(100, finalScore));
    return finalScore;
}

export function evaluateSemi(input?: { processes?: string[] | null }) {
    const processes = input?.processes || [];
    const uniqueProcesses = Array.from(new Set(processes)).filter(Boolean);

    // Base Score: 10 per process, max 60.
    const baseScore = Math.min(uniqueProcesses.length * 10, 60);

    // Required People
    const fireWatch = uniqueProcesses.some(p => typeof p === "string" && (p.includes("용접") || p.includes("화기") || p.includes("열작업")));
    const signalman = uniqueProcesses.some(p => typeof p === "string" && (p.includes("T/L") || p.includes("크레인") || p.includes("양중") || p.includes("중량물")));
    const confined = uniqueProcesses.some(p => typeof p === "string" && p.includes("밀폐"));
    const loto = uniqueProcesses.some(p => typeof p === "string" && (p.includes("Shutdown") || p.includes("LOTO") || p.includes("차단")));

    // Red Items
    const redItems: { title: string; severity: "RED" | "AMBER" }[] = [];

    if (fireWatch && confined) {
        redItems.push({ title: "화기 + 밀폐 동시 작업", severity: "RED" });
    }
    if (signalman && uniqueProcesses.includes("고소작업")) {
        redItems.push({ title: "양중 + 고소 동시 작업", severity: "RED" });
    }
    if (loto) {
        redItems.push({ title: "LOTO/차단 작업 포함", severity: "RED" });
    }
    if (confined && redItems.filter(r => r.severity === "RED").length === 0) {
        redItems.push({ title: "밀폐공간 작업", severity: "AMBER" });
    }

    const redCount = redItems.filter(r => r.severity === "RED").length;

    let finalScore = Number(baseScore) + (Number(redCount) * 15);
    if (isNaN(finalScore)) finalScore = 0;
    finalScore = Math.max(0, Math.min(100, finalScore));

    let level: "LOW" | "CAUTION" | "HIGH" | "CRITICAL" = "LOW";
    if (finalScore >= 90) level = "CRITICAL";
    else if (finalScore >= 70) level = "HIGH";
    else if (finalScore >= 40) level = "CAUTION";

    return {
        baseScore,
        redItems,
        requiredPeople: {
            fireWatch,
            signalman,
            confined,
            loto
        },
        finalScore,
        level,
        redCount
    };
}
