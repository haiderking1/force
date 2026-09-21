import { readFile } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../errors.ts";
import { assertChecksumsMatch, checksumFiles, type FileChecksum } from "./checksums.ts";
import { restoreFilesFromBackup, type StagedInstallFile } from "./apply.ts";
import { assertGameNotRunning } from "./process.ts";

export async function restoreFromBackup(options: {
  readonly backupDir: string;
  readonly confirm: boolean;
  readonly gameRoot?: string;
}): Promise<{ readonly restored: readonly FileChecksum[] }> {
  if (!options.confirm) {
    throw new PatchError("SAFETY", "restore requires an explicit --confirm flag");
  }
  await assertGameNotRunning();
  const raw = JSON.parse(await readFile(path.join(options.backupDir, "manifest.json"), "utf8")) as {
    gameRoot?: string;
    files?: FileChecksum[];
  };
  const gameRoot = options.gameRoot ?? raw.gameRoot;
  if (gameRoot === undefined || !Array.isArray(raw.files)) {
    throw new PatchError("BACKUP", `Backup manifest in ${options.backupDir} is incomplete`);
  }
  await restoreFilesFromBackup(
    gameRoot,
    options.backupDir,
    raw.files.map((file) => file.relativePath),
  );
  const restored = await checksumFiles(
    gameRoot,
    raw.files.map((file) => file.relativePath),
  );
  assertChecksumsMatch(raw.files, restored, "restored originals");
  return { restored };
}

export function stagedFilesFromManifest(
  stageDir: string,
  files: readonly {
    readonly relativePath: string;
    readonly stagedRelativePath: string;
    readonly originalSha256: string;
    readonly originalBytes: number;
    readonly stagedSha256: string;
    readonly stagedBytes: number;
  }[],
): readonly StagedInstallFile[] {
  return files.map((file) => ({
    relativePath: file.relativePath,
    stagedPath: path.join(stageDir, file.stagedRelativePath),
    originalSha256: file.originalSha256,
    originalBytes: file.originalBytes,
    stagedSha256: file.stagedSha256,
    stagedBytes: file.stagedBytes,
  }));
}
