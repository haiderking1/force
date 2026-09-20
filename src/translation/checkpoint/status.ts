import { writeJsonAtomic } from "./atomic.ts";
import type { JobStatus } from "./types.ts";
import { CHECKPOINT_SCHEMA_VERSION } from "./types.ts";

export async function writeJobStatus(filePath: string, status: JobStatus): Promise<void> {
  await writeJsonAtomic(filePath, status);
}

export function createJobStatus(input: Omit<JobStatus, "schemaVersion">): JobStatus {
  return {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    ...input,
  };
}

export function formatStatusLine(status: JobStatus): string {
  const elapsed = formatElapsed(status.elapsedMs);
  return `translate total=${status.total} done=${status.done} failed=${status.failed} active=${status.active} pending=${status.pending} elapsed=${elapsed}`;
}

export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}
