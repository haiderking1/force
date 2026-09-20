import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { TranslationError } from "../errors.ts";
import { identitiesMatch, identityFingerprint } from "../corpus/plan.ts";
import type { CheckpointIdentity, CorpusBatch, CorpusItem, CorpusPlan } from "../corpus/types.ts";
import { isRecord } from "../unknown.ts";
import { createSerialQueue, writeJsonAtomic } from "./atomic.ts";
import { itemRecordPath, loadValidatedItemSuccesses, makeStoredItemSuccess } from "./items.ts";
import { batchFileName, checkpointPaths, isBatchFileName, type CheckpointPaths } from "./paths.ts";
import { parseCheckpointIdentity, parseStoredBatchSuccess, parseStoredCorpusItem } from "./records.ts";
import { readUnresolvedList, writeUnresolvedList } from "./unresolved.ts";
import { assertBatchPreserved } from "../tokens/preserve.ts";
import type { StoredBatchFailure, StoredBatchSuccess, StoredSources, StoredUnresolvedItem } from "./types.ts";
import { CHECKPOINT_SCHEMA_VERSION } from "./types.ts";

export type CheckpointStore = {
  readonly paths: CheckpointPaths;
  readonly identityHash: string;
  persistSuccess(batch: CorpusBatch, translations: readonly { readonly id: string; readonly text: string }[]): Promise<void>;
  persistItemSuccesses(
    originBatchIndex: number,
    items: readonly CorpusItem[],
    translations: readonly { readonly id: string; readonly text: string }[],
  ): Promise<void>;
  persistFailure(batch: CorpusBatch, error: { readonly code: string; readonly message: string }): Promise<void>;
  persistUnresolved(entry: StoredUnresolvedItem): Promise<void>;
  completedIndices(): ReadonlySet<number>;
  completedIds(): ReadonlySet<string>;
};

export async function openCheckpointStore(
  outDir: string,
  plan: CorpusPlan,
  resume: boolean,
): Promise<{
  readonly store: CheckpointStore;
  readonly completed: ReadonlySet<number>;
  readonly completedIds: ReadonlySet<string>;
}> {
  const paths = checkpointPaths(outDir);
  const identityHash = identityFingerprint(plan.identity);
  const existing = await readExistingIdentity(paths.identity);
  if (existing === undefined) {
    if (resume) {
      throw new TranslationError("VALIDATION", "translate --resume needs an existing checkpoint in --out");
    }
    await assertOutIsReusable(paths);
    await writeJsonAtomic(paths.identity, plan.identity);
    const sources: StoredSources = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      identity: plan.identity,
      items: plan.items,
    };
    await writeJsonAtomic(paths.sources, sources);
    return {
      store: makeStore(paths, plan, identityHash, new Set(), new Set()),
      completed: new Set(),
      completedIds: new Set(),
    };
  }
  if (!resume) {
    throw new TranslationError(
      "VALIDATION",
      "Translation out directory already has a checkpoint. Pass --resume to continue or choose a new --out",
    );
  }
  if (!identitiesMatch(existing, plan.identity)) {
    throw new TranslationError(
      "VALIDATION",
      "Existing checkpoint identity does not match this input, prompt, or model settings",
    );
  }
  const storedSources = await readStoredSources(paths.sources, plan.identity);
  assertSameItems(storedSources.items, plan.items);
  const completed = await loadValidatedCompletions(paths, plan, identityHash);
  const completedIds = idsFromBatchSuccesses(completed);
  const itemSuccesses = await loadValidatedItemSuccesses(paths, plan, identityHash);
  mergeItemSuccesses(completedIds, itemSuccesses, translationsFromBatches(completed));
  const unresolved = await readUnresolvedList(paths.unresolved, identityHash);
  assertUnresolvedMatchesPlan(plan, unresolved.items);
  return {
    store: makeStore(paths, plan, identityHash, new Set(completed.keys()), completedIds),
    completed: new Set(completed.keys()),
    completedIds: new Set(completedIds),
  };
}

export async function loadCompletedTranslations(
  outDir: string,
  plan: CorpusPlan,
): Promise<Map<string, string>> {
  const paths = checkpointPaths(outDir);
  const identityHash = identityFingerprint(plan.identity);
  const batches = await loadValidatedCompletions(paths, plan, identityHash);
  const byId = translationsFromBatches(batches);
  const itemSuccesses = await loadValidatedItemSuccesses(paths, plan, identityHash);
  mergeItemSuccesses(new Set(byId.keys()), itemSuccesses, byId);
  for (const [id, record] of itemSuccesses) {
    if (!byId.has(id)) {
      byId.set(id, record.text);
    }
  }
  return byId;
}

