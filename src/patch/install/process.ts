import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../errors.ts";
import { BRUTAL_LEGEND_PROCESS_NAMES } from "../games/brutal-legend/config.ts";

export async function runningGameProcesses(
  names: readonly string[] = BRUTAL_LEGEND_PROCESS_NAMES,
): Promise<readonly { readonly pid: number; readonly comm: string }[]> {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
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
    const commPath = path.join("/proc", entry, "comm");
    try {
      const comm = (await readFile(commPath, "utf8")).trim();
      if (wanted.has(comm.toLowerCase())) {
        hits.push({ pid: Number(entry), comm });
      }
    } catch {
      continue;
    }
  }
  return hits;
}

export async function assertGameNotRunning(): Promise<void> {
  const running = await runningGameProcesses();
  if (running.length > 0) {
    throw new PatchError(
      "PROCESS",
      `Refusing to touch game files while ${running.map((item) => `${item.comm} pid ${item.pid}`).join(", ")} is running`,
    );
  }
}
