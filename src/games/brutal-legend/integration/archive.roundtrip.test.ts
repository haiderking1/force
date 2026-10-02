import { expect, test } from "bun:test";
import { originalGamePack } from "./original-game.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractBuddhaEntry } from "../../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../../archive/buddha/open.ts";
import { decodeStringTable } from "../../../resources/stringtable/decode.ts";
import { BRUTAL_LEGEND_STRING_TABLE_ENTRY } from "../config.ts";
import { sha256Bytes } from "../../../patch/hash.ts";
import { replaceStringTableTexts } from "../../../patch/stringtable/replace.ts";
import {
  assertUntouchedEntriesMatch,
  collectUntouchedEntries,
  headerOutsideReplacementFieldsEqual,
  replacedEntryPreservedBits,
} from "../../../patch/archive/compare.ts";
import { replaceBuddhaEntries } from "../../../patch/archive/replace-entries.ts";

test("production RgS_Faction replacement preserves untouched metadata and payload hashes", async () => {
  const { headerPath, payloadPath } = await originalGamePack("Win/Packs/RgS_Faction.~h", process.env);
  const originalList = await openBuddhaPack({ headerPath, payloadPath });
  const originalHeader = new Uint8Array(await Bun.file(headerPath).arrayBuffer());
  const originalPayload = new Uint8Array(await Bun.file(payloadPath).arrayBuffer());
  const entry = originalList.entries.find((item) => item.identifier === BRUTAL_LEGEND_STRING_TABLE_ENTRY);
  if (entry === undefined) {
    throw new Error("stringtable/brutallegend_enus missing");
  }
  const extracted = await extractBuddhaEntry(originalList, BRUTAL_LEGEND_STRING_TABLE_ENTRY);
  const decoded = decodeStringTable(extracted.bytes);
  const first = decoded.records.find((record) => record.lineCode === "PMTE028TEXT");
  const second = decoded.records.find((record) => record.lineCode === "PMTE029TEXT");
  if (first === undefined || second === undefined) {
    throw new Error("verified menu ids missing from production StringTable");
  }
  const rewritten = replaceStringTableTexts(extracted.bytes, [
    { lineCode: "PMTE028TEXT", text: "رجوع" },
    { lineCode: "PMTE029TEXT", text: "اختيار" },
  ]);
  const untouched = collectUntouchedEntries(originalList, originalHeader, originalPayload, new Set([entry.index]));
  const rebuilt = await replaceBuddhaEntries({
    headerPath,
    payloadPath,
    replacements: [{ identifier: BRUTAL_LEGEND_STRING_TABLE_ENTRY, bytes: rewritten.bytes }],
  });
  const originalRecord = rebuilt.replacements[0];
  if (originalRecord === undefined) {
    throw new Error("replacement info missing");
  }
  replacedEntryPreservedBits(
    Uint8Array.from((originalRecord.original.recordBytes.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16))),
    Uint8Array.from((originalRecord.next.recordBytes.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16))),
  );
  headerOutsideReplacementFieldsEqual(originalHeader, rebuilt.header, [entry]);
  const dir = await mkdtemp(path.join(tmpdir(), "force-prod-roundtrip-"));
  try {
    const nextHeader = path.join(dir, "RgS_Faction.~h");
    const nextPayload = path.join(dir, "RgS_Faction.~p");
    await writeFile(nextHeader, rebuilt.header);
    await writeFile(nextPayload, rebuilt.payload);
    const nextList = await openBuddhaPack({ headerPath: nextHeader, payloadPath: nextPayload });
    assertUntouchedEntriesMatch(
      untouched,
      collectUntouchedEntries(nextList, rebuilt.header, rebuilt.payload, new Set([entry.index])),
    );
    const nextExtracted = await extractBuddhaEntry(nextList, BRUTAL_LEGEND_STRING_TABLE_ENTRY);
    const nextDecoded = decodeStringTable(nextExtracted.bytes);
    expect(nextDecoded.records.find((record) => record.lineCode === "PMTE028TEXT")?.text).toBe("رجوع");
    expect(nextDecoded.records.find((record) => record.lineCode === "PMTE029TEXT")?.text).toBe("اختيار");
    expect(nextDecoded.records.find((record) => record.lineCode === first.lineCode && record.text === first.text)).toBeUndefined();
    const untouchedText = decoded.records.find((record) => record.lineCode === "TOGU042TEXT");
    expect(nextDecoded.records.find((record) => record.lineCode === "TOGU042TEXT")?.text).toBe(untouchedText?.text);
    expect(sha256Bytes(rebuilt.payload.subarray(entry.payloadOffset, entry.payloadOffset + 16))).not.toBe("");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
