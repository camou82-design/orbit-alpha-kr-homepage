"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { matchKorean } from "@/lib/hangul";

interface Props {
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
    title: string;
    options: any[];
    required?: boolean;
}

export default function ComboBottomSheet({ label, value, onChange, placeholder, title, options, required }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState(value);
    const [searchTerm, setSearchTerm] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync search term when opened
    useEffect(() => {
        if (isOpen) {
            setSearchTerm("");
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const safeText = (v: any) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object") return String(v.label ?? v.name ?? v.value ?? "");
        return "";
    };

    const normalizedOptions: string[] = (options ?? [])
        .map((o: any) => String(safeText(o) ?? "").trim())
        .filter(Boolean);

    const filteredOptions = useMemo(() => {
        return normalizedOptions.filter((o: string) => matchKorean(searchTerm, o));
    }, [normalizedOptions, searchTerm]);

    const handleSelect = (opt: string) => {
        onChange(opt);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === "Tab") {
            if (filteredOptions.length > 0) {
                e.preventDefault();
                handleSelect(filteredOptions[0]);
            } else if (searchTerm.trim()) {
                e.preventDefault();
                handleSelect(searchTerm.trim());
            }
        }
    };

    return (
        <div style={{ width: "100%" }}>
            {/* 1. Closed State: Glass Field */}
            <div style={{ fontSize: 14, color: "#a0aec0", marginBottom: 10, fontWeight: 800 }}>
                {label} {required && <span style={{ color: "#ff7e5a" }}>*</span>}
            </div>
            <div
                onClick={() => setIsOpen(true)}
                style={{
                    width: "100%", height: 56, padding: "0 18px", borderRadius: 12,
                    background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)",
                    color: value ? "white" : "rgba(255,255,255,0.4)", fontSize: 16, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer", backdropFilter: "blur(10px)"
                }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {value || placeholder}
                </span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>▼</span>
            </div>

            {/* 2. Custom BottomSheet Overlay */}
            {isOpen && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.7)", zIndex: 1000,
                    display: "flex", flexDirection: "column", justifyContent: "flex-end",
                    animation: "fadeIn 0.2s ease-out"
                }}
                    onClick={() => setIsOpen(false)}
                >
                    <style>{`
                        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    `}</style>
                    <div
                        style={{
                            background: "linear-gradient(180deg, #1a2c47, #0b1f3a)",
                            borderTopLeftRadius: 24, borderTopRightRadius: 24,
                            width: "100%", maxWidth: 430, margin: "0 auto",
                            maxHeight: "85vh", display: "flex", flexDirection: "column",
                            padding: "24px 20px", boxShadow: "0 -10px 40px rgba(0,0,0,0.8)",
                            animation: "slideUp 0.3s cubic-bezier(0, 0, 0.2, 1)",
                            position: "relative"
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drag Handle */}
                        <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, alignSelf: "center", marginBottom: 20 }} />

                        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, color: "white" }}>{title}</div>

                        {/* Input Area (Search + Custom) */}
                        <div style={{ position: "relative", marginBottom: 16 }}>
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholder}
                                style={{
                                    width: "100%", height: 56, padding: "0 18px", borderRadius: 12,
                                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.2)",
                                    color: "white", fontSize: 16, fontWeight: 600, outline: "none"
                                }}
                            />
                        </div>

                        {/* List Area */}
                        <div style={{ flex: 1, overflowY: "auto", minHeight: 150, marginBottom: 20 }}>
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map((opt) => (
                                    <div
                                        key={opt}
                                        onClick={() => handleSelect(opt)}
                                        style={{
                                            padding: "16px 18px", borderRadius: 12,
                                            background: value === opt ? "rgba(46, 229, 157, 0.15)" : "transparent",
                                            color: value === opt ? "#2ee59d" : "white",
                                            fontWeight: value === opt ? 800 : 500,
                                            marginBottom: 4, cursor: "pointer",
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            transition: "all 0.1s"
                                        }}
                                    >
                                        <span>{opt}</span>
                                        {value === opt && <span style={{ fontSize: 18 }}>✓</span>}
                                    </div>
                                ))
                            ) : searchTerm.trim() ? (
                                <div
                                    onClick={() => handleSelect(searchTerm.trim())}
                                    style={{
                                        padding: "16px 18px", borderRadius: 12, background: "rgba(46, 229, 157, 0.05)",
                                        color: "#2ee59d", fontWeight: 700, cursor: "pointer", textAlign: "center"
                                    }}
                                >
                                    "{searchTerm.trim()}" 입력 적용하기
                                </div>
                            ) : (
                                <div style={{ padding: "40px 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                                    일치하는 항목이 없습니다.<br />직접 입력할 수 있습니다.
                                </div>
                            )}
                        </div>

                        {/* Footer Buttons */}
                        <div style={{ display: "flex", gap: 12 }}>
                            <button
                                onClick={() => setIsOpen(false)}
                                style={{
                                    flex: 1, height: 56, borderRadius: 14,
                                    background: "rgba(255,255,255,0.1)", color: "white",
                                    fontWeight: 800, fontSize: 16, border: "none", cursor: "pointer"
                                }}
                            >
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
