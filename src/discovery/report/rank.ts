import type { GameAdapter } from "../games/types.ts";
import type { ResourceEvidence } from "../evidence/types.ts";
import type { InventoryRecord } from "../inventory/types.ts";
import { archiveFor, emptyEvidence } from "./map.ts";
import type { RankedResource, RoleProbabilities } from "./types.ts";

export function localEvidenceScore(record: InventoryRecord, evidence: ResourceEvidence, adapter: GameAdapter): number {
  let score = 0;
  score += Math.min(evidence.samples.length, 20);
  score += Math.min(evidence.references.length, 40) * 2;
  if (evidence.gfx?.parseStatus === "decompressed-sample" && evidence.samples.length > 0) {
    score += 8;
  }
  for (const reference of evidence.references) {
    if (
      reference.typeName !== undefined &&
      adapter.interestingManifestTypes.some((item) => item.toLowerCase() === reference.typeName?.toLowerCase())
    ) {
      score += 12;
    }
  }
  if (record.kind === "pack-manifest") {
    score += 4;
  }
  if (record.kind === "scaleform" && evidence.samples.length > 0) {
    score += 6;
  }
  return score;
}

export function uncertaintyFromRoles(roles: RoleProbabilities | undefined): number {
  if (roles === undefined) {
    return 1;
  }
  return roles.insufficientEvidence;
}

export function jevRoleScore(roles: RoleProbabilities): number {
  return Math.max(roles.playerVisibleUiText, roles.spokenDialogueOrSubtitles);
}

export function toRankedResource(
  record: InventoryRecord,
  records: readonly InventoryRecord[],
  evidence: ResourceEvidence | undefined,
  adapter: GameAdapter,
): RankedResource {
  const resolved = evidence ?? emptyEvidence(record);
  return {
    id: record.id,
    relativePath: record.relativePath,
    size: record.size,
    kind: record.kind,
    signature: record.signature,
    archive: archiveFor(record, records),
    entryOffset: undefined,
    packEntryExtraction: resolved.packEntryExtraction,
    evidence: resolved,
    localScore: localEvidenceScore(record, resolved, adapter),
    roles: undefined,
    status: "unclassified",
    uncertainty: 1,
    classificationError: undefined,
  };
}

export function sortByLocalEvidence(resources: readonly RankedResource[]): RankedResource[] {
  return [...resources].sort((left, right) => {
    if (right.localScore !== left.localScore) {
      return right.localScore - left.localScore;
    }
    return left.relativePath.localeCompare(right.relativePath);
  });
}

export function sortByJevRoles(resources: readonly RankedResource[]): RankedResource[] {
  return [...resources].sort((left, right) => {
    const leftScore = left.roles === undefined ? -1 : jevRoleScore(left.roles);
    const rightScore = right.roles === undefined ? -1 : jevRoleScore(right.roles);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    if (left.uncertainty !== right.uncertainty) {
      return left.uncertainty - right.uncertainty;
    }
    return left.relativePath.localeCompare(right.relativePath);
  });
}
