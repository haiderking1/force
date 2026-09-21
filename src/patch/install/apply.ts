import { copyFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../errors.ts";
import { sha256File } from "../hash.ts";
import { createVerifiedBackup } from "./backup.ts";
import { assertChecksumsMatch, checksumFiles, type FileChecksum } from "./checksums.ts";
import { assertBackupOutsideGame, gameFilePath } from "./paths.ts";
import { assertGameNotRunning } from "./process.ts";

export type StagedInstallFile = {
  readonly relativePath: string;
  readonly stagedPath: string;
  readonly originalSha256: string;
  readonly originalBytes: number;
  readonly stagedSha256: string;
  readonly stagedBytes: number;
};

export async function applyStagedPatch(options: {
  readonly gameRoot: string;
  readonly backupDir: string;
  readonly files: readonly StagedInstallFile[];
  readonly confirm: boolean;
}): Promise<{ readonly backupDir: string; readonly installed: readonly FileChecksum[] }> {
  if (!options.confirm) {
    throw new PatchError("SAFETY", "apply requires an explicit --confirm flag");
  }
  if (options.files.length === 0) {
    throw new PatchError("VALIDATION", "apply has no staged files");
  }
  await assertGameNotRunning();
  assertBackupOutsideGame(options.gameRoot, options.backupDir);

  const current = await checksumFiles(
    options.gameRoot,
    options.files.map((file) => file.relativePath),
  );
  assertChecksumsMatch(
    options.files.map((file) => ({
      relativePath: file.relativePath,
      sha256: file.originalSha256,
      bytes: file.originalBytes,
    })),
    current,
    "installed originals",
  );

  await createVerifiedBackup({
    gameRoot: options.gameRoot,
    backupDir: options.backupDir,
    relativePaths: options.files.map((file) => file.relativePath),
  });

  const temps: string[] = [];
  try {
    for (const file of options.files) {
      const dest = gameFilePath(options.gameRoot, file.relativePath);
      const temp = `${dest}.force-tmp`;
      await copyFile(file.stagedPath, temp);
      const hash = await sha256File(temp);
      if (hash !== file.stagedSha256) {
        throw new PatchError("INSTALL", `Staged copy of ${file.relativePath} failed checksum verification`);
      }
      temps.push(temp);
    }
    for (const file of options.files) {
      const dest = gameFilePath(options.gameRoot, file.relativePath);
      await rename(`${dest}.force-tmp`, dest);
    }
  } catch (error) {
    for (const temp of temps) {
      try {
        await unlink(temp);
      } catch {
        continue;
      }
    }
    await restoreFilesFromBackup(options.gameRoot, options.backupDir, options.files.map((file) => file.relativePath));
    if (error instanceof PatchError) {
      throw error;
    }
    throw new PatchError("INSTALL", `Install failed and rolled back: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const installed = await checksumFiles(
    options.gameRoot,
    options.files.map((file) => file.relativePath),
  );
  assertChecksumsMatch(
    options.files.map((file) => ({
      relativePath: file.relativePath,
      sha256: file.stagedSha256,
      bytes: file.stagedBytes,
    })),
    installed,
    "installed replacements",
  );
  return { backupDir: path.resolve(options.backupDir), installed };
}

export async function restoreFilesFromBackup(
  gameRoot: string,
  backupDir: string,
  relativePaths: readonly string[],
): Promise<void> {
  for (const relativePath of relativePaths) {
    const source = path.join(backupDir, "files", relativePath);
    const dest = gameFilePath(gameRoot, relativePath);
    const temp = `${dest}.force-restore-tmp`;
    await copyFile(source, temp);
    await rename(temp, dest);
  }
}
