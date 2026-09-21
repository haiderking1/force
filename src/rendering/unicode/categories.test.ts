import { describe, expect, it } from "bun:test";
import {
  getJoiningType,
  isCursiveJoining,
  isWordPart,
  isCombiningMark,
  validateCharacter,
  validateWords,
} from "./categories.ts";
import { UnsupportedCharacterError, RenderingError } from "../errors.ts";
import type { Line } from "../types.ts";

describe("Unicode Categories and Cursive Joining", () => {
  it("classifies Arabic cursive joining types accurately", () => {
    // Right-joining: Alef (0627), Waw with Hamza (0624), Teh Marbuta (0629), Dal (062f), Thal (0630), Reh (0631), Zain (0632), Waw (0648)
    expect(getJoiningType(0x0627)).toBe("R");
    expect(getJoiningType(0x0624)).toBe("R");
    expect(getJoiningType(0x0629)).toBe("R");
    expect(getJoiningType(0x062f)).toBe("R");
    expect(getJoiningType(0x0631)).toBe("R");
    expect(getJoiningType(0x0648)).toBe("R");

    // Dual-joining: Beh (0628), Seen (0633), Meem (0645), Noon (0646), Yeh (064a)
    expect(getJoiningType(0x0628)).toBe("D");
    expect(getJoiningType(0x0633)).toBe("D");
    expect(getJoiningType(0x0645)).toBe("D");
    expect(getJoiningType(0x0646)).toBe("D");
    expect(getJoiningType(0x064a)).toBe("D");

    // Join-causing: ZWJ (200D), Tatweel (0640)
    expect(getJoiningType(0x200d)).toBe("C");
    expect(getJoiningType(0x0640)).toBe("C");

    // Non-joining: ZWNJ (200C), Latin letters
    expect(getJoiningType(0x200c)).toBe("U");
    expect(getJoiningType(0x0041)).toBe("U");

    // Transparent: Arabic Fatha (064e), Damma (064f), Kasra (0650), Shadda (0651), Sukun (0652)
    expect(getJoiningType(0x064e)).toBe("T");
    expect(getJoiningType(0x064f)).toBe("T");
    expect(getJoiningType(0x0650)).toBe("T");
    expect(getJoiningType(0x0651)).toBe("T");
    expect(getJoiningType(0x0652)).toBe("T");
  });

  it("checks cursive joining capability", () => {
    expect(isCursiveJoining(0x0627)).toBe(true); // R
    expect(isCursiveJoining(0x0628)).toBe(true); // D
    expect(isCursiveJoining(0x0640)).toBe(true); // C
    expect(isCursiveJoining(0x200c)).toBe(false); // U
    expect(isCursiveJoining(0x0041)).toBe(false); // U
  });

  it("validates allowed characters and rejects invisible/unsupported controls", () => {
    expect(() => validateCharacter(0x0020)).not.toThrow(); // space
    expect(() => validateCharacter(0x000a)).not.toThrow(); // newline
    expect(() => validateCharacter(0x0645)).not.toThrow(); // Arabic Meem

    // Variation selectors
    expect(() => validateCharacter(0xfe00)).toThrow(UnsupportedCharacterError);
    // CGJ (Combining Grapheme Joiner U+034F)
    expect(() => validateCharacter(0x034f)).toThrow(UnsupportedCharacterError);
    // Unassigned or control codes
    expect(() => validateCharacter(0x0000)).toThrow(UnsupportedCharacterError);
    expect(() => validateCharacter(0x001f)).toThrow(UnsupportedCharacterError);
  });

  it("rejects joining words across style boundaries", () => {
    // Word "مرحبا" with style change between Meem and Reh
    const line: Line = {
      chars: [
        { codepoint: 0x0645, styles: [1] },
        { codepoint: 0x0631, styles: [2] },
        { codepoint: 0x062d, styles: [2] },
        { codepoint: 0x0628, styles: [2] },
        { codepoint: 0x0627, styles: [2] },
      ],
      breakStyles: [],
      newline: false,
    };
    expect(() => validateWords(line)).toThrow(RenderingError);
  });

  it("rejects detached or separately styled combining marks", () => {
    // Fatha alone at start of word
    const line1: Line = {
      chars: [{ codepoint: 0x064e, styles: [1] }],
      breakStyles: [],
      newline: false,
    };
    expect(() => validateWords(line1)).toThrow(RenderingError);

    // Letter with separately styled Fatha
    const line2: Line = {
      chars: [
        { codepoint: 0x0628, styles: [1] },
        { codepoint: 0x064e, styles: [2] },
      ],
      breakStyles: [],
      newline: false,
    };
    expect(() => validateWords(line2)).toThrow(RenderingError);
  });
});
