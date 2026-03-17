// src/lib/semi/server/excel.ts

import * as XLSX from "xlsx";
import { FinalSubmission } from "../shared/types";

export function generateXlsxBuffer(submissions: FinalSubmission[]) {
    const data = submissions.map((s) => ({
        "ID": s.id,
        "제출일시": new Date(s.timestamp).toLocaleString("ko-KR"),
        "업체명": s.step1.vendor,
        "작업구역": s.step1.workArea,
        "세부위치": s.step1.detailLocation,
        "업종": s.step1.industry,
        "인원": s.step2.crewCount,
        "위험도": s.evaluation.level,
        "최종점수": s.evaluation.finalScore,
        "선택공정": s.step2.workTypes.join(", "),
        "위험요소": s.step2.riskFlags.join(", "),
        "투입장비": s.step3.equipments.join(", "),
        "미체크(추가위험)": s.evaluation.uncheckedAdds.join(", "),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Submissions");

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
