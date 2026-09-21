import { expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { inspectGfxBytes } from "./inspect.ts";
import { decompressGfx, walkSwfTags } from "./swf.ts";

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function shortTag(type: number, data: number[]): number[] {
  return [...u16((type << 6) | data.length), ...data];
}

test("walks uncompressed GFX tags and finds starred line codes", () => {
  const rect = [0x00];
  const body = Uint8Array.from([
    ...rect,
    ...u16(0x0c00),
    ...u16(1),
    ...shortTag(12, [...new TextEncoder().encode("*PMTE028TEXT"), 0]),
    ...shortTag(0, []),
  ]);
  const bytes = Uint8Array.from([0x47, 0x46, 0x58, 0x08, ...u32(8 + body.length), ...body]);
  const report = inspectGfxBytes(bytes);
  expect(report.signature).toBe("GFX");
  expect(report.starredLineCodes).toEqual(["PMTE028TEXT"]);
  expect(report.lineCodes[0]?.tagName).toBe("DoAction");
});

test("inflates CFX before walking tags", () => {
  const rect = [0x00];
  const body = Uint8Array.from([...rect, ...u16(0x0c00), ...u16(1), ...shortTag(0, [])]);
  const compressed = deflateSync(Buffer.from(body));
  const bytes = Uint8Array.from([0x43, 0x46, 0x58, 0x08, ...u32(8 + body.length), ...compressed]);
  const gfx = decompressGfx(bytes);
  expect(gfx.signature).toBe("CFX");
  expect(walkSwfTags(gfx.body).tags.map((tag) => tag.type)).toEqual([0]);
});
