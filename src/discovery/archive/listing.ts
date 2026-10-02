import type { ArchiveList } from "../../archive/types.ts";

export type ArchiveListingJson = {
  readonly format: string;
  readonly versionMajor: number;
  readonly versionMinor: number;
  readonly headerPath: string;
  readonly payloadPath: string | undefined;
  readonly payloadSize: number | undefined;
  readonly typeCount: number;
  readonly entryCount: number;
  readonly overlapCount: number;
  readonly types: readonly { readonly index: number; readonly name: string }[];
  readonly overlaps: ArchiveList["overlaps"];
  readonly assumptions: readonly string[];
  readonly entries: readonly {
    readonly index: number;
    readonly identifier: string;
    readonly name: string | undefined;
    readonly typeName: string | undefined;
    readonly typeIndex: number;
    readonly payloadOffset: number;
    readonly storedSize: number;
    readonly contentSize: number;
    readonly primaryContentSize: number;
    readonly extraContentSize: number;
    readonly compression: string;
    readonly recordOffset: number;
    readonly rangeError: string | undefined;
  }[];
};

export function listingJson(list: ArchiveList): ArchiveListingJson {
  return {
    format: list.format,
    versionMajor: list.versionMajor,
    versionMinor: list.versionMinor,
    headerPath: list.headerPath,
    payloadPath: list.payloadPath,
    payloadSize: list.payloadSize,
    typeCount: list.types.length,
    entryCount: list.entries.length,
    overlapCount: list.overlaps.length,
    types: list.types.map((type) => ({ index: type.index, name: type.name })),
    overlaps: list.overlaps,
    assumptions: list.assumptions,
    entries: list.entries.map((entry) => ({
      index: entry.index,
      identifier: entry.identifier,
      name: entry.name,
      typeName: entry.typeName,
      typeIndex: entry.typeIndex,
      payloadOffset: entry.payloadOffset,
      storedSize: entry.storedSize,
      contentSize: entry.contentSize,
      primaryContentSize: entry.primaryContentSize,
      extraContentSize: entry.extraContentSize,
      compression: entry.compression,
      recordOffset: entry.recordOffset,
      rangeError: entry.rangeError,
    })),
  };
}
