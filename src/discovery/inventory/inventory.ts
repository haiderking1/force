import type { GameAdapter } from "../games/types.ts";
import { linkCompanions } from "./companions.ts";
import type { InventoryRecord, InventoryResult } from "./types.ts";
import { walkGameTree } from "./walk.ts";

export async function buildInventory(root: string, adapter: GameAdapter): Promise<InventoryResult> {
  const walked = await walkGameTree(root, adapter);
  const drafts = walked.files.map((file) => ({
    id: file.record.id,
    relativePath: file.record.relativePath,
    kind: file.record.kind,
  }));
  const links = linkCompanions(drafts, adapter);
  const records: InventoryRecord[] = walked.files.map((file) => {
    const link = links.get(file.record.id);
    const isManifestMember = link !== undefined && link.packFamilyId !== undefined && file.record.kind === "text";
    return {
      ...file.record,
      kind: isManifestMember ? "pack-manifest" : file.record.kind,
      companionIds: link?.companionIds ?? [],
      manifestIds: link?.manifestIds ?? [],
      packFamilyId: link?.packFamilyId,
    };
  });

  const evidenceSkipped = records
    .filter((record) => record.excludedFromEvidence && record.exclusionReason !== undefined)
    .map((record) => ({ id: record.id, reason: record.exclusionReason ?? "excluded" }));

  const unsupported = new Set<string>();
  for (const record of records) {
    if (record.signature.name === "zws") {
      unsupported.add("swf-lzma");
    }
    if (record.kind === "audio") {
      unsupported.add("fsb-audio");
    }
    if (record.kind === "video") {
      unsupported.add("bik-video");
    }
  }
  unsupported.add("dialog-sets-binary");
  unsupported.add("dui-movie-flash-ref");

  return {
    records,
    coverage: {
      root,
      filesSeen: walked.filesSeen,
      filesInventoried: records.length,
      walkExclusions: walked.exclusions,
      evidenceSkipped,
      unsupportedFormats: [...unsupported].sort(),
      packEntryExtraction: "supported",
      notes: [
        "Buddha dfpf v5.0/v5.1 header tables are parsed. Use discover pack list/extract/strings.",
        "Filename hints are not treated as proof of player-visible text.",
        "DialogSets, DialogReactionSets, and DUIMovie flash files are listed as archive entries but not decoded as localizable text.",
      ],
    },
  };
}
