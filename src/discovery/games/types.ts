export type GameAdapter = {
  readonly id: string;
  readonly displayName: string;
  readonly defaultRoot: (env: Readonly<Record<string, string | undefined>>) => string | undefined;
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
