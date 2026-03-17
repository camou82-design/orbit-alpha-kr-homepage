"use client";

import React, { useEffect, useState } from "react";
import { getMediaBySessionSafe } from "@/lib/mediaStore";

export default function MediaGallerySafe({ sessionId, refreshKey }: { sessionId: string; refreshKey?: number }) {
    const [media, setMedia] = useState<any[]>([]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const list = await getMediaBySessionSafe(sessionId);
                if (mounted) setMedia(list);
            } catch (err) {
                console.error("미디어 갤러리 불러오기 실패", err);
            }
        })();
        return () => { mounted = false; };
    }, [sessionId, refreshKey]);

    if (media.length === 0) return null;

    return (
        <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, opacity: 0.9 }}>
                첨부 미디어 ({media.length}건)
            </div>
            <div style={{
                display: "flex", gap: 10, flexWrap: "wrap",
                background: "rgba(255,255,255,0.04)", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)"
            }}>
                {media.map((item) => {
                    if (item.type === "photo") {
                        return (
                            <img key={item.id} src={item.dataUrl} width={80} height={80} style={{ objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)" }} alt="첨부 사진" />
                        );
                    }
                    if (item.type === "audio") {
                        return (
                            <div key={item.id} style={{ display: "flex", alignItems: "center", background: "#000", borderRadius: 8, padding: 4 }}>
                                <audio controls src={item.dataUrl} style={{ height: 32, width: 200 }} />
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
        </div>
    );
}
