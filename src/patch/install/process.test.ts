import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { applyStagedPatch } from "./apply.ts";
import { assertGameNotRunning, runningGameProcesses } from "./process.ts";
import { restoreFromBackup } from "./restore.ts";

function applyWithProcesses(processNames: readonly string[]) {
  return applyStagedPatch({
    gameRoot: "/unused/game",
    backupDir: "/unused/backup",
    confirm: true,
    processNames,
    files: [{
      relativePath: "pack.bin",
      stagedPath: "/unused/stage/pack.bin",
      originalSha256: "unused",
      originalBytes: 0,
      stagedSha256: "unused",
      stagedBytes: 0,
    }],
  });
}

test("process checks and installers reject an empty process list", async () => {
  await expect(runningGameProcesses([])).rejects.toThrow("Process names must not be empty");
  await expect(assertGameNotRunning([])).rejects.toThrow("Process names must not be empty");
  await expect(applyWithProcesses([])).rejects.toThrow("Process names must not be empty");
  await expect(restoreFromBackup({
    backupDir: "/unused/backup", confirm: true, processNames: [],
  })).rejects.toThrow("Process names must not be empty");
});

test("process checks match supplied names case-insensitively without matching prefixes", async () => {
  const comm = (await readFile(`/proc/${process.pid}/comm`, "utf8")).trim();
  expect(await runningGameProcesses([comm.toUpperCase()])).toContainEqual({ pid: process.pid, comm });
  expect((await runningGameProcesses([comm.slice(0, -1)])).some((item) => item.pid === process.pid)).toBe(false);
});

test("apply and restore refuse a supplied running process before accessing files", async () => {
  const comm = (await readFile(`/proc/${process.pid}/comm`, "utf8")).trim();
  await expect(applyWithProcesses([comm])).rejects.toThrow("Refusing to touch game files while");
  await expect(restoreFromBackup({
    backupDir: "/unused/backup", confirm: true, processNames: [comm],
  })).rejects.toThrow("Refusing to touch game files while");
});