function makeStore(
  paths: CheckpointPaths,
  plan: CorpusPlan,
  identityHash: string,
  completed: Set<number>,
  completedIds: Set<string>,
): CheckpointStore {
  const serialize = createSerialQueue();
  return {
    paths,
    identityHash,
    persistSuccess(batch, translations) {
      return serialize(async () => {
        if (completed.has(batch.index)) {
          return;
        }
        validateSuccessAgainstPlan(plan, identityHash, batch, translations);
        const record: StoredBatchSuccess = {
          schemaVersion: CHECKPOINT_SCHEMA_VERSION,
          batchIndex: batch.index,
          identityHash,
          items: batch.items.map((item) => ({ id: item.id, sourceText: item.text })),
          translations: translations.map((row) => ({ id: row.id, text: row.text })),
        };
        await writeJsonAtomic(path.join(paths.batchesDir, batchFileName(batch.index)), record);
        await rm(path.join(paths.failuresDir, batchFileName(batch.index)), { force: true });
        completed.add(batch.index);
        for (const item of batch.items) {
          completedIds.add(item.id);
        }
        await removeUnresolvedIds(paths, identityHash, batch.items.map((item) => item.id));
      });
    },
    persistItemSuccesses(originBatchIndex, items, translations) {
      return serialize(async () => {
        const byId = new Map(items.map((item) => [item.id, item]));
        if (translations.length !== items.length || translations.some((row, index) => row.id !== items[index]?.id)) {
          throw new TranslationError("VALIDATION", `Checkpoint item translations are missing or duplicated`);
        }
        assertBatchPreserved(
          items.map((item) => ({ id: item.id, text: item.text })),
          translations,
          plan.placeholders,
        );
        for (const row of translations) {
          const item = byId.get(row.id);
          if (item === undefined) {
            throw new TranslationError("VALIDATION", `Checkpoint item ${row.id} is not in the planned corpus`);
          }
          if (completedIds.has(row.id)) {
            continue;
          }
          const record = makeStoredItemSuccess({
            identityHash,
            item,
            text: row.text,
            originBatchIndex,
          });
          await writeJsonAtomic(itemRecordPath(paths, row.id), record);
          completedIds.add(row.id);
        }
        await rm(path.join(paths.failuresDir, batchFileName(originBatchIndex)), { force: true });
        await removeUnresolvedIds(paths, identityHash, translations.map((row) => row.id));
      });
    },
    persistFailure(batch, error) {
      return serialize(async () => {
        if (completed.has(batch.index) || batch.items.every((item) => completedIds.has(item.id))) {
          return;
        }
        const remaining = batch.items.filter((item) => !completedIds.has(item.id));
        const record: StoredBatchFailure = {
          schemaVersion: CHECKPOINT_SCHEMA_VERSION,
          batchIndex: batch.index,
          identityHash,
          itemIds: remaining.map((item) => item.id),
          error,
        };
        await writeJsonAtomic(path.join(paths.failuresDir, batchFileName(batch.index)), record);
      });
    },
    persistUnresolved(entry) {
      return serialize(async () => {
        if (completedIds.has(entry.id)) {
          return;
        }
        const current = await readUnresolvedList(paths.unresolved, identityHash);
        const items = current.items.filter((row) => row.id !== entry.id);
        items.push(entry);
        items.sort((left, right) => left.id.localeCompare(right.id));
        await writeUnresolvedList(paths.unresolved, identityHash, items);
      });
    },
    completedIndices() {
      return new Set(completed);
    },
    completedIds() {
      return new Set(completedIds);
    },
  };
}

async function removeUnresolvedIds(
  paths: CheckpointPaths,
  identityHash: string,
  ids: readonly string[],
): Promise<void> {
  const drop = new Set(ids);
  const current = await readUnresolvedList(paths.unresolved, identityHash);
  const next = current.items.filter((row) => !drop.has(row.id));
  if (next.length === current.items.length) {
    return;
  }
  await writeUnresolvedList(paths.unresolved, identityHash, next);
}

function translationsFromBatches(batches: ReadonlyMap<number, StoredBatchSuccess>): Map<string, string> {
  const byId = new Map<string, string>();
  for (const record of batches.values()) {
    for (const row of record.translations) {
      if (byId.has(row.id)) {
        throw new TranslationError("VALIDATION", `Checkpoint has duplicate translated id: ${row.id}`);
      }
      byId.set(row.id, row.text);
    }
  }
  return byId;
}

function idsFromBatchSuccesses(batches: ReadonlyMap<number, StoredBatchSuccess>): Set<string> {
  return new Set(translationsFromBatches(batches).keys());
}

function mergeItemSuccesses(
  completedIds: Set<string>,
  itemSuccesses: ReadonlyMap<string, { readonly id: string; readonly text: string }>,
  batchTexts: ReadonlyMap<string, string>,
): void {
  for (const [id, record] of itemSuccesses) {
    const existing = batchTexts.get(id);
    if (existing !== undefined && existing !== record.text) {
      throw new TranslationError("VALIDATION", `Checkpoint item ${id} disagrees with a saved batch`);
    }
    completedIds.add(id);
  }
}

function assertUnresolvedMatchesPlan(plan: CorpusPlan, items: readonly StoredUnresolvedItem[]): void {
  const planned = new Map(plan.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const row of items) {
    if (seen.has(row.id)) {
      throw new TranslationError("VALIDATION", `Checkpoint unresolved list has duplicate id: ${row.id}`);
    }
    seen.add(row.id);
    const item = planned.get(row.id);
    if (item === undefined || item.text !== row.sourceText) {
      throw new TranslationError("VALIDATION", "Existing checkpoint unresolved items do not match this input");
    }
  }
}

