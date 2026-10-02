import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../errors.ts";

// Linux stores at most 15 characters in /proc/<pid>/comm (TASK_COMM_LEN - 1), so a
// Wine/Proton process for "BrutalLegend.exe" shows up as "BrutalLegend.ex".
const LINUX_COMM_MAX = 15;

function executableName(argv0: string): string {
  return argv0.split(/[\\/]/).pop() ?? argv0;
}

/** True when a process's comm or argv[0] names one of the wanted executables. */
export function processMatches(comm: string, argv0: string | undefined, names: readonly string[]): boolean {
  const lowerComm = comm.toLowerCase();
  const lowerExecutable = argv0 === undefined ? undefined : executableName(argv0).toLowerCase();
  return names.some((name) => {
    const wanted = name.toLowerCase();
    if (lowerComm === wanted || (wanted.length > LINUX_COMM_MAX && lowerComm === wanted.slice(0, LINUX_COMM_MAX))) {
      return true;
    }
    return lowerExecutable === wanted;
  });
}

async function readArgv0(pid: string): Promise<string | undefined> {
  try {
    const cmdline = await readFile(path.join("/proc", pid, "cmdline"), "utf8");
    const argv0 = cmdline.split("\0")[0];
    return argv0 === undefined || argv0 === "" ? undefined : argv0;
  } catch {
    return undefined;
  }
}

export async function runningGameProcesses(
  names: readonly string[],
): Promise<readonly { readonly pid: number; readonly comm: string }[]> {
  if (names.length === 0) {
    throw new PatchError("VALIDATION", "Process names must not be empty");
  }
  let entries: string[];
  try {
    entries = await readdir("/proc");
  } catch {
    return [];
  }
  const hits: { pid: number; comm: string }[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }
    let comm: string;
    try {
      comm = (await readFile(path.join("/proc", entry, "comm"), "utf8")).trim();
    } catch {
      continue;
    }
    if (processMatches(comm, await readArgv0(entry), names)) {
      hits.push({ pid: Number(entry), comm });
    }
  }
  return hits;
}

export async function assertGameNotRunning(names: readonly string[]): Promise<void> {
  const running = await runningGameProcesses(names);
  if (running.length > 0) {
    throw new PatchError(
      "PROCESS",
      `Refusing to touch game files while ${running.map((item) => `${item.comm} pid ${item.pid}`).join(", ")} is running`,
    );
  }
}
