import { expect, test } from "bun:test";
import { encodeSwfMatrix, parseSwfMatrix, translateMatrix } from "./matrix.ts";

test("MATRIX encode parses back and translate only changes translation", () => {
  const encoded = encodeSwfMatrix({
    hasScale: false,
    scaleX: 65536,
    scaleY: 65536,
    hasRotate: false,
    rotate0: 0,
    rotate1: 0,
    translateX: 12801,
    translateY: 11200,
  });
  const parsed = parseSwfMatrix(encoded, 0);
  expect(parsed.translateX).toBe(12801);
  expect(parsed.translateY).toBe(11200);
  expect(parsed.hasScale).toBe(false);
  expect(parsed.hasRotate).toBe(false);
  const moved = parseSwfMatrix(translateMatrix(parsed, 0, 720), 0);
  expect(moved.translateX).toBe(12801);
  expect(moved.translateY).toBe(11920);
  expect(moved.hasScale).toBe(false);
});
