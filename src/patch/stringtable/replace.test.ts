import { expect, test } from "bun:test";
import { decodeStringTable } from "../../resources/stringtable/decode.ts";
import { PatchError } from "../errors.ts";
import { encodeBuddhaQuoted } from "./escape.ts";
import { locateStringTableTextSpans, replaceStringTableTexts } from "./replace.ts";

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

function resourceWithNul(body: string): Uint8Array {
  const encoded = new TextEncoder().encode(body);
  const bytes = new Uint8Array(5 + encoded.length);
  const size = encoded.length + 1;
  bytes[0] = size & 0xff;
  bytes[1] = (size >> 8) & 0xff;
  bytes.set(encoded, 4);
  bytes[4 + encoded.length] = 0;
  return bytes;
}

const SAMPLE =
  '1StringTable{LineCodeData={MENU001TEXT=LineCodeData{Text="Continue";VolumeDB=0;SoundCue=;};MENU002TEXT=LineCodeData{Text=General;VolumeDB=0;SoundCue=;};MENU003TEXT=LineCodeData{Text="say \\"hi\\"\\nand";VolumeDB=0;SoundCue=;};};}';

test("replaces one quoted field and leaves every other byte of the other records alone", () => {
  const original = resource(SAMPLE);
  const result = replaceStringTableTexts(original, [{ lineCode: "MENU001TEXT", text: "متابعة" }]);
  const decoded = decodeStringTable(result.bytes);
  expect(decoded.records.map((record) => [record.lineCode, record.text])).toEqual([
    ["MENU001TEXT", "متابعة"],
    ["MENU002TEXT", "General"],
    ["MENU003TEXT", 'say \\"hi\\"\\nand'],
  ]);
  const prefix = new DataView(result.bytes.buffer).getUint32(0, true);
  expect(prefix).toBe(result.bytes.length - 4);
  expect(result.replaced).toEqual([
    expect.objectContaining({
      lineCode: "MENU001TEXT",
      original: "Continue",
      text: "متابعة",
    }),
  ]);
});

test("quotes a previously unquoted value when the replacement is non-ASCII", () => {
  const original = resource(SAMPLE);
  const result = replaceStringTableTexts(original, [{ lineCode: "MENU002TEXT", text: "عام" }]);
  const decoded = decodeStringTable(result.bytes);
  expect(decoded.records[1]?.text).toBe("عام");
  const spans = locateStringTableTextSpans(result.bytes);
  expect(spans[1]?.quoted).toBe(true);
});

test("round-trips backslash and quote escapes exactly as the decoder stores them", () => {
  const original = resource(SAMPLE);
  const next = 'a \\"q\\" and \\\\ path';
  const result = replaceStringTableTexts(original, [{ lineCode: "MENU003TEXT", text: next }]);
  expect(decodeStringTable(result.bytes).records[2]?.text).toBe(next);
  expect(new TextDecoder().decode(encodeBuddhaQuoted(next))).toBe('"a \\"q\\" and \\\\ path"');
});

test("replaces several ids from the end so earlier offsets stay valid", () => {
  const original = resource(SAMPLE);
  const result = replaceStringTableTexts(original, [
    { lineCode: "MENU001TEXT", text: "A" },
    { lineCode: "MENU003TEXT", text: "C-long-replacement" },
    { lineCode: "MENU002TEXT", text: "B" },
  ]);
  expect(decodeStringTable(result.bytes).records.map((record) => record.text)).toEqual([
    "A",
    "B",
    "C-long-replacement",
  ]);
});

test("keeps a trailing NUL and updates the size prefix to include it", () => {
  const original = resourceWithNul(
    '1StringTable{LineCodeData={MENU001TEXT=LineCodeData{Text="Hi";VolumeDB=0;SoundCue=;};};}',
  );
  const result = replaceStringTableTexts(original, [{ lineCode: "MENU001TEXT", text: "مرحبا" }]);
  expect(result.bytes[result.bytes.length - 1]).toBe(0);
  expect(new DataView(result.bytes.buffer).getUint32(0, true)).toBe(result.bytes.length - 4);
  expect(decodeStringTable(result.bytes).records[0]?.text).toBe("مرحبا");
});

test("empty replacement becomes quoted empty text", () => {
  const original = resource(SAMPLE);
  const result = replaceStringTableTexts(original, [{ lineCode: "MENU001TEXT", text: "" }]);
  expect(decodeStringTable(result.bytes).records[0]?.text).toBe("");
});

test("rejects a missing id, a duplicate id, and a mutated sibling", () => {
  const original = resource(SAMPLE);
  expect(() => replaceStringTableTexts(original, [{ lineCode: "NOPE001TEXT", text: "x" }])).toThrow(PatchError);
  expect(() =>
    replaceStringTableTexts(original, [
      { lineCode: "MENU001TEXT", text: "a" },
      { lineCode: "MENU001TEXT", text: "b" },
    ]),
  ).toThrow(/Duplicate replacement/);
});

test("identity replacement of every record yields the same decoded texts", () => {
  const original = resource(SAMPLE);
  const decoded = decodeStringTable(original);
  const result = replaceStringTableTexts(
    original,
    decoded.records.map((record) => ({ lineCode: record.lineCode, text: record.text })),
  );
  expect(decodeStringTable(result.bytes).records.map((record) => record.text)).toEqual(
    decoded.records.map((record) => record.text),
  );
});
