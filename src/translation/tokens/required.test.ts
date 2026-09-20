import { expect, test } from "bun:test";
import { requiredTokenCountsForText } from "./required.ts";

test("counts detected tokens that appear more than once", () => {
  expect(requiredTokenCountsForText("Oh /bleep/word/bleep/.", [])).toEqual([
    { token: "/bleep/", count: 2 },
  ]);
  expect(requiredTokenCountsForText("%i of %i pieces", [])).toEqual([{ token: "%i", count: 2 }]);
});

test("includes explicit placeholder specs that the detector does not emit", () => {
  expect(requiredTokenCountsForText("Score: FOO", ["FOO"])).toEqual([{ token: "FOO", count: 1 }]);
  expect(requiredTokenCountsForText("plain", ["FOO"])).toEqual([]);
});

test("omits corpus placeholders that are not in this source", () => {
  const corpus = ["{name}", "{0}", "%s", "/Activate/", "/bleep/"];
  expect(requiredTokenCountsForText("Hello {name}", corpus)).toEqual([{ token: "{name}", count: 1 }]);
  expect(requiredTokenCountsForText("Press /Activate/", corpus)).toEqual([
    { token: "/Activate/", count: 1 },
  ]);
});

test("counts literal backslash tokens, not actual control characters", () => {
  const source = "ROLE\\r\\nRanged.\\tHe said \\\"go\\\"";
  expect(source.includes("\n")).toBe(false);
  expect(source.includes("\r")).toBe(false);
  expect(source.includes("\t")).toBe(false);
  expect(requiredTokenCountsForText(source, ["\\n", "\\r", "\\t", '\\"'])).toEqual([
    { token: '\\"', count: 2 },
    { token: "\\n", count: 1 },
    { token: "\\r", count: 1 },
    { token: "\\t", count: 1 },
  ]);
  expect(requiredTokenCountsForText("first\nsecond", ["\\n"])).toEqual([]);
});
