import { afterEach, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { brutalLegendAdapter } from "../../games/brutal-legend/discovery/adapter.ts";
import { EVIDENCE_READ_BYTES } from "./bounds.ts";
import { extractEvidence } from "./extract.ts";
import type { InventoryRecord } from "../inventory/types.ts";
import { createTempDirTracker } from "../../testing/temp-dir.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

function record(relativePath: string, size: number, kind: InventoryRecord["kind"], excluded = false): InventoryRecord {
  return {
    id: relativePath,
    relativePath,
    size,
    kind,
    signature: { name: kind === "text" || kind === "pack-manifest" ? "text" : "unknown", offset: 0, bytesHex: "" },
    companionIds: [],
    manifestIds: [],
    packFamilyId: kind === "pack-manifest" ? "win/packs/loc_enus" : undefined,
    excludedFromEvidence: excluded,
    exclusionReason: excluded ? "size exceeds evidence bound" : undefined,
  };
}

test("keeps manifest links and real line offsets", async () => {
  const root = await tempDirs.create("force-extract-");
  const text = "==== Loc_enUS.~p ====\r\nPackfile loc_enus.~p\r\nstringtable/brutallegend:Story\n";
  await writeFile(path.join(root, "loc_enus.txt"), text);
  const manifest = record("loc_enus.txt", text.length, "pack-manifest");
  const payload = record("Loc_enUS.~p", 10, "pack-payload", true);
  const evidence = await extractEvidence(path.join(root, "loc_enus.txt"), manifest, [manifest, payload], brutalLegendAdapter);
  const pack = evidence.references.find((item) => item.typeName === "Packfile");
  expect(pack?.value).toBe("loc_enus.~p");
  expect(pack?.resolution).toBe("case-insensitive-path");
  expect(pack?.resolvedResourceId).toBe("Loc_enUS.~p");
  const story = evidence.references.find((item) => item.typeName === "Story");
  expect(story?.value).toBe("stringtable/brutallegend");
  expect(story?.sourceOffset).toBe(text.indexOf("stringtable/brutallegend:Story"));
  expect(story?.resolution).toBe("unresolved");
});

test("does not invent pack offsets and respects the read bound", async () => {
  const root = await tempDirs.create("force-bound-");
  const prefix = Buffer.alloc(EVIDENCE_READ_BYTES, 0x00);
  const hidden = Buffer.from("HiddenDialogueLine");
  await writeFile(path.join(root, "blob.bin"), Buffer.concat([prefix, hidden]));
  const file = record("blob.bin", EVIDENCE_READ_BYTES + hidden.length, "other");
  const evidence = await extractEvidence(path.join(root, "blob.bin"), file, [file], brutalLegendAdapter);
  expect(evidence.truncated).toBe(true);
  expect(evidence.samples.some((sample) => sample.text.includes("HiddenDialogueLine"))).toBe(false);
  expect(evidence.packEntryExtraction).toBe("not-applicable");

  const header = record("Loc_enUS.~h", 32, "pack-header");
  await writeFile(path.join(root, "Loc_enUS.~h"), "dfpf\0\0\0\0");
  const headerEvidence = await extractEvidence(path.join(root, "Loc_enUS.~h"), header, [header], brutalLegendAdapter);
  expect(headerEvidence.packEntryExtraction).toBe("unsupported");
  expect(headerEvidence.notes.some((note) => note.includes("was not parsed"))).toBe(true);
});

test("returns notes instead of fake samples for excluded and unreadable files", async () => {
  const skipped = await extractEvidence("/nope", record("huge.~p", 99, "pack-payload", true), [], brutalLegendAdapter);
  expect(skipped.samples).toEqual([]);
  expect(skipped.notes.length).toBeGreaterThan(0);
});
