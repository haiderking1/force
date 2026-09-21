import { describe, expect, it } from "bun:test";
import {
  findBreakOpportunities,
  isMandatoryBreak,
  isNonBreakingGlue,
  isZeroWidthBreak,
  splitIntoBreakTokens,
} from "./line-break.ts";

describe("Unicode Line Breaking", () => {
  it("identifies non-breaking glue characters", () => {
    expect(isNonBreakingGlue(0x00a0)).toBe(true); // NO-BREAK SPACE
    expect(isNonBreakingGlue(0x202f)).toBe(true); // NARROW NO-BREAK SPACE
    expect(isNonBreakingGlue(0x2060)).toBe(true); // WORD JOINER
    expect(isNonBreakingGlue(0xfeff)).toBe(true); // ZWNBSP
    expect(isNonBreakingGlue(0x0020)).toBe(false); // REGULAR SPACE
  });

  it("identifies zero-width break and mandatory breaks", () => {
    expect(isZeroWidthBreak(0x200b)).toBe(true);
    expect(isZeroWidthBreak(0x0020)).toBe(false);

    expect(isMandatoryBreak(0x000a)).toBe(true); // LF
    expect(isMandatoryBreak(0x000d)).toBe(true); // CR
    expect(isMandatoryBreak(0x2028)).toBe(true); // LINE SEPARATOR
  });

  it("finds break opportunities after regular spaces and zero-width spaces", () => {
    const opportunities = findBreakOpportunities("hello world");
    expect(opportunities).toEqual([6]); // after space
  });

  it("prohibits break across non-breaking glue", () => {
    const text = "10\u00a0kg"; // 10 NBSP kg
    const tokens = splitIntoBreakTokens(text);
    expect(tokens).toEqual(["10\u00a0kg"]);
  });
});
