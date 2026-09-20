import { expect, test } from "bun:test";
import { extractStringRuns, extractUtf16LeRuns, extractUtf8AndAsciiRuns } from "./strings.ts";

test("records UTF-8 byte offsets including multibyte characters", () => {
  const bytes = Uint8Array.from([0x00, 0x00, 0x63, 0x61, 0x66, 0xc3, 0xa9, 0x20, 0x42, 0x61, 0x72]);
  const runs = extractUtf8AndAsciiRuns(bytes, "binary", "file");
  const cafe = runs.find((run) => run.text.startsWith("café"));
  expect(cafe?.offset).toBe(2);
  expect(cafe?.encoding).toBe("utf-8");
  expect(cafe?.byteLength).toBe(9);
});

test("records UTF-16LE offsets on even alignment", () => {
  const hello = Buffer.from("Hello", "utf16le");
  const bytes = Uint8Array.from([0xff, 0xff, 0xff, 0xff, ...hello]);
  const runs = extractUtf16LeRuns(bytes, "file");
  const hit = runs.find((run) => run.text === "Hello");
  expect(hit?.offset).toBe(4);
  expect(hit?.encoding).toBe("utf-16le");
  expect(hit?.byteLength).toBe(10);
});

test("does not read paired ASCII as UTF-16LE", () => {
  const ascii = Buffer.from("AbandonDialog");
  const runs = extractUtf16LeRuns(ascii, "decompressed");
  expect(runs).toEqual([]);
});

test("drops short binary noise that is not a letter run", () => {
  const noise = Uint8Array.from({ length: 256 }, (_, index) => ((index * 19) & 0x7f) | 0x80);
  noise.set([0x41, 0x42, 0x00, 0x43], 10);
  const runs = extractStringRuns(noise, "binary", "file");
  expect(runs.some((run) => run.text.includes("AB") || run.text.includes("C"))).toBe(false);
});
