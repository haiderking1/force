import { expect, test } from "bun:test";
import { classifyReport } from "./classify.ts";
import type { JevClient } from "./client.ts";
import type { DiscoveryReport, RankedResource } from "../report/types.ts";

function resource(id: string, extras: Partial<RankedResource> = {}): RankedResource {
  return {
    id,
    relativePath: id,
    size: 10,
    kind: "text",
    signature: { name: "text", offset: 0, bytesHex: "" },
    archive: undefined,
    entryOffset: undefined,
    packEntryExtraction: "not-applicable",
    evidence: {
      resourceId: id,
      samples: extras.evidence?.samples ?? [{ offset: 0, byteLength: 5, encoding: "ascii", offsetSpace: "file", text: "Hello" }],
      references: extras.evidence?.references ?? [],
      gfx: undefined,
      packEntryExtraction: "not-applicable",
      truncated: false,
      notes: [],
    },
    localScore: 1,
    roles: undefined,
    status: "unclassified",
    uncertainty: 1,
    classificationError: undefined,
    ...extras,
  };
}

function report(resources: RankedResource[]): DiscoveryReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    gameId: "brutal-legend",
    root: "/tmp",
    mode: "scan",
    rankingMethod: "local-evidence",
    jev: { ran: false },
    coverage: {
      root: "/tmp",
      filesSeen: resources.length,
      filesInventoried: resources.length,
      walkExclusions: [],
      evidenceSkipped: [],
      unsupportedFormats: [],
      packEntryExtraction: "unsupported",
      notes: [],
    },
    resources,
  };
}

test("keeps independent multi-label Jev decisions and does not drop errors", async () => {
  const client: JevClient = {
    async evaluate(state) {
      const record = state as { resource: { id: string } };
      if (record.resource.id === "bad.txt") {
        throw new Error("boom");
      }
      return {
        resolvedModel: "jev-1.13.0",
        roles: {
          playerVisibleUiText: record.resource.id === "ui.txt" ? 0.91 : 0.1,
          spokenDialogueOrSubtitles: record.resource.id === "ui.txt" ? 0.4 : 0.88,
          referenceOnly: 0.2,
          debugOrInternal: 0.05,
          insufficientEvidence: 0.08,
        },
      };
    },
  };
  const classified = await classifyReport(
    report([
      resource("voice.txt"),
      resource("bad.txt"),
      resource("empty.bin", {
        evidence: {
          resourceId: "empty.bin",
          samples: [],
          references: [],
          gfx: undefined,
          packEntryExtraction: "not-applicable",
          truncated: false,
          notes: ["skipped"],
        },
      }),
      resource("ui.txt"),
    ]),
    { client, model: "jev-latest", concurrency: 2, now: () => "2026-01-02T00:00:00.000Z" },
  );
  expect(classified.mode).toBe("classified");
  expect(classified.rankingMethod).toBe("jev-roles");
  expect(classified.jev.ran).toBe(true);
  expect(classified.resources[0]?.id).toBe("ui.txt");
  expect(classified.resources[0]?.roles?.playerVisibleUiText).toBe(0.91);
  expect(classified.resources.find((item) => item.id === "voice.txt")?.roles?.spokenDialogueOrSubtitles).toBe(0.88);
  expect(classified.resources.find((item) => item.id === "bad.txt")?.status).toBe("classification-error");
  expect(classified.resources.find((item) => item.id === "empty.bin")?.status).toBe("insufficient-evidence");
  expect(classified.resources.find((item) => item.id === "empty.bin")?.roles).toBeUndefined();
});
