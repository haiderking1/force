import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Write a report directly; callers needing atomic replacement must use their checkpoint writer. */
export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
