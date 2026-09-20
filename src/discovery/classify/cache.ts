import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JevEvaluateResult } from "./client.ts";
import { JEV_QUESTION_SET_VERSION } from "./contract.ts";

export function classificationCacheKey(model: string, evidenceHash: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ model, questionSetVersion: JEV_QUESTION_SET_VERSION, evidenceHash }))
    .digest("hex");
}

export function evidenceHash(state: unknown): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function isFiniteUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function cachedResult(value: unknown): JevEvaluateResult | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const resolvedModel = "resolvedModel" in value ? value.resolvedModel : undefined;
  const rolesRaw = "roles" in value ? value.roles : undefined;
  if (typeof resolvedModel !== "string" || typeof rolesRaw !== "object" || rolesRaw === null || Array.isArray(rolesRaw)) {
    return undefined;
  }
  const roles = new Map(Object.entries(rolesRaw));
  const playerVisibleUiText = roles.get("playerVisibleUiText");
  const spokenDialogueOrSubtitles = roles.get("spokenDialogueOrSubtitles");
  const referenceOnly = roles.get("referenceOnly");
  const debugOrInternal = roles.get("debugOrInternal");
  const insufficientEvidence = roles.get("insufficientEvidence");
  if (
    !isFiniteUnit(playerVisibleUiText) ||
    !isFiniteUnit(spokenDialogueOrSubtitles) ||
    !isFiniteUnit(referenceOnly) ||
    !isFiniteUnit(debugOrInternal) ||
    !isFiniteUnit(insufficientEvidence)
  ) {
    return undefined;
  }
  return {
    resolvedModel,
    roles: {
      playerVisibleUiText,
      spokenDialogueOrSubtitles,
      referenceOnly,
      debugOrInternal,
      insufficientEvidence,
    },
  };
}

export async function readCache(cacheDir: string, key: string): Promise<JevEvaluateResult | undefined> {
  try {
    const raw = await readFile(path.join(cacheDir, `${key}.json`), "utf8");
    return cachedResult(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export async function writeCache(cacheDir: string, key: string, value: JevEvaluateResult): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, `${key}.json`), `${JSON.stringify(value)}\n`, "utf8");
}
