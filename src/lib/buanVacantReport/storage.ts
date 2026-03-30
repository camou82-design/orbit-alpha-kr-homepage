import type { SavedReport } from "./types";

const STORAGE_KEY = "buan-vacant-reports-v1";

function safeParse(raw: string | null): SavedReport[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x): x is SavedReport =>
        typeof x === "object" &&
        x !== null &&
        "id" in x &&
        "diagnosedAt" in x &&
        "result" in x
    );
  } catch {
    return [];
  }
}

export function loadReports(): SavedReport[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY)).sort((a, b) =>
    b.diagnosedAt.localeCompare(a.diagnosedAt)
  );
}

export function saveReport(report: SavedReport): void {
  const list = loadReports().filter((r) => r.id !== report.id);
  list.unshift(report);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getReportById(id: string): SavedReport | undefined {
  return loadReports().find((r) => r.id === id);
}

export function deleteReport(id: string): void {
  const list = loadReports().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
