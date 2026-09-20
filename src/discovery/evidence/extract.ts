import { parseBuddhaEntries } from "../../archive/buddha/entries.ts";
import { parseBuddhaFileTypes } from "../../archive/buddha/file-types.ts";
import { parseBuddhaHeader } from "../../archive/buddha/header.ts";
import { isArchiveError } from "../../archive/errors.ts";
import { readBounded } from "../fs/read.ts";
import type { GameAdapter } from "../games/types.ts";
import { extensionOf } from "../inventory/exclusions.ts";
import type { InventoryRecord } from "../inventory/types.ts";
import { EVIDENCE_READ_BYTES, TEXT_READ_BYTES } from "./bounds.ts";
import { extractGfx } from "./gfx.ts";
import { extractReferences } from "./references.ts";
import { extractStringRuns } from "./strings.ts";
import { extractTextLines, splitUtf8Lines } from "./text-lines.ts";
import type { ObservedReference, ResourceEvidence, StringRun } from "./types.ts";

function isTextLike(record: InventoryRecord, adapter: GameAdapter): boolean {
  const extension = extensionOf(record.relativePath);
  return (
    record.kind === "text" ||
    record.kind === "pack-manifest" ||
    adapter.textExtensions.includes(extension) ||
    record.signature.name === "text"
  );
}

function isScaleform(record: InventoryRecord, adapter: GameAdapter): boolean {
  const extension = extensionOf(record.relativePath);
  return record.kind === "scaleform" || adapter.scaleformExtensions.includes(extension);
}

export async function extractEvidence(
  filePath: string,
  record: InventoryRecord,
  records: readonly InventoryRecord[],
  adapter: GameAdapter,
): Promise<ResourceEvidence> {
  const notes: string[] = [];
  if (record.excludedFromEvidence) {
    return {
      resourceId: record.id,
      samples: [],
      references: [],
      gfx: undefined,
      packEntryExtraction:
        record.kind === "pack-header" || record.kind === "pack-payload" ? "unsupported" : "not-applicable",
      truncated: false,
      notes: [record.exclusionReason ?? "excluded from evidence extraction"],
    };
  }

  const budget = isTextLike(record, adapter) ? TEXT_READ_BYTES : EVIDENCE_READ_BYTES;
  let read;
  try {
    read = await readBounded(filePath, budget);
  } catch (error) {
    const message = error instanceof Error ? error.message : "read failed";
    return {
      resourceId: record.id,
      samples: [],
      references: [],
      gfx: undefined,
      packEntryExtraction:
        record.kind === "pack-header" || record.kind === "pack-payload" ? "unsupported" : "not-applicable",
      truncated: false,
      notes: [`unreadable: ${message}`],
    };
  }

  if (read.truncated) {
    notes.push(`read first ${read.bytes.length} of ${read.size} bytes`);
  }

  let samples: StringRun[] = [];
  let gfx = extractGfx(read.bytes);
  let references: ObservedReference[] = [];
  if (gfx !== undefined && isScaleform(record, adapter)) {
    samples = [...gfx.samples];
    notes.push(gfx.metadata.detail);
  } else {
    gfx = undefined;
    if (isTextLike(record, adapter)) {
      const lines = splitUtf8Lines(read.bytes);
      samples = extractTextLines(read.bytes, adapter.interestingManifestTypes);
      references = extractReferences(record, lines, records, adapter.interestingManifestTypes);
    } else {
      samples = extractStringRuns(read.bytes, "binary", "file");
    }
  }

  let packEntryExtraction: ResourceEvidence["packEntryExtraction"] = "not-applicable";
  if (record.kind === "pack-payload") {
    packEntryExtraction = "unsupported";
    notes.push("Payload bytes are not scanned for text. Use discover pack list/extract on the paired header.");
  } else if (record.kind === "pack-header") {
    if (read.truncated) {
      packEntryExtraction = "unsupported";
      notes.push("Header is larger than the evidence read bound; table was not parsed here.");
    } else {
      try {
        const header = parseBuddhaHeader(read.bytes);
        const types = parseBuddhaFileTypes(read.bytes, header);
        const parsed = parseBuddhaEntries(read.bytes, header, types, undefined);
        packEntryExtraction = "header-table";
        notes.push(
          `Buddha v${header.versionMajor}.${header.versionMinor} header table: ${parsed.entries.length} entries, ${types.length} types. Use discover pack list for identifiers and offsets.`,
        );
      } catch (error) {
        packEntryExtraction = "unsupported";
        const message = isArchiveError(error) ? error.message : error instanceof Error ? error.message : "parse failed";
        notes.push(`Buddha header table was not parsed: ${message}`);
      }
    }
  }

  return {
    resourceId: record.id,
    samples,
    references,
    gfx: gfx?.metadata,
    packEntryExtraction,
    truncated: read.truncated,
    notes,
  };
}

export async function extractAllEvidence(
  root: string,
  records: readonly InventoryRecord[],
  adapter: GameAdapter,
  joinPath: (root: string, relative: string) => string,
): Promise<readonly ResourceEvidence[]> {
  const evidence: ResourceEvidence[] = [];
  for (const record of records) {
    evidence.push(await extractEvidence(joinPath(root, record.relativePath), record, records, adapter));
  }
  return evidence;
}
