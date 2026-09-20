import type { ArchiveEntry, ArchiveList, ExtractedEntry } from "../types.ts";
import { ArchiveError } from "../errors.ts";
import { safeEntryRelativePath } from "../path-safety.ts";
import { readFileRange } from "../read-range.ts";
import { decompressBuddhaPayload } from "./compression.ts";
import { BUDDHA_MAX_STORED } from "./limits.ts";

export function findArchiveEntry(list: ArchiveList, identifier: string): ArchiveEntry {
  const matches = list.entries.filter((entry) => entry.identifier === identifier || entry.name === identifier);
  if (matches.length === 0) {
    const byIndex = /^entry-(\d+)$/.exec(identifier);
    if (byIndex !== null) {
      const index = Number(byIndex[1]);
      const entry = list.entries[index];
      if (entry !== undefined) {
        return entry;
      }
    }
    throw new ArchiveError("ENTRY", `No archive entry named ${identifier}`);
  }
  if (matches.length > 1) {
    throw new ArchiveError("ENTRY", `Archive entry name ${identifier} is not unique`);
  }
  const entry = matches[0];
  if (entry === undefined) {
    throw new ArchiveError("ENTRY", `No archive entry named ${identifier}`);
  }
  return entry;
}

export async function extractBuddhaEntry(list: ArchiveList, identifier: string): Promise<ExtractedEntry> {
  if (list.payloadPath === undefined) {
    throw new ArchiveError("COMPANION", "Cannot extract without a payload path");
  }
  const entry = findArchiveEntry(list, identifier);
  if (entry.name !== undefined) {
    safeEntryRelativePath(entry.name);
  }
  if (entry.rangeError !== undefined) {
    throw new ArchiveError("RANGE", `${entry.identifier}: ${entry.rangeError}`);
  }
  if (entry.storedSize > BUDDHA_MAX_STORED) {
    throw new ArchiveError("LIMIT", `${entry.identifier}: stored size ${entry.storedSize} exceeds ${BUDDHA_MAX_STORED}`);
  }
  const stored = await readFileRange(list.payloadPath, entry.payloadOffset, entry.storedSize);
  const bytes = decompressBuddhaPayload(stored.bytes, entry.compression, entry.contentSize);
  return {
    entry,
    storedBytes: stored.bytes,
    bytes,
    decompressed: entry.compression === "zlib",
  };
}
