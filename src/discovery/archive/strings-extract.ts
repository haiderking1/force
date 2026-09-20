import { readdir } from "node:fs/promises";
import path from "node:path";
import { payloadPathFromHeader } from "../../archive/companion-path.ts";
import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { ArchiveError } from "../../archive/errors.ts";
import type { ArchiveList } from "../../archive/types.ts";
import { decodeExtractedText, isDecodedResourceType, type ExtractedTextRecord } from "../../resources/text-records.ts";

export type PackStringsCoverage = {
  readonly packsOpened: number;
  readonly packsFailed: readonly { readonly header: string; readonly error: string }[];
  readonly entriesSeen: number;
  readonly entriesDecoded: number;
  readonly recordsWritten: number;
  readonly recordsWithText: number;
  readonly skippedTypes: readonly { readonly typeName: string; readonly count: number }[];
  readonly unsupportedCompression: number;
  readonly assumptions: readonly string[];
};

export type PackStringsResult = {
  readonly records: readonly ExtractedTextRecord[];
  readonly coverage: PackStringsCoverage;
};

async function headerPathsFromRoot(root: string): Promise<string[]> {
  const packsDir = path.join(root, "Win", "Packs");
  let names: string[];
  try {
    names = await readdir(packsDir);
  } catch {
    names = await readdir(root);
    return names.filter((name) => name.toLowerCase().endsWith(".~h")).map((name) => path.join(root, name));
  }
  return names.filter((name) => name.toLowerCase().endsWith(".~h")).map((name) => path.join(packsDir, name));
}

function countByType(list: ArchiveList): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of list.entries) {
    const key = entry.typeName ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function extractPackStrings(options: {
  readonly root?: string;
  readonly headerPath?: string;
  readonly payloadPath?: string;
  readonly match?: readonly string[];
}): Promise<PackStringsResult> {
  const headers =
    options.headerPath !== undefined
      ? [options.headerPath]
      : options.root !== undefined
        ? await headerPathsFromRoot(options.root)
        : [];
  if (headers.length === 0) {
    throw new ArchiveError("VALIDATION", "discover pack strings needs --header or --root");
  }

  const records: ExtractedTextRecord[] = [];
  const failed: { header: string; error: string }[] = [];
  const skipped = new Map<string, number>();
  let packsOpened = 0;
  let entriesSeen = 0;
  let entriesDecoded = 0;
  let unsupportedCompression = 0;
  let assumptions: readonly string[] = [];

  for (const headerPath of headers) {
    const payloadPath = options.payloadPath ?? payloadPathFromHeader(headerPath);
    let list: ArchiveList;
    try {
      list = await openBuddhaPack({ headerPath, payloadPath });
    } catch (error) {
      failed.push({
        header: headerPath,
        error: error instanceof Error ? error.message : "open failed",
      });
      continue;
    }
    packsOpened += 1;
    entriesSeen += list.entries.length;
    assumptions = list.assumptions;
    for (const [typeName, count] of countByType(list)) {
      if (!isDecodedResourceType(typeName)) {
        skipped.set(typeName, (skipped.get(typeName) ?? 0) + count);
      }
    }
    for (const entry of list.entries) {
      if (!isDecodedResourceType(entry.typeName)) {
        continue;
      }
      if (
        options.match !== undefined &&
        options.match.length > 0 &&
        entry.typeName === "StringTable" &&
        !options.match.some((needle) => entry.identifier.includes(needle))
      ) {
        skipped.set("StringTable-filtered", (skipped.get("StringTable-filtered") ?? 0) + 1);
        continue;
      }
      if (entry.compression === "unsupported") {
        unsupportedCompression += 1;
        continue;
      }
      const extracted = await extractBuddhaEntry(list, entry.identifier);
      const decoded = decodeExtractedText(list, extracted);
      if (decoded.status === "skipped") {
        skipped.set(entry.typeName ?? "unknown", (skipped.get(entry.typeName ?? "unknown") ?? 0) + 1);
        continue;
      }
      entriesDecoded += 1;
      records.push(...decoded.records);
    }
  }

  const resolved = resolveLineCodeText(records);

  return {
    records: resolved,
    coverage: {
      packsOpened,
      packsFailed: failed,
      entriesSeen,
      entriesDecoded,
      recordsWritten: records.length,
      recordsWithText: records.filter((record) => record.text !== undefined && record.text.length > 0).length,
      skippedTypes: [...skipped.entries()].map(([typeName, count]) => ({ typeName, count })).sort((a, b) => a.typeName.localeCompare(b.typeName)),
      unsupportedCompression,
      assumptions,
    },
  };
}

function resolveLineCodeText(records: readonly ExtractedTextRecord[]): ExtractedTextRecord[] {
  const texts = new Map<string, { readonly text: string; readonly source: string }>();
  for (const record of records) {
    if (record.entryType === "StringTable" && record.text !== undefined) {
      texts.set(record.recordId, { text: record.text, source: record.entryName });
    }
  }
  return records.map((record) => {
    if (record.text !== undefined || record.entryType === "StringTable" || record.entryType === "Story") {
      return record;
    }
    const code = record.recordId.includes(":") ? record.recordId.slice(record.recordId.lastIndexOf(":") + 1) : record.recordId;
    const hit = texts.get(code);
    if (hit === undefined) {
      return record;
    }
    return {
      ...record,
      text: hit.text,
      extra: { ...record.extra, resolvedFrom: hit.source },
    };
  });
}
