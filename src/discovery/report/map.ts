import type { ResourceEvidence } from "../evidence/types.ts";
import type { InventoryRecord } from "../inventory/types.ts";
import type { ResourceArchive } from "./types.ts";

export function archiveFor(record: InventoryRecord, records: readonly InventoryRecord[]): ResourceArchive | undefined {
  if (record.packFamilyId === undefined) {
    return undefined;
  }
  const family = records.filter((item) => item.packFamilyId === record.packFamilyId);
  return {
    familyId: record.packFamilyId,
    headerPath: family.find((item) => item.kind === "pack-header")?.relativePath,
    payloadPath: family.find((item) => item.kind === "pack-payload")?.relativePath,
    manifestPath: family.find((item) => item.kind === "pack-manifest")?.relativePath,
  };
}

export function emptyEvidence(record: InventoryRecord): ResourceEvidence {
  return {
    resourceId: record.id,
    samples: [],
    references: [],
    gfx: undefined,
    packEntryExtraction:
      record.kind === "pack-header" || record.kind === "pack-payload" ? "unsupported" : "not-applicable",
    truncated: false,
    notes: ["no evidence extracted"],
  };
}
