export type ArchiveEntry = {
  readonly index: number;
  readonly identifier: string;
  readonly name: string | undefined;
  readonly typeName: string | undefined;
  readonly typeIndex: number;
  readonly payloadOffset: number;
  readonly storedSize: number;
  readonly contentSize: number;
  readonly compression: ArchiveCompression;
  readonly nameTableOffset: number;
  readonly recordOffset: number;
  readonly rangeError: string | undefined;
};

export type ArchiveCompression = "none" | "zlib" | "unsupported";

export type ArchiveFileType = {
  readonly index: number;
  readonly name: string;
  readonly unknown1: number;
  readonly unknown2: number;
  readonly unknown3: number;
};

export type ArchiveList = {
  readonly format: string;
  readonly versionMajor: number;
  readonly versionMinor: number;
  readonly headerPath: string;
  readonly payloadPath: string | undefined;
  readonly payloadSize: number | undefined;
  readonly types: readonly ArchiveFileType[];
  readonly entries: readonly ArchiveEntry[];
  readonly overlaps: readonly ArchiveOverlap[];
  readonly assumptions: readonly string[];
};

export type ArchiveOverlap = {
  readonly leftIndex: number;
  readonly rightIndex: number;
};

export type ExtractedEntry = {
  readonly entry: ArchiveEntry;
  readonly storedBytes: Uint8Array;
  readonly bytes: Uint8Array;
  readonly decompressed: boolean;
};
