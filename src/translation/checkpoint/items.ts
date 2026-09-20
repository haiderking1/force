import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sha256Text } from "../corpus/hash.ts";
import type { CorpusItem, CorpusPlan } from "../corpus/types.ts";
import { TranslationError } from "../errors.ts";
import { assertBatchPreserved } from "../tokens/preserve.ts";
import { parseStoredItemSuccess } from "./item-records.ts";
import { isItemFileName, itemFileName, type CheckpointPaths } from "./paths.ts";
import type { StoredItemSuccess } from "./types.ts";
import { CHECKPOINT_SCHEMA_VERSION } from "./types.ts";

export function itemSourceHash(sourceText: string): string {
  return sha256Text(sourceText);
}

export function makeStoredItemSuccess(input: {
  readonly identityHash: string;
  readonly item: CorpusItem;
  readonly text: string;
  readonly originBatchIndex: number;
}): StoredItemSuccess {
  return {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    id: input.item.id,
    sourceText: input.item.text,
    sourceHash: itemSourceHash(input.item.text),
    identityHash: input.identityHash,
    text: input.text,
    originBatchIndex: input.originBatchIndex,
  };
}

export function itemRecordPath(paths: CheckpointPaths, id: string): string {
  return path.join(paths.itemsDir, itemFileName(id));
}

export async function loadValidatedItemSuccesses(
  paths: CheckpointPaths,
  plan: CorpusPlan,
  identityHash: string,
): Promise<Map<string, StoredItemSuccess>> {
  const names = await listMaybe(paths.itemsDir);
  if (names === undefined) {
    return new Map();
  }
  const byId = new Map<string, StoredItemSuccess>();
  const planned = new Map(plan.items.map((item) => [item.id, item]));
  for (const name of names) {
    if (name.endsWith(".tmp")) {
      continue;
    }
    if (!isItemFileName(name)) {
      throw new TranslationError("VALIDATION", `Unexpected file in checkpoint items: ${name}`);
    }
    let record: StoredItemSuccess;
    try {
      record = parseStoredItemSuccess(await readJsonFile(path.join(paths.itemsDir, name)));
    } catch {
      throw new TranslationError("VALIDATION", `Checkpoint item ${name} is corrupt and cannot be reused`);
    }
    if (itemFileName(record.id) !== name) {
      throw new TranslationError("VALIDATION", `Checkpoint item ${name} does not match its id`);
    }
    validateItemSuccessAgainstPlan(plan, identityHash, planned, record);
    if (byId.has(record.id)) {
      throw new TranslationError("VALIDATION", `Checkpoint has duplicate translated id: ${record.id}`);
    }
    byId.set(record.id, record);
  }
  return byId;
}

export function validateItemSuccessAgainstPlan(
  plan: CorpusPlan,
  identityHash: string,
  planned: ReadonlyMap<string, CorpusItem>,
  record: StoredItemSuccess,
): void {
  if (record.identityHash !== identityHash) {
    throw new TranslationError("VALIDATION", `Checkpoint item ${record.id} identity does not match`);
  }
  const item = planned.get(record.id);
  if (item === undefined) {
    throw new TranslationError("VALIDATION", `Checkpoint item ${record.id} is not in the planned corpus`);
  }
  if (record.sourceText !== item.text || record.sourceHash !== itemSourceHash(item.text)) {
    throw new TranslationError("VALIDATION", `Checkpoint item ${record.id} source text does not match this input`);
  }
  const batch = plan.batches[record.originBatchIndex];
  if (batch === undefined || !batch.items.some((row) => row.id === record.id)) {
    throw new TranslationError("VALIDATION", `Checkpoint item ${record.id} is outside its origin batch`);
  }
  assertBatchPreserved([{ id: item.id, text: item.text }], [{ id: record.id, text: record.text }], plan.placeholders);
}

async function readJsonFile(filePath: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new TranslationError("VALIDATION", `Cannot read checkpoint file: ${filePath}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new TranslationError("VALIDATION", `Checkpoint file is not valid JSON: ${filePath}`);
  }
}

async function listMaybe(dirPath: string): Promise<string[] | undefined> {
  try {
    return await readdir(dirPath);
  } catch {
    return undefined;
  }
}
