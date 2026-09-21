import { PatchError } from "../errors.ts";

export type SavedTranslation = {
  readonly id: string;
  readonly text: string;
  readonly sourceText?: string;
  readonly sourceFile: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

export function mergeTranslations(files: readonly { readonly path: string; readonly raw: unknown }[]): Map<string, SavedTranslation> {
  const merged = new Map<string, SavedTranslation>();
  for (const file of files) {
    for (const row of parseTranslationFile(file.path, file.raw)) {
      if (!merged.has(row.id)) {
        merged.set(row.id, row);
      }
    }
  }
  return merged;
}
