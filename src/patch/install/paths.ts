import path from "node:path";
import { PatchError } from "../errors.ts";

export function resolveExisting(filePath: string): string {
  return path.resolve(filePath);
}

export function assertBackupOutsideGame(gameRoot: string, backupDir: string): void {
  const game = path.resolve(gameRoot);
  const backup = path.resolve(backupDir);
  const relative = path.relative(game, backup);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new PatchError("SAFETY", `Backup directory ${backup} must be outside the game root ${game}`);
  }
}

export function gameFilePath(gameRoot: string, relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("..") || path.isAbsolute(normalized)) {
    throw new PatchError("TRAVERSAL", `Refusing game-relative path ${relativePath}`);
  }
  return path.join(path.resolve(gameRoot), normalized);
}
