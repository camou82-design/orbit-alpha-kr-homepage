"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Storage } from "@/lib/storage";

type Props = {
    value: string;
    onChange: (v: string) => void;
};

export default function WorkAreaSelect({ value, onChange }: Props) {
    const [areas, setAreas] = useState<string[]>([]);
    const [custom, setCustom] = useState("");

    useEffect(() => {
        setAreas(Storage.semi.getWorkAreas());
    }, []);

    const selected = useMemo(() => (value ?? "").trim(), [value]);

    const add = () => {
        const n = custom.trim();
        if (!n) return;
        Storage.semi.addWorkArea(n);
        Storage.semi.setSelectedWorkArea(n);
        setAreas(Storage.semi.getWorkAreas());
        onChange(n);
        setCustom("");
    };

    return (
        <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontWeight: 700 }}>작업구역</label>

            <select
                value={selected}
                onChange={(e) => {
                    const v = e.target.value;
                    Storage.semi.setSelectedWorkArea(v);
                    onChange(v);
                }}
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            >
                <option value="">선택하세요</option>
                {areas.map((a) => (
                    <option key={a} value={a}>
                        {a}
                    </option>
                ))}
            </select>

            {selected ? <div style={{ fontSize: 12, opacity: 0.8 }}>선택됨: {selected}</div> : null}

            <div style={{ display: "flex", gap: 8 }}>
                <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="직접 입력/추가 (예: UTILITY)"
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
                />
                <button onClick={add} style={{ padding: "10px 14px", borderRadius: 8 }}>
                    추가
                </button>
            </div>
        </div>
    );
}