async function readExistingIdentity(filePath: string): Promise<CheckpointIdentity | undefined> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TranslationError("VALIDATION", "Existing checkpoint identity is not valid JSON");
  }
  return parseCheckpointIdentity(parsed);
}

async function readStoredSources(filePath: string, identity: CheckpointIdentity): Promise<StoredSources> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new TranslationError("VALIDATION", "Existing checkpoint is missing sources.json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TranslationError("VALIDATION", "Existing checkpoint sources.json is not valid JSON");
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    throw new TranslationError("VALIDATION", "Existing checkpoint sources.json has an incompatible schema");
  }
  const storedIdentity = parseCheckpointIdentity(parsed.identity);
  if (!identitiesMatch(storedIdentity, identity)) {
    throw new TranslationError("VALIDATION", "Existing checkpoint sources.json identity does not match");
  }
  if (!Array.isArray(parsed.items)) {
    throw new TranslationError("VALIDATION", "Existing checkpoint sources.json is missing items");
  }
  return {
    schemaVersion: 1,
    identity: storedIdentity,
    items: parsed.items.map((row, index) => parseStoredCorpusItem(row, index)),
  };
}

function assertSameItems(stored: readonly CorpusItem[], planned: readonly CorpusItem[]): void {
  if (stored.length !== planned.length) {
    throw new TranslationError("VALIDATION", "Existing checkpoint source items do not match this input");
  }
  for (let index = 0; index < planned.length; index += 1) {
    const left = stored[index];
    const right = planned[index];
    if (left === undefined || right === undefined || left.id !== right.id || left.text !== right.text) {
      throw new TranslationError("VALIDATION", "Existing checkpoint source items do not match this input");
    }
  }
}

async function assertOutIsReusable(paths: CheckpointPaths): Promise<void> {
  const names = await listMaybe(paths.root);
  if (names === undefined) {
    return;
  }
  const leftovers = names.filter((name) => name !== "." && name !== "..");
  if (leftovers.length > 0) {
    throw new TranslationError(
      "VALIDATION",
      "Translation out directory is not empty and has no valid checkpoint identity",
    );
  }
}

async function loadValidatedCompletions(
  paths: CheckpointPaths,
  plan: CorpusPlan,
  identityHash: string,
): Promise<Map<number, StoredBatchSuccess>> {
  const names = (await listMaybe(paths.batchesDir)) ?? [];
  const completed = new Map<number, StoredBatchSuccess>();
  for (const name of names) {
    if (name.endsWith(".tmp")) {
      continue;
    }
    if (!isBatchFileName(name)) {
      throw new TranslationError("VALIDATION", `Unexpected file in checkpoint batches: ${name}`);
    }
    let record: StoredBatchSuccess;
    try {
      record = parseStoredBatchSuccess(await readJsonFile(path.join(paths.batchesDir, name)));
    } catch {
      throw new TranslationError("VALIDATION", `Checkpoint batch ${name} is corrupt and cannot be reused`);
    }
    const expectedIndex = Number(name.slice(0, 6));
    if (record.batchIndex !== expectedIndex) {
      throw new TranslationError("VALIDATION", `Checkpoint batch ${name} does not match its file name`);
    }
    const batch = plan.batches[record.batchIndex];
    if (batch === undefined) {
      throw new TranslationError("VALIDATION", `Checkpoint batch ${name} is outside the planned corpus`);
    }
    validateSuccessAgainstPlan(plan, identityHash, batch, record.translations, record);
    completed.set(record.batchIndex, record);
  }
  return completed;
}

function validateSuccessAgainstPlan(
  plan: CorpusPlan,
  identityHash: string,
  batch: CorpusBatch,
  translations: readonly { readonly id: string; readonly text: string }[],
  stored?: StoredBatchSuccess,
): void {
  if (stored !== undefined && stored.identityHash !== identityHash) {
    throw new TranslationError("VALIDATION", `Checkpoint batch ${batch.index} identity does not match`);
  }
  if (stored !== undefined) {
    if (stored.items.length !== batch.items.length) {
      throw new TranslationError("VALIDATION", `Checkpoint batch ${batch.index} items do not match the plan`);
    }
    for (let index = 0; index < batch.items.length; index += 1) {
      const item = batch.items[index];
      const saved = stored.items[index];
      if (item === undefined || saved === undefined || saved.id !== item.id || saved.sourceText !== item.text) {
        throw new TranslationError("VALIDATION", `Checkpoint batch ${batch.index} items do not match the plan`);
      }
    }
  }
  const ids = translations.map((row) => row.id);
  const expected = batch.items.map((item) => item.id);
  if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) {
    throw new TranslationError("VALIDATION", `Checkpoint batch ${batch.index} translations are missing or duplicated`);
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new TranslationError("VALIDATION", `Checkpoint batch ${batch.index} has duplicate id: ${id}`);
    }
    seen.add(id);
  }
  assertBatchPreserved(
    batch.items.map((item) => ({ id: item.id, text: item.text })),
    translations,
    plan.placeholders,
  );
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
