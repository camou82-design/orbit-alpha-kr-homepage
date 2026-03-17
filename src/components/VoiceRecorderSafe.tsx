"use client";

import React, { useRef, useState } from "react";
import { saveMediaSafe } from "@/lib/mediaStore";
import { fileToDataUrl } from "@/lib/fileToDataUrl";

export default function VoiceRecorderSafe({ sessionId, onSaved }: { sessionId: string; onSaved?: () => void }) {
    const [recording, setRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const timerRef = useRef<any>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);

            mediaRecorderRef.current = mediaRecorder;
            chunks.current = [];

            mediaRecorder.ondataavailable = (e) => {
                chunks.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                clearTimeout(timerRef.current);
                try {
                    const blob = new Blob(chunks.current, { type: "audio/webm" });
                    const base64Data = await fileToDataUrl(blob);

                    await saveMediaSafe({
                        id: crypto.randomUUID(),
                        sessionId,
                        type: "audio",
                        dataUrl: base64Data,
                        createdAt: new Date().toISOString(),
                    });

                    alert("음성 저장 완료");
                    if (onSaved) onSaved();
                } catch (err) {
                    console.error(err);
                    alert("음성 저장 오류 발생 (안내: 화면은 멈추지 않습니다)");
                } finally {
                    stream.getTracks().forEach(track => track.stop());
                }
            };

            mediaRecorder.start();
            setRecording(true);

            // 60초 후 자동 종료
            timerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current?.state === "recording") {
                    mediaRecorderRef.current.stop();
                    setRecording(false);
                    alert("최대 녹음 시간(60초) 초과로 자동 종료되었습니다.");
                }
            }, 60000);

        } catch (error) {
            console.error(error);
            alert("마이크 열기 실패 - 브라우저 권한을 확인해주세요.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
            setRecording(false);
        }
    };

    return (
        <button
            onClick={recording ? stopRecording : startRecording}
            style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "12px", background: recording ? "#e53e3e" : "#1e63d6", color: "white",
                borderRadius: 12, cursor: "pointer", fontWeight: "bold", fontSize: 13, border: "none"
            }}
        >
            {recording ? "⏹ 녹음 중지" : "🎤 녹음 시작"}
        </button>
    );
}
