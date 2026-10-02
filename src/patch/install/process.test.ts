import { afterEach, expect, test } from "bun:test";
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createTempDirTracker } from "../../testing/temp-dir.ts";
import { applyStagedPatch } from "./apply.ts";
import { assertGameNotRunning, processMatches, runningGameProcesses } from "./process.ts";
import { restoreFromBackup } from "./restore.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

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

test("process names longer than the 15-character Linux comm limit match their truncated comm", () => {
  expect(processMatches("BrutalLegend.ex", undefined, ["BrutalLegend.exe"])).toBe(true);
  expect(processMatches("brutallegend.ex", undefined, ["BrutalLegend.exe"])).toBe(true);
  expect(processMatches("BrutalLegend.e", undefined, ["BrutalLegend.exe"])).toBe(false);
  expect(processMatches("BrutalLeg", undefined, ["BrutalLegend"])).toBe(false);
});

test("process names match the executable in argv[0], including Windows paths under Wine", () => {
  expect(processMatches("wine-preloader", "C:\\Games\\BrutalLegend\\BrutalLegend.exe", ["BrutalLegend.exe"])).toBe(true);
  expect(processMatches("wine64", "/games/BrutalLegend/BrutalLegend.exe", ["brutallegend.exe"])).toBe(true);
  expect(processMatches("wine64", "/games/BrutalLegend/Launcher.exe", ["BrutalLegend.exe"])).toBe(false);
});

test.skipIf(process.platform !== "linux")("detects a real running process whose name exceeds the comm limit", async () => {
  const dir = await tempDirs.create("force-process-");
  const executable = path.join(dir, "BrutalLegend.exe");
  await copyFile("/bin/sleep", executable);
  const child = Bun.spawn([executable, "30"]);
  try {
    const deadline = Date.now() + 2000;
    let found = false;
    while (!found && Date.now() < deadline) {
      found = (await runningGameProcesses(["BrutalLegend.exe"])).some((item) => item.pid === child.pid);
    }
    expect(found).toBe(true);
    await expect(assertGameNotRunning(["BrutalLegend.exe"])).rejects.toThrow("Refusing to touch game files while");
  } finally {
    child.kill();
    await child.exited;
  }
});

test("apply and restore refuse a supplied running process before accessing files", async () => {
  const comm = (await readFile(`/proc/${process.pid}/comm`, "utf8")).trim();
  await expect(applyWithProcesses([comm])).rejects.toThrow("Refusing to touch game files while");
  await expect(restoreFromBackup({
    backupDir: "/unused/backup", confirm: true, processNames: [comm],
  })).rejects.toThrow("Refusing to touch game files while");
});
