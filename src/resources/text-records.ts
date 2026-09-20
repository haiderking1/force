import type { ArchiveEntry, ArchiveList, ExtractedEntry } from "../archive/types.ts";
import { decodeJournalEntries } from "./journal/decode.ts";
import { decodeStringTable } from "./stringtable/decode.ts";
import { decodeStory } from "./story/decode.ts";
import { decodeSystemLineCodes } from "./system-line-codes/decode.ts";
import { decodeVidSubtitles } from "./subtitles/decode.ts";

export const DECODED_RESOURCE_TYPES = [
  "StringTable",
  "VidSubtitles",
  "Story",
  "SystemLineCodes",
  "JournalEntries",
] as const;

export type DecodedResourceType = (typeof DECODED_RESOURCE_TYPES)[number];

export type ExtractedTextRecord = {
  readonly archiveHeader: string;
  readonly archivePayload: string | undefined;
  readonly entryName: string;
  readonly entryType: string | undefined;
  readonly entryIndex: number;
  readonly payloadOffset: number;
  readonly storedSize: number;
  readonly contentSize: number;
  readonly recordId: string;
  readonly text: string | undefined;
  readonly sourceByteOffset: number | undefined;
  readonly extra: Readonly<Record<string, string | number | undefined>>;
};

export type ResourceDecodeResult =
  | { readonly status: "decoded"; readonly records: readonly ExtractedTextRecord[] }
  | { readonly status: "skipped"; readonly reason: string };

function baseRecord(
  list: ArchiveList,
  entry: ArchiveEntry,
  recordId: string,
  text: string | undefined,
  sourceByteOffset: number | undefined,
  extra: Readonly<Record<string, string | number | undefined>>,
): ExtractedTextRecord {
  return {
    archiveHeader: list.headerPath,
    archivePayload: list.payloadPath,
    entryName: entry.identifier,
    entryType: entry.typeName,
    entryIndex: entry.index,
    payloadOffset: entry.payloadOffset,
    storedSize: entry.storedSize,
    contentSize: entry.contentSize,
    recordId,
    text,
    sourceByteOffset,
    extra,
  };
}

export function isDecodedResourceType(typeName: string | undefined): typeName is DecodedResourceType {
  return (
    typeName === "StringTable" ||
    typeName === "VidSubtitles" ||
    typeName === "Story" ||
    typeName === "SystemLineCodes" ||
    typeName === "JournalEntries"
  );
}

export function decodeExtractedText(list: ArchiveList, extracted: ExtractedEntry): ResourceDecodeResult {
  const typeName = extracted.entry.typeName;
  if (!isDecodedResourceType(typeName)) {
    return {
      status: "skipped",
      reason: typeName === undefined ? "entry has no type name" : `resource type ${typeName} is not a text decoder target`,
    };
  }
  if (typeName === "StringTable") {
    const decoded = decodeStringTable(extracted.bytes);
    return {
      status: "decoded",
      records: decoded.records.map((record) =>
        baseRecord(list, extracted.entry, record.lineCode, record.text, record.textOffset, {
          volumeDb: record.volumeDb,
          soundCue: record.soundCue,
        }),
      ),
    };
  }
  if (typeName === "VidSubtitles") {
    const decoded = decodeVidSubtitles(extracted.bytes);
    return {
      status: "decoded",
      records: decoded.records.map((record) =>
        baseRecord(list, extracted.entry, record.lineCode, undefined, record.keyOffset, {
          startFrame: record.startFrame,
          length: record.length,
          note: "line code only; display text is in StringTable",
        }),
      ),
    };
  }
  if (typeName === "Story") {
    const decoded = decodeStory(extracted.bytes);
    const records: ExtractedTextRecord[] = [];
    decoded.languages.forEach((language, index) => {
      for (const table of language.stringTables) {
        records.push(
          baseRecord(list, extracted.entry, `lang-${index}:${table}`, undefined, undefined, {
            localizedLanguageCode: language.localizedLanguageCode,
            kind: "stringtable-ref",
          }),
        );
      }
    });
    return { status: "decoded", records };
  }
  if (typeName === "SystemLineCodes") {
    const decoded = decodeSystemLineCodes(extracted.bytes);
    return {
      status: "decoded",
      records: decoded.records.map((record) =>
        baseRecord(list, extracted.entry, `slot-${record.slot}:${record.lineCode}`, undefined, record.byteOffset, {
          slot: record.slot,
          note: "system slot maps to a StringTable line code",
        }),
      ),
    };
  }
  const decoded = decodeJournalEntries(extracted.bytes);
  return {
    status: "decoded",
    records: decoded.records.flatMap((record) => {
      const rows: ExtractedTextRecord[] = [];
      if (record.nameLineCode !== undefined) {
        rows.push(
          baseRecord(list, extracted.entry, record.nameLineCode, undefined, record.keyOffset, {
            path: record.path,
            field: "Name",
            note: "journal name line code; display text is in StringTable",
          }),
        );
      }
      if (record.descLineCode !== undefined) {
        rows.push(
          baseRecord(list, extracted.entry, record.descLineCode, undefined, record.keyOffset, {
            path: record.path,
            field: "Desc",
            note: "journal desc line code; display text is in StringTable",
          }),
        );
      }
      return rows;
    }),
  };
}
