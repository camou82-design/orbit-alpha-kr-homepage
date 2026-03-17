"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { match } from "@/lib/hangul";

interface OptionObject {
    label: string;
    value: string;
}

type Option = string | OptionObject;

interface Props {
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
    title: string;
    options: Option[];
    required?: boolean;
}

export default function SearchableSelect({ label, value, onChange, placeholder, title, options, required }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync search term when opened
    useEffect(() => {
        if (isOpen) {
            setSearchTerm("");
            // Mobile keyboard stability: short delay for focus
            const timer = setTimeout(() => inputRef.current?.focus(), 150);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const normalizedOptions = useMemo(() => {
        return (options ?? []).map(o => {
            if (typeof o === "string") return { label: o, value: o };
            return o;
        });
    }, [options]);

    const filteredOptions = useMemo(() => {
        if (!searchTerm.trim()) return normalizedOptions;
        return normalizedOptions.filter(o => match(searchTerm, o.label));
    }, [normalizedOptions, searchTerm]);

    const handleSelect = (opt: OptionObject) => {
        onChange(opt.value);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === "Tab") {
            if (filteredOptions.length > 0) {
                e.preventDefault();
                handleSelect(filteredOptions[0]);
            }
        }
    };

    const selectedLabel = normalizedOptions.find(o => o.value === value)?.label || "";

    return (
        <div className="w-full">
            {/* 1. Closed State: Glass Field */}
            <div className="text-[14px] text-[#a0aec0] mb-[10px] font-extrabold ml-1">
                {label} {required && <span className="text-[#ff7e5a]">*</span>}
            </div>
            <div
                onClick={() => setIsOpen(true)}
                className="w-full h-[56px] px-[18px] rounded-2xl bg-black/40 border border-white/20 flex items-center justify-between cursor-pointer backdrop-blur-md active:scale-[0.98] transition-all"
            >
                <span className={`text-[16px] font-bold overflow-hidden text-overflow-ellipsis whitespace-nowrap ${value ? "text-white" : "text-white/30"}`}>
                    {selectedLabel || placeholder}
                </span>
                <span className="text-white/30 text-[12px]">▼</span>
            </div>

            {/* 2. BottomSheet Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/80 z-[1000] flex flex-col justify-end animate-[fadeIn_0.2s_ease-out]"
                    onClick={() => setIsOpen(false)}
                >
                    <div
                        className="bg-gradient-to-b from-[#1a2c47] to-[#0b1f3a] rounded-t-[32px] w-full max-w-[430px] mx-auto max-h-[85vh] flex flex-col px-6 py-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-[slideUp_0.3s_cubic-bezier(0,0,0.2,1)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drag Handle */}
                        <div className="w-10 h-1 bg-white/20 rounded-full self-center mb-6" />

                        <div className="text-[20px] font-black mb-6 text-white tracking-tight">{title}</div>

                        {/* Search Input Container */}
                        <div className="relative mb-5">
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="검색 또는 직접 입력"
                                className="w-full h-[56px] px-[18px] rounded-2xl bg-white/5 border border-white/10 text-white text-[16px] font-bold outline-none focus:border-[#3EA6FF] transition-all"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* List Area */}
                        <div className="flex-1 overflow-y-auto min-h-[200px] mb-6 space-y-1 custom-scrollbar">
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map((opt) => (
                                    <div
                                        key={opt.value}
                                        onClick={() => handleSelect(opt)}
                                        className={`px-5 py-4 rounded-xl cursor-pointer flex justify-between items-center transition-all ${value === opt.value
                                                ? "bg-[#3EA6FF]/10 text-[#3EA6FF] border border-[#3EA6FF]/20"
                                                : "hover:bg-white/5 text-white/80"
                                            }`}
                                    >
                                        <span className="text-[15px] font-bold">{opt.label}</span>
                                        {value === opt.value && <span className="text-[18px]">✓</span>}
                                    </div>
                                ))
                            ) : (
                                <div className="py-12 text-center">
                                    <p className="text-white/20 text-[14px] font-bold">검색 결과가 없습니다.</p>
                                    {searchTerm.trim() && (
                                        <button
                                            onClick={() => handleSelect({ label: searchTerm.trim(), value: searchTerm.trim() })}
                                            className="mt-4 px-6 py-3 bg-[#3EA6FF] text-white rounded-xl font-black text-[13px]"
                                        >
                                            "{searchTerm.trim()}" 직접 입력하기
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-full h-[56px] rounded-2xl bg-white/10 text-white font-black text-[16px] active:scale-95 transition"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>
        </div>
    );
}
