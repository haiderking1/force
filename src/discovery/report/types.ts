import type { ResourceEvidence } from "../evidence/types.ts";
import type { InventoryRecord, ScanCoverage } from "../inventory/types.ts";

export const REPORT_SCHEMA_VERSION = 1;

export type ClassificationStatus =
  | "unclassified"
  | "classified"
  | "classification-error"
  | "insufficient-evidence";

export type RankingMethod = "local-evidence" | "jev-roles";

export type RoleName =
  | "playerVisibleUiText"
  | "spokenDialogueOrSubtitles"
  | "referenceOnly"
  | "debugOrInternal"
  | "insufficientEvidence";

export type RoleProbabilities = {
  readonly playerVisibleUiText: number;
  readonly spokenDialogueOrSubtitles: number;
  readonly referenceOnly: number;
  readonly debugOrInternal: number;
  readonly insufficientEvidence: number;
};

export type ResourceArchive = {
  readonly familyId: string;
  readonly headerPath: string | undefined;
  readonly payloadPath: string | undefined;
  readonly manifestPath: string | undefined;
};

export type RankedResource = {
  readonly id: string;
  readonly relativePath: string;
  readonly size: number;
  readonly kind: InventoryRecord["kind"];
  readonly signature: InventoryRecord["signature"];
  readonly archive: ResourceArchive | undefined;
  readonly entryOffset: number | undefined;
  readonly packEntryExtraction: ResourceEvidence["packEntryExtraction"];
  readonly evidence: ResourceEvidence;
  readonly localScore: number;
  readonly roles: RoleProbabilities | undefined;
  readonly status: ClassificationStatus;
  readonly uncertainty: number;
  readonly classificationError: string | undefined;
};

export type JevReportMeta =
  | {
      readonly ran: false;
    }
  | {
      readonly ran: true;
      readonly model: string;
      readonly resolvedModel: string | undefined;
      readonly questionSetVersion: string;
      readonly contractSources: readonly string[];
    };

export type DiscoveryReport = {
  readonly schemaVersion: typeof REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly gameId: string;
  readonly root: string;
  readonly mode: "scan" | "classified";
  readonly rankingMethod: RankingMethod;
  readonly jev: JevReportMeta;
  readonly coverage: ScanCoverage;
  readonly resources: readonly RankedResource[];
};
