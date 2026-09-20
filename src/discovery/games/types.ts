export type GameAdapter = {
  readonly id: string;
  readonly displayName: string;
  readonly defaultRoot: string | undefined;
  readonly headerSuffix: string;
  readonly payloadSuffix: string;
  readonly manifestSuffixes: readonly string[];
  readonly textExtensions: readonly string[];
  readonly scaleformExtensions: readonly string[];
  readonly skipEvidenceExtensions: readonly string[];
  readonly skipEvidenceMinSize: number;
  readonly alwaysEvidenceExtensions: readonly string[];
  readonly interestingManifestTypes: readonly string[];
};
