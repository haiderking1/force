import { readFile } from "node:fs/promises";
import { TranslationError } from "../errors.ts";
import { parseStoredUnresolved } from "./unresolved-records.ts";
import { writeJsonAtomic } from "./atomic.ts";
import { CHECKPOINT_SCHEMA_VERSION, type StoredUnresolved, type StoredUnresolvedItem } from "./types.ts";

export async function readUnresolvedList(
  filePath: string,
  identityHash: string,
): Promise<StoredUnresolved> {
  const raw = await readUnresolvedRaw(filePath);
  if (raw === undefined) {
    return {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      identityHash,
      items: [],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TranslationError("VALIDATION", "Existing checkpoint unresolved.json is not valid JSON");
  }
  const record = parseStoredUnresolved(parsed);
  if (record.identityHash !== identityHash) {
    throw new TranslationError("VALIDATION", "Existing checkpoint unresolved.json identity does not match");
  }
  return record;
}

export async function writeUnresolvedList(
  filePath: string,
  identityHash: string,
  items: readonly StoredUnresolvedItem[],
): Promise<void> {
  const record: StoredUnresolved = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    identityHash,
    items,
  };
  await writeJsonAtomic(filePath, record);
}

async function readUnresolvedRaw(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}
