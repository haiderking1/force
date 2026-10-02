import { afterEach, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createTempDirTracker } from "../../testing/temp-dir.ts";
import { ArchiveError } from "../errors.ts";
import { safeEntryRelativePath } from "../path-safety.ts";
import { writeMsbBits } from "./bits.ts";
import { buildV5Pack } from "./build-v5-pack.ts";
import { extractBuddhaEntry } from "./extract.ts";
import { parseBuddhaHeader } from "./header.ts";
import { BUDDHA_MAX_UNCOMPRESSED } from "./limits.ts";
import { openBuddhaPack } from "./open.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

async function writePack(label: string, pack: ReturnType<typeof buildV5Pack>): Promise<{ header: string; payload: string }> {
  const dir = await tempDirs.create(`force-pack-${label}-`);
  const header = path.join(dir, "Sample.~h");
  const payload = path.join(dir, "Sample.~p");
  await writeFile(header, pack.header);
  await writeFile(payload, pack.payload);
  return { header, payload };
}

test("lists and extracts a zlib entry against the rebuilt payload", async () => {
  const plain = new TextEncoder().encode("hello from fixture");
  const pack = buildV5Pack(
    [{ name: "Blob" }],
    [
      { name: "data/plain.txt", typeIndex: 0, bytes: plain, compress: false },
      { name: "data/zlib.txt", typeIndex: 0, bytes: plain, compress: true },
    ],
  );
  const files = await writePack("roundtrip", pack);
  const list = await openBuddhaPack({ headerPath: files.header, payloadPath: files.payload });
  expect(list.format).toBe("buddha-dfpf-v5");
  expect(list.entries).toHaveLength(2);
  expect(list.entries[0]?.compression).toBe("none");
  expect(list.entries[1]?.compression).toBe("zlib");
  expect(list.entries[0]?.rangeError).toBeUndefined();
  const extracted = await extractBuddhaEntry(list, "data/zlib.txt");
  expect(new TextDecoder().decode(extracted.bytes)).toBe("hello from fixture");
  expect(extracted.decompressed).toBe(true);
});

test("decodes zlib entries whose size is split into content and extra content", async () => {
  const body = new TextEncoder().encode("mesh header|vertex data that lives in the extra part");
  const pack = buildV5Pack(
    [{ name: "Mesh" }],
    [{ name: "characters/split.mesh", typeIndex: 0, bytes: body, compress: true, extraContentSize: 41 }],
  );
  const files = await writePack("split", pack);
  const list = await openBuddhaPack({ headerPath: files.header, payloadPath: files.payload });
  const entry = list.entries[0];
  expect(entry?.primaryContentSize).toBe(body.length - 41);
  expect(entry?.extraContentSize).toBe(41);
  expect(entry?.contentSize).toBe(body.length);
  const extracted = await extractBuddhaEntry(list, "characters/split.mesh");
  expect(extracted.bytes).toEqual(body);
});

test("decodes split-size entries above 16 MiB up to the largest representable size", async () => {
  expect(BUDDHA_MAX_UNCOMPRESSED).toBe(17_039_358);
  for (const [label, total, extra] of [
    ["just-over-16mib", 16 * 1024 * 1024 + 1, 2],
    ["maximum", BUDDHA_MAX_UNCOMPRESSED, 2 ** 18 - 1],
  ] as const) {
    const body = new Uint8Array(total);
    body[0] = 1;
    body[total - 1] = 2;
    const pack = buildV5Pack([{ name: "Mesh" }], [{ name: label, typeIndex: 0, bytes: body, compress: true, extraContentSize: extra }]);
    const files = await writePack(label, pack);
    const list = await openBuddhaPack({ headerPath: files.header, payloadPath: files.payload });
    expect(list.entries[0]?.contentSize).toBe(total);
    const extracted = await extractBuddhaEntry(list, label);
    expect(extracted.bytes.length).toBe(total);
    expect(extracted.bytes[total - 1]).toBe(2);
  }
});

test("rejects truncated headers, bad magic, and unsupported versions", async () => {
  const dir = await tempDirs.create("force-pack-bad-");
  const shortPath = path.join(dir, "short.~h");
  await writeFile(shortPath, "dfpf");
  await expect(openBuddhaPack({ headerPath: shortPath })).rejects.toBeInstanceOf(ArchiveError);

  const magicPath = path.join(dir, "magic.~h");
  const pack = buildV5Pack([{ name: "Blob" }], [{ name: "a", typeIndex: 0, bytes: new Uint8Array([1]), compress: false }]);
  pack.header.set(new TextEncoder().encode("XXXX"), 0);
  await writeFile(magicPath, pack.header);
  await expect(openBuddhaPack({ headerPath: magicPath })).rejects.toThrow(/magic/);

  pack.header.set(new TextEncoder().encode("dfpf"), 0);
  pack.header[4] = 2;
  const versionPath = path.join(dir, "ver.~h");
  await writeFile(versionPath, pack.header);
  await expect(openBuddhaPack({ headerPath: versionPath })).rejects.toThrow(/Unsupported Buddha pack version/);
});

test("marks out-of-range records and overlapping payload ranges", async () => {
  const pack = buildV5Pack(
    [{ name: "Blob" }],
    [
      { name: "first", typeIndex: 0, bytes: new Uint8Array([1, 2, 3, 4]), compress: false },
      { name: "second", typeIndex: 0, bytes: new Uint8Array([5, 6, 7, 8]), compress: false },
    ],
  );
  const files = await writePack("range", pack);
  const tinyPayload = path.join(path.dirname(files.header), "tiny.~p");
  await writeFile(tinyPayload, new Uint8Array([1, 2]));
  const shortList = await openBuddhaPack({ headerPath: files.header, payloadPath: tinyPayload });
  expect(shortList.entries.some((entry) => entry.rangeError !== undefined)).toBe(true);

  const header = parseBuddhaHeader(pack.header);
  const firstRecord = pack.header.subarray(header.fileIndexOffset, header.fileIndexOffset + 16);
  writeMsbBits(firstRecord, 12, 11, 5, 23);
  const overlapHeader = path.join(path.dirname(files.header), "overlap.~h");
  await writeFile(overlapHeader, pack.header);
  const overlapList = await openBuddhaPack({ headerPath: overlapHeader, payloadPath: files.payload });
  expect(overlapList.overlaps.length).toBeGreaterThan(0);
});

test("refuses extract paths that leave the output directory", () => {
  expect(() => safeEntryRelativePath("../secret")).toThrow(ArchiveError);
  expect(() => safeEntryRelativePath("/abs/path")).toThrow(ArchiveError);
  expect(safeEntryRelativePath("ok/name")).toBe("ok/name");
});

test("extract refuses an out-of-range entry", async () => {
  const pack = buildV5Pack(
    [{ name: "Blob" }],
    [{ name: "too-big", typeIndex: 0, bytes: new Uint8Array([1, 2, 3, 4]), compress: false }],
  );
  const files = await writePack("oor", pack);
  const tinyPayload = path.join(path.dirname(files.header), "tiny.~p");
  await writeFile(tinyPayload, new Uint8Array([1]));
  const list = await openBuddhaPack({ headerPath: files.header, payloadPath: tinyPayload });
  await expect(extractBuddhaEntry(list, "too-big")).rejects.toThrow(/exceeds payload size/);
});
