"use client";

import React, { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Storage } from "@/lib/storage";

type Props = {
    step: number;
    title: string;
    children: ReactNode;
    canNext?: boolean;
    onNext?: () => void;
    nextLabel?: string;
    hideFooter?: boolean;
    onPrev?: () => void;
};

export default function StepLayout({ step, title, children, canNext = true, onNext, nextLabel = "다음 단계로", hideFooter = false, onPrev }: Props) {
    const percent = Number.isFinite(step) ? (step / 5) * 100 : 0;
    const router = useRouter();

    const handlePrev = () => {
        if (onPrev) {
            onPrev();
        } else {
            router.back();
        }
    };

    const handleLogout = () => {
        if (confirm("로그아웃 하시겠습니까? 작성 중인 데이터가 초기화됩니다.")) {
            Storage.semi.resetDraft();
            router.replace("/admin/login");
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "linear-gradient(180deg,#071426,#0b1f3a)",
                color: "white",
                display: "flex",
                justifyContent: "center",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 430,
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    minHeight: "100vh",
                }}
            >
                <div
                    style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 50,
                        background: "linear-gradient(180deg,#071426 80%,transparent)",
                        padding: "20px 20px 10px 20px",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2ee59d", boxShadow: "0 0 8px #2ee59d" }} />
                            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>JJ해체정리 서비스</div>
                        </div>
                        <button
                            onClick={handleLogout}
                            style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "rgba(255,255,255,0.4)",
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                padding: "4px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                            }}
                        >
                            로그아웃
                        </button>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 800 }}>{title}</span>
                        <span style={{ fontSize: 16, fontWeight: 900, color: "#2ee59d" }}>STEP {step}/5</span>
                    </div>
                    <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${percent}%`, height: "100%", background: "#1e63d6", borderRadius: 2, transition: "width 0.3s ease" }} />
                    </div>
                </div>

                <div style={{ flex: 1, padding: "20px 20px 100px 20px" }}>
                    {children}
                </div>

                {!hideFooter && (
                    <div
                        style={{
                            position: "sticky",
                            bottom: 0,
                            padding: "20px",
                            background: "linear-gradient(0deg,#0b1f3a 90%,transparent)",
                            display: "flex",
                            gap: 12,
                            width: "100%",
                        }}
                    >
                        <button
                            type="button"
                            onClick={handlePrev}
                            style={{
                                flex: 1,
                                padding: "16px",
                                borderRadius: 14,
                                background: "rgba(255,255,255,0.1)",
                                color: "white",
                                fontWeight: 800,
                                fontSize: 16,
                                border: "1px solid rgba(255,255,255,0.2)",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                            }}
                        >
                            이전
                        </button>
                        <button
                            type="button"
                            disabled={!canNext}
                            onClick={onNext}
                            style={{
                                flex: 1,
                                padding: "16px",
                                borderRadius: 14,
                                background: canNext ? "linear-gradient(180deg, #1e63d6, #154ca8)" : "rgba(255,255,255,0.05)",
                                color: canNext ? "white" : "rgba(255,255,255,0.3)",
                                fontWeight: 800,
                                fontSize: 16,
                                border: canNext ? "none" : "1px solid rgba(255,255,255,0.1)",
                                cursor: canNext ? "pointer" : "not-allowed",
                                opacity: canNext ? 1 : 0.6,
                                transition: "all 0.2s ease",
                            }}
                        >
                            {canNext ? nextLabel : "입력을 완료해주세요"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
