import { describe, expect, it } from "bun:test";
import { lineBreakLength, lineBreakLengthInString } from "./newlines.ts";

describe("line break sequences", () => {
  it("treats CRLF as a single two-unit break", () => {
    expect(lineBreakLength([0x41, 0x000d, 0x000a, 0x42], 1)).toBe(2);
    expect(lineBreakLengthInString("A\r\nB", 1, 0x000d)).toBe(2);
  });

  it("treats a bare CR or LF as a one-unit break", () => {
    expect(lineBreakLength([0x41, 0x000d, 0x42], 1)).toBe(1);
    expect(lineBreakLength([0x41, 0x000a, 0x42], 1)).toBe(1);
    expect(lineBreakLengthInString("A\rB", 1, 0x000d)).toBe(1);
    expect(lineBreakLengthInString("A\nB", 1, 0x000a)).toBe(1);
  });

  it("leaves ordinary characters unconsumed", () => {
    expect(lineBreakLength([0x41, 0x42], 0)).toBe(0);
    expect(lineBreakLengthInString("AB", 0, 0x41)).toBe(0);
  });
});
