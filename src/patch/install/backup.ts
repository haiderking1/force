import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../errors.ts";
import { sha256File } from "../hash.ts";
import { checksumFiles, writeChecksumManifest, type FileChecksum } from "./checksums.ts";
import { assertBackupOutsideGame, gameFilePath } from "./paths.ts";

export type BackupManifest = {
  readonly gameRoot: string;
  readonly createdAt: string;
  readonly files: readonly FileChecksum[];
};

export async function createVerifiedBackup(options: {
  readonly gameRoot: string;
  readonly backupDir: string;
  readonly relativePaths: readonly string[];
}): Promise<BackupManifest> {
  assertBackupOutsideGame(options.gameRoot, options.backupDir);
  const checksums = await checksumFiles(options.gameRoot, options.relativePaths);
  for (const row of checksums) {
    const source = gameFilePath(options.gameRoot, row.relativePath);
    const dest = path.join(options.backupDir, "files", row.relativePath);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(source, dest);
    const copied = await sha256File(dest);
    if (copied !== row.sha256) {
      throw new PatchError("BACKUP", `Backup copy of ${row.relativePath} failed checksum verification`);
    }
  }
  const manifest: BackupManifest = {
    gameRoot: path.resolve(options.gameRoot),
    createdAt: new Date().toISOString(),
    files: checksums,
  };
  await mkdir(options.backupDir, { recursive: true });
  await writeFile(path.join(options.backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeChecksumManifest(path.join(options.backupDir, "sha256.json"), checksums);
  return manifest;
}
