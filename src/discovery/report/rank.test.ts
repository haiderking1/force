import { expect, test } from "bun:test";
import { brutalLegendAdapter } from "../games/brutal-legend/adapter.ts";
import { sortByJevRoles, sortByLocalEvidence, toRankedResource } from "./rank.ts";
import type { InventoryRecord } from "../inventory/types.ts";
import type { ResourceEvidence } from "../evidence/types.ts";
import type { RankedResource } from "./types.ts";

function record(id: string, kind: InventoryRecord["kind"] = "text"): InventoryRecord {
  return {
    id,
    relativePath: id,
    size: 10,
    kind,
    signature: { name: "text", offset: 0, bytesHex: "" },
    companionIds: [],
    manifestIds: [],
    packFamilyId: undefined,
    excludedFromEvidence: false,
    exclusionReason: undefined,
  };
}

function evidence(id: string, extras: Partial<ResourceEvidence> = {}): ResourceEvidence {
  return {
    resourceId: id,
    samples: extras.samples ?? [],
    references: extras.references ?? [],
    gfx: extras.gfx,
    packEntryExtraction: "not-applicable",
    truncated: false,
    notes: extras.notes ?? [],
  };
}

test("ranks local evidence above empty files and does not mark it Jev-classified", () => {
  const rich = record("man_trivial.txt", "pack-manifest");
  const poor = record("noise.bin", "other");
  const ranked = sortByLocalEvidence([
    toRankedResource(
      poor,
      [poor],
      evidence("noise.bin"),
      brutalLegendAdapter,
    ),
    toRankedResource(
      rich,
      [rich],
      evidence("man_trivial.txt", {
        references: [
          {
            value: "gameplay/subtitles/fini",
            typeName: "VidSubtitles",
            sourceOffset: 12,
            resolvedResourceId: undefined,
            resolution: "unresolved",
          },
        ],
      }),
      brutalLegendAdapter,
    ),
  ]);
  expect(ranked[0]?.relativePath).toBe("man_trivial.txt");
  expect(ranked[0]?.status).toBe("unclassified");
  expect(ranked[0]?.roles).toBeUndefined();
});

test("sorts classified resources by Jev role probabilities and keeps errors", () => {
  const base = toRankedResource(record("a.txt"), [record("a.txt")], evidence("a.txt"), brutalLegendAdapter);
  const high: RankedResource = {
    ...base,
    id: "ui.gfx",
    relativePath: "ui.gfx",
    status: "classified",
    roles: {
      playerVisibleUiText: 0.9,
      spokenDialogueOrSubtitles: 0.1,
      referenceOnly: 0.2,
      debugOrInternal: 0.05,
      insufficientEvidence: 0.1,
    },
    uncertainty: 0.1,
  };
  const low: RankedResource = {
    ...base,
    id: "debug.cfg",
    relativePath: "debug.cfg",
    status: "classified",
    roles: {
      playerVisibleUiText: 0.1,
      spokenDialogueOrSubtitles: 0.1,
      referenceOnly: 0.8,
      debugOrInternal: 0.7,
      insufficientEvidence: 0.2,
    },
    uncertainty: 0.2,
  };
  const failed: RankedResource = {
    ...base,
    id: "broken.txt",
    relativePath: "broken.txt",
    status: "classification-error",
    classificationError: "missing noul",
    roles: undefined,
    uncertainty: 1,
  };
  const sorted = sortByJevRoles([low, failed, high]);
  expect(sorted.map((item) => item.id)).toEqual(["ui.gfx", "debug.cfg", "broken.txt"]);
});
