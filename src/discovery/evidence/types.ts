export type StringEncoding = "ascii" | "utf-8" | "utf-16le";

export type OffsetSpace = "file" | "decompressed";

export type StringRun = {
  readonly offset: number;
  readonly byteLength: number;
  readonly encoding: StringEncoding;
  readonly offsetSpace: OffsetSpace;
  readonly text: string;
};

export type ObservedReference = {
  readonly value: string;
  readonly typeName: string | undefined;
  readonly sourceOffset: number;
  readonly resolvedResourceId: string | undefined;
  readonly resolution: "exact-path" | "case-insensitive-path" | "pack-family" | "unresolved";
};

export type GfxCompression = "none" | "zlib" | "lzma" | "unknown";

export type GfxParseStatus = "header" | "decompressed-sample" | "opaque" | "unsupported";

export type GfxMetadata = {
  readonly signature: "CFX" | "GFX" | "CWS" | "FWS" | "ZWS";
  readonly version: number;
  readonly declaredLength: number;
  readonly compression: GfxCompression;
  readonly decompressedBytes: number | undefined;
  readonly frameCount: number | undefined;
  readonly parseStatus: GfxParseStatus;
  readonly detail: string;
};

export type ResourceEvidence = {
  readonly resourceId: string;
  readonly samples: readonly StringRun[];
  readonly references: readonly ObservedReference[];
  readonly gfx: GfxMetadata | undefined;
  readonly packEntryExtraction: "unsupported" | "not-applicable" | "header-table";
  readonly truncated: boolean;
  readonly notes: readonly string[];
};
