import type { Metadata, Viewport } from "next";
import { BuanReportProvider } from "./BuanReportProvider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4F6F3",
};

export const metadata: Metadata = {
  title: "부안 빈집 현장진단 리포트",
  description:
    "농촌 빈집·유휴시설 현장 상태를 체크리스트로 기록하고 진단 결과를 저장하는 도구입니다.",
};

export default function BuanVacantReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div lang="ko" className="buan-vacant-report text-[#1c2419]">
      <BuanReportProvider>{children}</BuanReportProvider>
    </div>
  );
}
