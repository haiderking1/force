import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PatchError } from "../errors.ts";
import { applyStagedPatch } from "./apply.ts";
import { createVerifiedBackup } from "./backup.ts";
import { checksumFiles } from "./checksums.ts";
import { assertBackupOutsideGame } from "./paths.ts";
import { restoreFromBackup } from "./restore.ts";

async function scratch(label: string): Promise<string> {
  const dir = path.join(tmpdir(), `force-patch-safe-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

test("refuses a backup directory inside the game root", () => {
  expect(() => assertBackupOutsideGame("/game", "/game/backup")).toThrow(/outside the game root/);
});

test("apply refuses without --confirm and restores checksums after a verified backup", async () => {
  const game = await scratch("game");
  const packs = path.join(game, "Win", "Packs");
  await mkdir(packs, { recursive: true });
  const original = new Uint8Array([1, 2, 3, 4]);
  await writeFile(path.join(packs, "RgS_Faction.~h"), original);
  const stagedDir = await scratch("stage");
  const staged = new Uint8Array([5, 6, 7, 8]);
  await writeFile(path.join(stagedDir, "RgS_Faction.~h"), staged);
  const checksums = await checksumFiles(game, ["Win/Packs/RgS_Faction.~h"]);
  const first = checksums[0];
  if (first === undefined) {
    throw new Error("checksum missing");
  }
  await expect(
    applyStagedPatch({
      gameRoot: game,
      backupDir: path.join(await scratch("backup"), "b"),
      files: [
        {
          relativePath: "Win/Packs/RgS_Faction.~h",
          stagedPath: path.join(stagedDir, "RgS_Faction.~h"),
          originalSha256: first.sha256,
          originalBytes: first.bytes,
          stagedSha256: "00",
          stagedBytes: 4,
        },
      ],
      confirm: false,
    }),
  ).rejects.toThrow(/--confirm/);

  const backupDir = path.join(await scratch("backup-ok"), "keep");
  await createVerifiedBackup({
    gameRoot: game,
    backupDir,
    relativePaths: ["Win/Packs/RgS_Faction.~h"],
  });
  await writeFile(path.join(packs, "RgS_Faction.~h"), staged);
  await restoreFromBackup({ backupDir, confirm: true, gameRoot: game });
  const restored = new Uint8Array(await Bun.file(path.join(packs, "RgS_Faction.~h")).arrayBuffer());
  expect(restored).toEqual(original);
});

test("apply refuses when the installed original hash no longer matches the stage", async () => {
  const game = await scratch("changed");
  const packs = path.join(game, "Win", "Packs");
  await mkdir(packs, { recursive: true });
  await writeFile(path.join(packs, "RgS_Faction.~h"), new Uint8Array([1, 2, 3]));
  const stagedDir = await scratch("stage2");
  await writeFile(path.join(stagedDir, "new.~h"), new Uint8Array([9, 9, 9]));
  await expect(
    applyStagedPatch({
      gameRoot: game,
      backupDir: path.join(await scratch("b2"), "out"),
      files: [
        {
          relativePath: "Win/Packs/RgS_Faction.~h",
          stagedPath: path.join(stagedDir, "new.~h"),
          originalSha256: "aaa",
          originalBytes: 3,
          stagedSha256: "bbb",
          stagedBytes: 3,
        },
      ],
      confirm: true,
    }),
  ).rejects.toBeInstanceOf(PatchError);
});
