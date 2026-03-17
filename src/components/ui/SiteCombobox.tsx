"use client";

import * as React from "react";
import { Search, ChevronDown, X, Building2 } from "lucide-react";

interface SiteOption {
    id: string;
    name: string;
}

interface Props {
    value: string; // ✅ site.id
    onChange: (id: string) => void;
    onConfirm?: () => void;
    placeholder?: string;
    options?: SiteOption[]; // ✅ string[]에서 SiteOption[]으로 변경
}

export default function SiteCombobox({
    value,
    onChange,
    onConfirm,
    placeholder = "현장명을 입력하거나 선택바람.",
    options = []
}: Props) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);
    const [inputValue, setInputValue] = React.useState("");
    const containerRef = React.useRef<HTMLDivElement>(null);

    // ✅ 현재 선택된 ID에 기반한 이름 찾기
    const selectedSite = React.useMemo(() => {
        return options.find(s => s.id === value);
    }, [options, value]);

    // ✅ 선택 상태가 바뀌면 입력창 텍스트 업데이트 (단, 포커스 중이 아닐 때만)
    React.useEffect(() => {
        if (!isFocused) {
            setInputValue(selectedSite?.name || value || "");
        }
    }, [selectedSite, value, isFocused]);

    // ✅ 중복된 이름이 있는지 미리 체크
    const nameCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        options.forEach(s => {
            counts[s.name] = (counts[s.name] || 0) + 1;
        });
        return counts;
    }, [options]);

    // 추천 목록 필터링
    const filtered = React.useMemo(() => {
        const q = inputValue.toLowerCase().trim();
        if (!q) return options;
        return options.filter(s =>
            s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
        );
    }, [options, inputValue]);

    // 외부 클릭 시 닫기
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (site: SiteOption) => {
        onChange(site.id);
        setInputValue(site.name);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className="relative w-full group">
            {/* Input Wrapper */}
            <div className={`relative flex items-center bg-slate-50 border-2 rounded-2xl transition-all duration-200 ${isFocused ? "border-blue-500 bg-white ring-4 ring-blue-500/10" : "border-slate-200 hover:border-slate-300"
                }`}>
                <div className="pl-5 text-slate-400">
                    <Building2 size={20} />
                </div>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        // 수동 입력 시에는 일단 ID를 이름으로 취급 (기존 로직 호환)
                        onChange(e.target.value);
                        setIsOpen(true);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            setIsOpen(false);
                            onConfirm?.();
                        }
                    }}
                    onFocus={() => {
                        setIsFocused(true);
                        setIsOpen(true);
                    }}
                    onBlur={() => {
                        setTimeout(() => setIsFocused(false), 200);
                    }}
                    placeholder={placeholder}
                    className="w-full h-14 px-4 bg-transparent outline-none font-black text-lg text-slate-800 placeholder:text-slate-300"
                />

                <div className="flex items-center gap-1 pr-4">
                    {inputValue && (
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setInputValue(""); onChange(""); setIsOpen(true); }}
                            className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    )}
                    <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setIsOpen(!isOpen)}
                        className={`p-1 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} text-slate-300`}
                    >
                        <ChevronDown size={20} />
                    </button>
                </div>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (filtered.length > 0 || options.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 divide-y divide-slate-50">
                    <div className="max-h-[240px] overflow-y-auto overscroll-contain">
                        {filtered.length > 0 ? (
                            filtered.map((site, idx) => {
                                const isDuplicate = nameCounts[site.name] > 1;
                                const displayText = isDuplicate ? `${site.name} (${site.id})` : site.name;
                                const isSelected = value === site.id;

                                return (
                                    <button
                                        key={site.id ?? `${site.name}__${idx}`} // ✅ Point C: 고유키 사용
                                        onMouseDown={(e) => e.preventDefault()} // Blur 방지
                                        onClick={() => handleSelect(site)}
                                        className={`w-full px-6 py-4 flex items-center justify-between hover:bg-blue-50 transition-colors text-left group ${isSelected ? "bg-blue-50/50" : ""
                                            }`}
                                    >
                                        <span className={`font-black text-lg ${isSelected ? "text-blue-600" : "text-slate-700"}`}>
                                            {site.name}
                                        </span>
                                        {isSelected && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                                    </button>
                                );
                            })
                        ) : (
                            <div className="px-6 py-4 text-sm font-bold text-slate-400 flex items-center gap-2 italic">
                                <span>새로운 현장을 입력 중입니더...</span>
                            </div>
                        )}
                    </div>

                    {/* 안내 문구 */}
                    <div className="px-5 py-3 bg-slate-50/50 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Existing Sites Suggestions</span>
                        <div className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[9px] font-black text-slate-400 shadow-sm">
                            ENTER TO SELECT
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
