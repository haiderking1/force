import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadExtractedStringTableCorpus, mapExtractedStringTableRecords } from "./load.ts";

function stringTable(overrides: Record<string, unknown> = {}) {
  return {
    archiveHeader: "/game/Win/Packs/Man_Trivial.~h",
    archivePayload: "/game/Win/Packs/Man_Trivial.~p",
    entryName: "stringtable/brutallegend",
    entryType: "StringTable",
    entryIndex: 12,
    payloadOffset: 100,
    storedSize: 20,
    contentSize: 20,
    recordId: "LINE001",
    text: "Hello /Activate/",
    sourceByteOffset: 8,
    extra: { volumeDb: "0", soundCue: "" },
    ...overrides,
  };
}

test("maps each StringTable id and skips linked reference rows", () => {
  const items = mapExtractedStringTableRecords([
    stringTable({ recordId: "LINE001", text: "One" }),
    stringTable({ recordId: "LINE002", text: "One" }),
    {
      ...stringTable({ recordId: "LINE001", text: "One", entryType: "JournalEntries", entryName: "journal/foo" }),
      extra: { note: "journal name line code; display text is in StringTable", resolvedFrom: "stringtable/brutallegend" },
    },
    {
      ...stringTable({ recordId: "slot-0:LINE001", text: "One", entryType: "SystemLineCodes" }),
      extra: { note: "system slot maps to a StringTable line code" },
    },
    {
      archiveHeader: "/game/Win/Packs/DLC1_Stuff.~h",
      archivePayload: "/game/Win/Packs/DLC1_Stuff.~p",
      entryName: "dlc1/stringtable/bl1dlc1",
      entryType: "Story",
      entryIndex: 1,
      payloadOffset: 0,
      storedSize: 1,
      contentSize: 1,
      recordId: "lang-0:dlc1/stringtable/bl1dlc1_usenglish",
      extra: { kind: "stringtable-ref" },
    },
  ]);
  expect(items.map((item) => item.id)).toEqual(["LINE001", "LINE002"]);
  expect(items.map((item) => item.text)).toEqual(["One", "One"]);
  expect(items[0]?.source.recordId).toBe("LINE001");
});

test("loads a JSON file and rejects a StringTable row without text", async () => {
  const dir = path.join(tmpdir(), `force-extracted-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "strings.json");
  await writeFile(filePath, `${JSON.stringify([stringTable()])}\n`);
  const items = await loadExtractedStringTableCorpus(filePath);
  expect(items).toHaveLength(1);
  expect(items[0]?.id).toBe("LINE001");
  expect(() =>
    mapExtractedStringTableRecords([
      {
        archiveHeader: "/game/a.~h",
        entryName: "stringtable/x",
        entryType: "StringTable",
        entryIndex: 0,
        recordId: "MISSING",
      },
    ]),
  ).toThrow(/missing text/);
});
