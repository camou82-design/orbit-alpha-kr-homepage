import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export function getPaperLoopLogPath(
  logsDir: string,
  when: Date,
  experimentTag?: string | null
): string {
  const y = when.getFullYear();
  const m = String(when.getMonth() + 1).padStart(2, "0");
  const d = String(when.getDate()).padStart(2, "0");
  const suffix =
    experimentTag !== undefined && experimentTag !== null && experimentTag.length > 0
      ? `-${experimentTag}`
      : "";
  return join(logsDir, `paper-loop-${y}-${m}-${d}${suffix}.log`);
}

export async function appendLogLine(filePath: string, line: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, line + "\n", "utf8");
}
