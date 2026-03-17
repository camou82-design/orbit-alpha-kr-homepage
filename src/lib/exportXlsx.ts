import * as XLSX from "xlsx";

/**
 * XLSX 내보내기 유틸リティ
 * @param data 내보낼 데이터 배열
 * @param filename 저장될 파일명 (기본: report.xlsx)
 */
export function exportToXlsx(data: any[], filename: string = "report.xlsx") {
    if (typeof window === "undefined") return;

    try {
        // 데이터가 없으면 중단
        if (!data || data.length === 0) {
            console.warn("No data to export");
            return;
        }

        // 워크북 및 워크시트 생성
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Submissions");

        // 파일 쓰기 및 다운로드 (Browser)
        XLSX.writeFile(workbook, filename);
    } catch (error) {
        console.error("Failed to export XLSX:", error);
    }
}
