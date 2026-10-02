import { expect, test } from "bun:test";
import { ARABIC_BEH, applyForceSubstitutions, PERSIAN_PE } from "./force-substitutions.ts";
import { ARABIC_GHAIN, PERSIAN_GAF } from "./persian-gaf.ts";

test("Force fallbacks replace only the missing letters and record each hit", () => {
  const hits: { id: string; key: string; from: string; to: string; count: number }[] = [];
  const text = applyForceSubstitutions(
    "mix",
    `Brütal أورما${PERSIAN_GAF}ودن وا${PERSIAN_PE} Mötley Café ORMAGÖDEN`,
    hits,
  );
  expect(text).toBe(`Brutal أورما${ARABIC_GHAIN}ودن وا${ARABIC_BEH} Motley Cafe ORMAGODEN`);
  expect(hits.map((row) => [row.key, row.count])).toEqual([
    ["persian-gaf", 1],
    ["persian-pe", 1],
    ["u-diaeresis", 1],
    ["o-diaeresis", 1],
    ["O-diaeresis", 1],
    ["e-acute", 1],
  ]);
  expect(applyForceSubstitutions("plain", "سلام", [])).toBe("سلام");
});
