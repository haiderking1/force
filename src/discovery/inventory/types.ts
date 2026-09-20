export type ResourceKind =
  | "pack-header"
  | "pack-payload"
  | "pack-manifest"
  | "scaleform"
  | "text"
  | "font"
  | "audio"
  | "video"
  | "executable"
  | "other";

export type KnownSignatureName =
  | "dfpf"
  | "cfx"
  | "gfx"
  | "cws"
  | "fws"
  | "zws"
  | "bik"
  | "fsb"
  | "ttf"
  | "otf"
  | "pe"
  | "elf"
  | "text"
  | "unknown";

export type FileSignature = {
  readonly name: KnownSignatureName;
  readonly offset: number;
  readonly bytesHex: string;
};

export type WalkExclusion = {
  readonly relativePath: string;
  readonly reason: "symlink-escape" | "unsupported" | "unreadable" | "not-a-file";
  readonly detail: string;
};

export type InventoryRecord = {
  readonly id: string;
  readonly relativePath: string;
  readonly size: number;
  readonly kind: ResourceKind;
  readonly signature: FileSignature;
  readonly companionIds: readonly string[];
  readonly manifestIds: readonly string[];
  readonly packFamilyId: string | undefined;
  readonly excludedFromEvidence: boolean;
  readonly exclusionReason: string | undefined;
};

export type ScanCoverage = {
  readonly root: string;
  readonly filesSeen: number;
  readonly filesInventoried: number;
  readonly walkExclusions: readonly WalkExclusion[];
  readonly evidenceSkipped: readonly { readonly id: string; readonly reason: string }[];
  readonly unsupportedFormats: readonly string[];
  readonly packEntryExtraction: "supported" | "unsupported";
  readonly notes: readonly string[];
};

export type InventoryResult = {
  readonly records: readonly InventoryRecord[];
  readonly coverage: ScanCoverage;
};
