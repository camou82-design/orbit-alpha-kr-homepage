"use client";

import React, { useRef, useState } from "react";
import { saveMediaSafe } from "@/lib/mediaStore";
import { fileToDataUrl } from "@/lib/fileToDataUrl";

export default function PhotoCaptureSafe({ sessionId, onSaved }: { sessionId: string; onSaved?: () => void }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);

    const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setLoading(true);
            const file = e.target.files?.[0];
            if (!file) return;

            // 4MB 초과 방지
            if (file.size > 4 * 1024 * 1024) {
                alert("사진 4MB 초과. 저장 금지.");
                return;
            }

            const base64Data = await fileToDataUrl(file);
            const id = crypto.randomUUID();

            await saveMediaSafe({
                id,
                sessionId,
                type: "photo",
                dataUrl: base64Data,
                createdAt: new Date().toISOString(),
            });

            alert("사진 저장 완료");
            if (onSaved) onSaved();
        } catch (err) {
            console.error(err);
            alert("사진 저장 오류 발생 (안내: 화면은 멈추지 않습니다)");
        } finally {
            setLoading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    return (
        <label style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "12px", background: loading ? "#555" : "#1e63d6", color: "white",
            borderRadius: 12, cursor: loading ? "wait" : "pointer", fontWeight: "bold", fontSize: 13, border: "none"
        }}>
            📸 {loading ? "저장중..." : "사진 촬영"}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                disabled={loading}
                onChange={handleCapture}
            />
        </label>
    );
}
