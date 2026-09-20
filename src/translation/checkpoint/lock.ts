import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { hostname } from "node:os";
import { TranslationError } from "../errors.ts";
import { isRecord } from "../unknown.ts";
import type { JobLock } from "./types.ts";

export async function acquireJobLock(lockPath: string, identityHash: string): Promise<JobLock> {
  const lock: JobLock = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: hostname(),
    identityHash,
  };
  if (await tryCreateLock(lockPath, lock)) {
    return lock;
  }
  const existing = await readLock(lockPath);
  if (existing !== undefined && isPidAlive(existing.pid)) {
    throw new TranslationError(
      "VALIDATION",
      `Translation out directory is locked by pid ${existing.pid} started ${existing.startedAt}`,
    );
  }
  await rm(lockPath, { force: true });
  if (!(await tryCreateLock(lockPath, lock))) {
    const raced = await readLock(lockPath);
    if (raced !== undefined && isPidAlive(raced.pid) && raced.pid !== process.pid) {
      throw new TranslationError(
        "VALIDATION",
        `Translation out directory is locked by pid ${raced.pid} started ${raced.startedAt}`,
      );
    }
    throw new TranslationError("VALIDATION", "Failed to acquire a single-writer translation lock");
  }
  return lock;
}

export async function releaseJobLock(lockPath: string): Promise<void> {
  const existing = await readLock(lockPath);
  if (existing === undefined || existing.pid !== process.pid) {
    return;
  }
  await rm(lockPath, { force: true });
}

export async function readLock(lockPath: string): Promise<JobLock | undefined> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  if (
    typeof parsed.pid !== "number" ||
    !Number.isSafeInteger(parsed.pid) ||
    typeof parsed.startedAt !== "string" ||
    typeof parsed.hostname !== "string" ||
    typeof parsed.identityHash !== "string"
  ) {
    return undefined;
  }
  return {
    pid: parsed.pid,
    startedAt: parsed.startedAt,
    hostname: parsed.hostname,
    identityHash: parsed.identityHash,
  };
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function tryCreateLock(lockPath: string, lock: JobLock): Promise<boolean> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`);
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) {
      return false;
    }
    throw error;
  }
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
