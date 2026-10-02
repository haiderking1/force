import { writeJson } from "../../shared/fs/write-json.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DiscoveryError } from "../errors.ts";
import { parseDiscoveryReport } from "./parse.ts";
import type { DiscoveryReport } from "./types.ts";

export function defaultScanReportPath(gameId: string): string {
  return path.join("out", "discovery", `${gameId}-scan.json`);
}

export function defaultClassifiedReportPath(gameId: string): string {
  return path.join("out", "discovery", `${gameId}-classified.json`);
}

export async function writeReport(filePath: string, report: DiscoveryReport): Promise<void> {
  await writeJson(filePath, report);
}

export async function readReport(filePath: string): Promise<DiscoveryReport> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable report";
    throw new DiscoveryError("REPORT", `Cannot read discovery report: ${message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DiscoveryError("REPORT", "Discovery report is not valid JSON");
  }
  return parseDiscoveryReport(parsed);
}
