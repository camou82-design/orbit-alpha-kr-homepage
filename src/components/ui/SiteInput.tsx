"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Site = { id: string; name: string; trade?: string };

export default function SiteInput(props: {
    value: string;
    onChange: (v: string) => void;
    onSavedPick?: (site: Site) => void; // 저장된 항목 클릭 시
}) {
    const { value, onChange, onSavedPick } = props;

    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    async function refresh() {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/sites", { cache: "no-store" });
            const j = await res.json();
            setSites(j?.items ?? j?.sites ?? []);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    const selectedSite = useMemo(
        () => sites.find((s) => s.id === selectedId) ?? null,
        [sites, selectedId]
    );

    const canMove = value.trim().length > 0;

    async function saveCurrent() {
        const name = value.trim();
        if (!name) return;

        const res = await fetch("/api/admin/sites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        const j = await res.json();
        const newSites: Site[] = j?.sites ?? [];
        setSites(newSites);

        // 방금 저장된 site를 선택 상태로
        const saved = j?.site as Site | undefined;
        if (saved?.id) setSelectedId(saved.id);

        // 저장됐으면 onSavedPick으로 알려주기(필요시)
        if (saved && onSavedPick) onSavedPick(saved);
    }

    return (
        <div className="w-full">
            <div className="flex gap-2 items-center">
                <input
                    ref={inputRef}
                    className="w-full rounded-xl border px-4 py-3 text-base"
                    placeholder="현장 선택/입력"
                    value={value}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange(v);
                        // 입력이 저장된 이름과 정확히 같으면 선택 활성
                        const hit = sites.find((s) => s.name === v.trim());
                        setSelectedId(hit?.id ?? null);
                    }}
                    onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            await saveCurrent();
                        }
                    }}
                />
            </div>

            {/* ✅ 저장된 현장 빠른 선택 */}
            <div className="mt-3 rounded-xl border p-3">
                <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">저장된 현장</div>
                    <button
                        type="button"
                        className="text-sm text-gray-500 underline"
                        onClick={refresh}
                        disabled={loading}
                    >
                        {loading ? "불러오는중..." : "새로고침"}
                    </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                    {sites.length === 0 ? (
                        <div className="text-sm text-gray-400">없음</div>
                    ) : (
                        sites.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selectedId === s.id
                                    ? "border-blue-600 bg-blue-50 text-blue-600 font-bold"
                                    : "border-gray-200 bg-white text-gray-600 active:bg-gray-100"
                                    }`}
                                onClick={() => {
                                    setSelectedId(s.id);
                                    onChange(s.name);
                                    if (onSavedPick) onSavedPick(s); // ✅ 클릭하면 자동입력 및 이동
                                }}
                            >
                                {s.name}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
