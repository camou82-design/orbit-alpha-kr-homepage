"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import clsx from "clsx";

type ReportShellProps = {
  title: string;
  step?: string;
  backHref?: string;
  onBack?: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  className?: string;
};

export function ReportShell({
  title,
  step,
  backHref,
  onBack,
  children,
  footer,
  className,
}: ReportShellProps) {
  return (
    <div
      className={clsx(
        "min-h-[100dvh] flex flex-col bg-[#F4F6F3] text-[#1c2419]",
        className
      )}
    >
      <header className="sticky top-0 z-20 border-b border-[#dfe6db] bg-[#F4F6F3]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3.5">
          {backHref ? (
            <Link
              href={backHref}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#cfd8c8] bg-white text-[#2d3a2a] shadow-sm active:scale-[0.98]"
              aria-label="뒤로"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
            </Link>
          ) : onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#cfd8c8] bg-white text-[#2d3a2a] shadow-sm active:scale-[0.98]"
              aria-label="뒤로"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
            </button>
          ) : (
            <div className="w-11" />
          )}
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-[#1c2419]">
              {title}
            </h1>
            {step ? (
              <p className="text-[11px] font-medium text-[#5c6b56]">{step}</p>
            ) : null}
          </div>
          <div className="w-11 shrink-0" aria-hidden />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">{children}</main>

      <div
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#dfe6db] bg-[#f0f3ee]/95 backdrop-blur-sm"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-lg px-4 pt-3">{footer}</div>
      </div>
    </div>
  );
}
