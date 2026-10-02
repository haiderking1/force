import { splitIntoBatches } from "../pool/batches.ts";
import { assertPoolLimits } from "../pool/settings.ts";
import { buildTranslationMessages } from "../prompt.ts";
import { assertPlaceholderSpecs } from "../placeholders.ts";
import { TranslationError } from "../errors.ts";
import { mergePlaceholderTokens, collectPlaceholderTokens } from "../tokens/scan.ts";
import { sha256Json, sha256Text } from "./hash.ts";
import type { CheckpointIdentity, CorpusBatch, CorpusItem, CorpusPlan } from "./types.ts";

export type PlanCorpusOptions = {
  readonly items: readonly CorpusItem[];
  readonly targetLanguage: string;
  readonly explicitPlaceholders?: readonly string[];
  readonly provider: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly temperature: number;
  readonly batchSize: number;
  readonly workers: number;
};

export function planCorpus(options: PlanCorpusOptions): CorpusPlan {
  assertPoolLimits(options.workers, options.batchSize);
  if (options.items.length === 0) {
    throw new TranslationError("VALIDATION", "Translation requires at least one text item");
  }
  const targetLanguage = options.targetLanguage.trim();
  if (targetLanguage.length === 0) {
    throw new TranslationError("VALIDATION", "Target language must be non-empty");
  }
  assertUniqueItemIds(options.items);
  const discovered = collectPlaceholderTokens(options.items.map((item) => item.text));
  const placeholders = mergePlaceholderTokens(discovered, options.explicitPlaceholders ?? []);
  assertPlaceholderSpecs(placeholders);
  const groups = splitIntoBatches(options.items, options.batchSize);
  const batches: CorpusBatch[] = groups.map((items, index) => ({ index, items }));
  const identity = buildCheckpointIdentity({
    items: options.items,
    targetLanguage,
    placeholders,
    provider: options.provider,
    model: options.model,
    baseUrl: options.baseUrl,
    temperature: options.temperature,
    batchSize: options.batchSize,
  });
  return {
    items: options.items,
    batches,
    placeholders,
    targetLanguage,
    workers: options.workers,
    batchSize: options.batchSize,
    identity,
  };
}

export function buildCheckpointIdentity(options: {
  readonly items: readonly CorpusItem[];
  readonly targetLanguage: string;
  readonly placeholders: readonly string[];
  readonly provider: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly temperature: number;
  readonly batchSize: number;
}): CheckpointIdentity {
  const sourceRows = options.items.map((item) => ({ id: item.id, text: item.text,
    ...(item.context === undefined ? {} : { context: item.context }) }));
  const prompt = buildTranslationMessages({
    targetLanguage: options.targetLanguage,
    placeholders: options.placeholders,
    items: [{ id: "identity", text: "" }],
  });
  const system = prompt[0];
  if (system === undefined) {
    throw new TranslationError("VALIDATION", "Translation prompt is missing a system message");
  }
  return {
    schemaVersion: 1,
    sourceHash: sha256Json(sourceRows),
    sourceCount: options.items.length,
    targetLanguage: options.targetLanguage,
    promptHash: sha256Text(system.content),
    placeholders: options.placeholders,
    provider: options.provider,
    model: options.model,
    baseUrl: options.baseUrl,
    temperature: options.temperature,
    batchSize: options.batchSize,
  };
}

export function identityFingerprint(identity: CheckpointIdentity): string {
  return sha256Json(identity);
}

export function identitiesMatch(left: CheckpointIdentity, right: CheckpointIdentity): boolean {
  return identityFingerprint(left) === identityFingerprint(right);
}

function assertUniqueItemIds(items: readonly CorpusItem[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.id.trim().length === 0) {
      throw new TranslationError("VALIDATION", "Text ids must be non-empty");
    }
    if (seen.has(item.id)) {
      throw new TranslationError("VALIDATION", `Duplicate text id: ${item.id}`);
    }
    seen.add(item.id);
  }
}
