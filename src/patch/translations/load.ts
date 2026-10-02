import { isRecord } from "../../shared/validation/is-record.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PatchError } from "../errors.ts";
import { sha256Bytes } from "../hash.ts";

export type SavedTranslation = {
  readonly id: string;
  readonly text: string;
  readonly sourceText?: string;
  readonly sourceFile: string;
};

function readIdText(value: unknown): { readonly id: string; readonly text: string; readonly sourceText?: string } | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.text !== "string") {
    return undefined;
  }
  return {
    id: value.id,
    text: value.text,
    sourceText: typeof value.sourceText === "string" ? value.sourceText : undefined,
  };
}

export function parseTranslationFile(sourceFile: string, raw: unknown): readonly SavedTranslation[] {
  const rows: SavedTranslation[] = [];
  if (isRecord(raw) && Array.isArray(raw.translations)) {
    for (const item of raw.translations) {
      const parsed = readIdText(item);
      if (parsed !== undefined) {
        rows.push({ ...parsed, sourceFile });
      }
    }
    return rows;
  }
  if (isRecord(raw) && Array.isArray(raw.candidates)) {
    for (const item of raw.candidates) {
      if (!isRecord(item) || typeof item.id !== "string") {
        continue;
      }
      if (typeof item.arabic !== "string") {
        continue;
      }
      rows.push({
        id: item.id,
        text: item.arabic,
        sourceText: typeof item.english === "string" ? item.english : undefined,
        sourceFile,
      });
    }
    return rows;
  }
  throw new PatchError("TRANSLATION", `Unrecognized translation file ${sourceFile}`);
}

function mergeRows(merged: Map<string, SavedTranslation>, rows: readonly SavedTranslation[]): void {
  for (const row of rows) {
    if (!merged.has(row.id)) merged.set(row.id, row);
  }
}

export type TranslationInput = {
  readonly kind: "translations" | "candidates";
  readonly path: string;
  readonly sha256: string;
  readonly selectedCount: number;
};

export type LoadedTranslations = {
  readonly translations: ReadonlyMap<string, SavedTranslation>;
  readonly provenance: {
    /** Inputs in precedence order, including inputs that selected no ids. */
    readonly inputs: readonly TranslationInput[];
    /** Resolved winning input path for every selected id. */
    readonly selectedSources: Readonly<Record<string, string>>;
  };
};

/** Candidate files precede translation files; the first row for an id wins. */
export async function loadTranslations(
  translationPaths: readonly string[],
  candidatePaths: readonly string[] = [],
): Promise<LoadedTranslations> {
  const translations = new Map<string, SavedTranslation>();
  const inputs: TranslationInput[] = [];
  const ordered = [
    ...candidatePaths.map((file) => ({ kind: "candidates" as const, file })),
    ...translationPaths.map((file) => ({ kind: "translations" as const, file })),
  ];
  for (const { kind, file } of ordered) {
    const resolved = path.resolve(file);
    let bytes: Uint8Array;
    try {
      bytes = await readFile(resolved);
    } catch (error) {
      throw new PatchError("TRANSLATION", `Cannot read translation input ${resolved}: ${error instanceof Error ? error.message : String(error)}`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      throw new PatchError("TRANSLATION", `Cannot parse translation input ${resolved}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const before = translations.size;
    mergeRows(translations, parseTranslationFile(resolved, raw));
    inputs.push({ kind, path: resolved, sha256: sha256Bytes(bytes), selectedCount: translations.size - before });
  }
  return {
    translations,
    provenance: {
      inputs,
      selectedSources: Object.fromEntries([...translations].map(([id, row]) => [id, row.sourceFile])),
    },
  };
}
