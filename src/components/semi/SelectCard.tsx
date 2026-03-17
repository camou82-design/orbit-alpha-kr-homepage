"use client";

type Props = {
    label: string;
    selected?: boolean;
    onToggle?: () => void;
    disabled?: boolean;
    recommended?: boolean;
};

export default function SelectCard({
    label,
    selected = false,
    onToggle,
    disabled = false,
    recommended = false,
}: Props) {
    return (
        <button
            type="button"
            onClick={() => {
                if (disabled) return;
                onToggle?.();
            }}
            className={[
                "relative w-full",
                "min-w-[140px]",
                "px-5 py-4",
                "rounded-2xl",
                "border-2",
                "text-left",
                "transition-all duration-200",
                disabled ? "opacity-60 cursor-not-allowed" : "active:scale-[0.99]",
                selected
                    ? "border-[#3EA6FF] bg-[#3EA6FF]/10 shadow-[0_0_20px_rgba(62,166,255,0.12)]"
                    : "border-white/10 bg-white/5 hover:border-white/20",
            ].join(" ")}
        >
            {/* left neon bar */}
            <div
                className={[
                    "absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl",
                    selected ? "bg-[#3EA6FF]" : "bg-transparent",
                ].join(" ")}
            />

            {/* label */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-black text-white">
                        {label}
                    </span>
                    {recommended && (
                        <span className="text-[10px] font-black text-blue-300/70">
                            추천
                        </span>
                    )}
                </div>

                {/* check */}
                <div
                    className={[
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center",
                        selected
                            ? "bg-[#3EA6FF] border-[#3EA6FF]"
                            : "border-white/10 bg-black/20",
                    ].join(" ")}
                >
                    {selected && <span className="text-white text-[14px] font-black">✓</span>}
                </div>
            </div>
        </button>
    );
}
