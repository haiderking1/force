import { describe, expect, it } from "bun:test";
import { decodeUtf8, encodeUtf8, unicodeWhitespace, splitWhitespace } from "./utf8.ts";
import { RenderingError } from "../errors.ts";

describe("Unicode UTF-8", () => {
  it("decodes and encodes ASCII strings", () => {
    const text = "Hello, world!";
    const codepoints = decodeUtf8(text);
    expect(codepoints).toEqual([72, 101, 108, 108, 111, 44, 32, 119, 111, 114, 108, 100, 33]);
    expect(encodeUtf8(codepoints)).toBe(text);
  });

  it("decodes and encodes Arabic strings", () => {
    const text = "مرحبا بالعالم";
    const codepoints = decodeUtf8(text);
    expect(codepoints).toEqual([
      0x0645, 0x0631, 0x062d, 0x0628, 0x0627, 0x0020, 0x0628, 0x0627, 0x0644, 0x0639, 0x0627,
      0x0644, 0x0645,
    ]);
    expect(encodeUtf8(codepoints)).toBe(text);
  });

  it("decodes and encodes supplementary plane characters (surrogate pairs in UTF-16)", () => {
    const text = "🎮✨";
    const codepoints = decodeUtf8(text);
    expect(codepoints).toEqual([0x1f3ae, 0x2728]);
    expect(encodeUtf8(codepoints)).toBe(text);
  });

  it("decodes raw UTF-8 byte arrays", () => {
    const bytes = new Uint8Array([0xd8, 0xa7, 0xd9, 0x84, 0xd8, 0xa5, 0xd8, 0xb5, 0xd8, 0xaf, 0xd8, 0xa7, 0xd8, 0xb1]);
    const codepoints = decodeUtf8(bytes);
    expect(encodeUtf8(codepoints)).toBe("الإصدار");
  });

  it("rejects invalid UTF-8 bytes and surrogates", () => {
    // Truncated multi-byte sequence
    expect(() => decodeUtf8(new Uint8Array([0xd8]))).toThrow(RenderingError);
    // Invalid continuation byte
    expect(() => decodeUtf8(new Uint8Array([0xd8, 0x00]))).toThrow(RenderingError);
    // Invalid lead byte
    expect(() => decodeUtf8(new Uint8Array([0xff]))).toThrow(RenderingError);
  });

  it("identifies Unicode whitespace and splits text", () => {
    expect(unicodeWhitespace(0x0020)).toBe(true);
    expect(unicodeWhitespace(0x00a0)).toBe(true);
    expect(unicodeWhitespace(0x2003)).toBe(true);
    expect(unicodeWhitespace(0x0645)).toBe(false);

    const tokens = splitWhitespace("  مرحبا   بالعالم\t\nجديد  ");
    expect(tokens).toEqual(["مرحبا", "بالعالم", "جديد"]);
  });
});
