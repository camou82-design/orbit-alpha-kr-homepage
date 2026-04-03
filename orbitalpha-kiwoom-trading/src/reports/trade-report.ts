import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Writes a JSON report to `filePath` (creates parent dirs).
 */
export async function saveTradeReportJson(
  filePath: string,
  data: unknown
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const body = JSON.stringify(data, null, 2);
  await writeFile(filePath, body, "utf8");
}
