import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeMsbBits, writeU64Be } from "../../archive/buddha/bits.ts";
import { buildV5Pack } from "../../archive/buddha/build-v5-pack.ts";
import { extractBuddhaEntry } from "../../archive/buddha/extract.ts";
import { parseBuddhaHeader } from "../../archive/buddha/header.ts";
import { openBuddhaPack } from "../../archive/buddha/open.ts";
import { BUDDHA_ENTRY_SIZE, BUDDHA_UNKNOWN_BITS } from "../../archive/buddha/limits.ts";
import { PatchError } from "../errors.ts";
import { sha256Bytes } from "../hash.ts";
import {
  assertUntouchedEntriesMatch,
  collectUntouchedEntries,
  headerOutsideReplacementFieldsEqual,
  replacedEntryPreservedBits,
} from "./compare.ts";
import { replaceBuddhaEntries } from "./replace-entries.ts";

function resource(body: string): Uint8Array {
  const encoded = new TextEncoder().encode(body);
  const bytes = new Uint8Array(4 + encoded.length);
  bytes[0] = encoded.length & 0xff;
  bytes[1] = (encoded.length >> 8) & 0xff;
  bytes[2] = (encoded.length >> 16) & 0xff;
  bytes[3] = (encoded.length >> 24) & 0xff;
  bytes.set(encoded, 4);
  return bytes;
}

async function writePack(
  label: string,
  pack: ReturnType<typeof buildV5Pack>,
): Promise<{ header: string; payload: string }> {
  const dir = path.join(tmpdir(), `force-patch-pack-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const header = path.join(dir, "Sample.~h");
  const payload = path.join(dir, "Sample.~p");
  await writeFile(header, pack.header);
  await writeFile(payload, pack.payload);
  return { header, payload };
}

test("in-place replacement preserves unknown bits and untouched payload hashes", async () => {
  const keep = new Uint8Array(64);
  keep.fill(7);
  const table = resource('1StringTable{LineCodeData={MENU001TEXT=LineCodeData{Text="Hi";VolumeDB=0;SoundCue=;};};}');
  const pack = buildV5Pack(
    [{ name: "Blob" }, { name: "StringTable" }],
    [
      { name: "data/keep.bin", typeIndex: 0, bytes: keep, compress: false },
      { name: "stringtable/menu", typeIndex: 1, bytes: table, compress: true },
    ],
  );
  const headerParsed = parseBuddhaHeader(pack.header);
  const record = pack.header.subarray(headerParsed.fileIndexOffset + BUDDHA_ENTRY_SIZE, headerParsed.fileIndexOffset + 32);
  writeMsbBits(record, 0x1abcd, 5, 5, BUDDHA_UNKNOWN_BITS);
  const files = await writePack("inplace", pack);
  await writeFile(files.header, pack.header);

  const originalList = await openBuddhaPack({ headerPath: files.header, payloadPath: files.payload });
  const originalHeader = pack.header.slice();
  const originalPayload = pack.payload.slice();
  const originalUntouched = collectUntouchedEntries(originalList, originalHeader, originalPayload, new Set([1]));

  const grown = resource(
    '1StringTable{LineCodeData={MENU001TEXT=LineCodeData{Text="H";VolumeDB=0;SoundCue=;};};}',
  );
  const result = await replaceBuddhaEntries({
    headerPath: files.header,
    payloadPath: files.payload,
    replacements: [{ identifier: "stringtable/menu", bytes: grown }],
  });
  expect(result.replacements[0]?.placement).toBe("in-place");
  replacedEntryPreservedBits(
    Uint8Array.from(result.replacements[0]?.original.recordBytes.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? []),
    Uint8Array.from(result.replacements[0]?.next.recordBytes.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? []),
  );

  const rebuiltHeader = path.join(path.dirname(files.header), "Rebuilt.~h");
  const rebuiltPayload = path.join(path.dirname(files.header), "Rebuilt.~p");
  await writeFile(rebuiltHeader, result.header);
  await writeFile(rebuiltPayload, result.payload);
  const rebuiltList = await openBuddhaPack({ headerPath: rebuiltHeader, payloadPath: rebuiltPayload });
  headerOutsideReplacementFieldsEqual(originalHeader, result.header, [originalList.entries[1]!]);
  assertUntouchedEntriesMatch(
    originalUntouched,
    collectUntouchedEntries(rebuiltList, result.header, result.payload, new Set([1])),
  );
  const extracted = await extractBuddhaEntry(rebuiltList, "stringtable/menu");
  expect(sha256Bytes(extracted.bytes)).toBe(sha256Bytes(grown));
  expect(rebuiltList.entries[1]?.typeName).toBe("StringTable");
  expect(rebuiltList.entries[1]?.compression).toBe("zlib");
});

test("oversized replacement appends after the original payload and keeps earlier bytes", async () => {
  const keep = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const small = new Uint8Array([9, 10]);
  const pack = buildV5Pack(
    [{ name: "Blob" }],
    [
      { name: "keep", typeIndex: 0, bytes: keep, compress: false },
      { name: "replace", typeIndex: 0, bytes: small, compress: false },
    ],
  );
  const files = await writePack("append", pack);
  const huge = new Uint8Array(4096);
  huge.fill(11);
  const result = await replaceBuddhaEntries({
    headerPath: files.header,
    payloadPath: files.payload,
    replacements: [{ identifier: "replace", bytes: huge }],
  });
  expect(result.replacements[0]?.placement).toBe("append");
  expect(result.payload.subarray(0, pack.payload.length)).toEqual(pack.payload);
  const rebuiltHeader = path.join(path.dirname(files.header), "Append.~h");
  const rebuiltPayload = path.join(path.dirname(files.header), "Append.~p");
  await writeFile(rebuiltHeader, result.header);
  await writeFile(rebuiltPayload, result.payload);
  const list = await openBuddhaPack({ headerPath: rebuiltHeader, payloadPath: rebuiltPayload });
  const extracted = await extractBuddhaEntry(list, "replace");
  expect(extracted.bytes).toEqual(huge);
  const keepExtracted = await extractBuddhaEntry(list, "keep");
  expect(keepExtracted.bytes).toEqual(keep);
});

test("last-entry growth cannot write into footer padding beyond the physical payload", async () => {
  const pack = buildV5Pack(
    [{ name: "Blob" }],
    [{ name: "last", typeIndex: 0, bytes: new Uint8Array([1, 2]), compress: false }],
  );
  writeU64Be(pack.header, 48, pack.payload.length + 256);
  const files = await writePack("footer-padding", pack);
  const replacement = new Uint8Array(pack.payload.length + 16).fill(7);
  const result = await replaceBuddhaEntries({ headerPath: files.header, payloadPath: files.payload,
    replacements: [{ identifier: "last", bytes: replacement }] });
  expect(result.replacements[0]?.placement).toBe("append");
  await writeFile(files.header, result.header);
  await writeFile(files.payload, result.payload);
  const list = await openBuddhaPack({ headerPath: files.header, payloadPath: files.payload });
  expect((await extractBuddhaEntry(list, "last")).bytes).toEqual(replacement);
});

test("rejects a missing entry and a stored-size overflow", async () => {
  const pack = buildV5Pack(
    [{ name: "Blob" }],
    [{ name: "only", typeIndex: 0, bytes: new Uint8Array([1]), compress: false }],
  );
  const files = await writePack("reject", pack);
  await expect(
    replaceBuddhaEntries({
      headerPath: files.header,
      payloadPath: files.payload,
      replacements: [{ identifier: "missing", bytes: new Uint8Array([1]) }],
    }),
  ).rejects.toBeInstanceOf(PatchError);
});
