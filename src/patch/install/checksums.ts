import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../errors.ts";
import { sha256File } from "../hash.ts";

export type FileChecksum = {
  readonly relativePath: string;
  readonly sha256: string;
  readonly bytes: number;
};

export async function checksumFiles(
  root: string,
  relativePaths: readonly string[],
): Promise<readonly FileChecksum[]> {
  const rows: FileChecksum[] = [];
  for (const relativePath of relativePaths) {
    const filePath = path.join(root, relativePath);
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      throw new PatchError("CHECKSUM", `Missing file ${filePath}`);
    }
    rows.push({
      relativePath,
      sha256: await sha256File(filePath),
      bytes: file.size,
    });
  }
  return rows;
}

export async function writeChecksumManifest(filePath: string, rows: readonly FileChecksum[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ files: rows }, null, 2)}\n`, "utf8");
}

export function assertChecksumsMatch(
  expected: readonly FileChecksum[],
  actual: readonly FileChecksum[],
  label: string,
): void {
  const actualByPath = new Map(actual.map((row) => [row.relativePath, row]));
  for (const row of expected) {
    const found = actualByPath.get(row.relativePath);
    if (found === undefined) {
      throw new PatchError("CHECKSUM", `${label}: missing ${row.relativePath}`);
    }
    if (found.sha256 !== row.sha256 || found.bytes !== row.bytes) {
      throw new PatchError(
        "CHECKSUM",
        `${label}: ${row.relativePath} is ${found.sha256} (${found.bytes} bytes), expected ${row.sha256} (${row.bytes} bytes)`,
      );
    }
  }
}
