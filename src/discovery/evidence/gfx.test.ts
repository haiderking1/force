import { expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { extractGfx } from "./gfx.ts";

function u32le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

test("parses uncompressed GFX header and file-space string offsets", () => {
  const body = Buffer.from("\0\0\0\0\0\0MenuOK");
  const bytes = Uint8Array.from([0x47, 0x46, 0x58, 0x08, ...u32le(8 + body.length), ...body]);
  const extracted = extractGfx(bytes);
  expect(extracted?.metadata.signature).toBe("GFX");
  expect(extracted?.metadata.compression).toBe("none");
  expect(extracted?.metadata.parseStatus).toBe("header");
  const hit = extracted?.samples.find((sample) => sample.text === "MenuOK");
  expect(hit?.offsetSpace).toBe("file");
  expect(hit?.offset).toBe(8 + 6);
});

test("inflates CFX zlib and keeps decompressed offsets", () => {
  const body = Buffer.from("\0\0\0\0\0\0Pause");
  const compressed = deflateSync(body);
  const bytes = Uint8Array.from([0x43, 0x46, 0x58, 0x08, ...u32le(8 + compressed.length), ...compressed]);
  const extracted = extractGfx(bytes);
  expect(extracted?.metadata.signature).toBe("CFX");
  expect(extracted?.metadata.parseStatus).toBe("decompressed-sample");
  const hit = extracted?.samples.find((sample) => sample.text === "Pause");
  expect(hit?.offsetSpace).toBe("decompressed");
  expect(hit?.offset).toBe(6);
});

test("marks truncated and LZMA GFX as unsupported or missing", () => {
  expect(extractGfx(Uint8Array.from([0x43, 0x46, 0x58]))).toBeUndefined();
  const lzma = extractGfx(Uint8Array.from([0x5a, 0x57, 0x53, 0x08, 0x10, 0x00, 0x00, 0x00]));
  expect(lzma?.metadata.parseStatus).toBe("unsupported");
  const bad = Uint8Array.from([0x43, 0x46, 0x58, 0x08, 0x20, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03]);
  expect(extractGfx(bad)?.metadata.parseStatus).toBe("opaque");
});
