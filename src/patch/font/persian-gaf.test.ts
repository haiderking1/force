import { expect, test } from "bun:test";
import { ARABIC_GHAIN, PERSIAN_GAF, recordGafSubstitution, replacePersianGaf } from "./persian-gaf.ts";

test("replacePersianGaf swaps only U+06AF and counts each hit", () => {
  expect(replacePersianGaf("سلام")).toEqual({ text: "سلام", count: 0 });
  expect(replacePersianGaf(`أورما${PERSIAN_GAF}ودن`)).toEqual({ text: `أورما${ARABIC_GHAIN}ودن`, count: 1 });
  expect(replacePersianGaf(`${PERSIAN_GAF}${PERSIAN_GAF}`)).toEqual({ text: `${ARABIC_GHAIN}${ARABIC_GHAIN}`, count: 2 });
});

test("recordGafSubstitution appends only when a substitution happened", () => {
  const rows: { id: string; count: number }[] = [];
  expect(recordGafSubstitution("keep", "غين", rows)).toBe("غين");
  expect(rows).toEqual([]);
  expect(recordGafSubstitution("orm", `أورما${PERSIAN_GAF}ودن`, rows)).toBe(`أورما${ARABIC_GHAIN}ودن`);
  expect(rows).toEqual([{ id: "orm", count: 1 }]);
});
