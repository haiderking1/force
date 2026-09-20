import { expect, test } from "bun:test";
import { TranslationError } from "./errors.ts";
import { assertPlaceholderSpecs, countOccurrences, missingPlaceholders } from "./placeholders.ts";

test("counts non-overlapping placeholder occurrences", () => {
  expect(countOccurrences("Hi {name} and {name}", "{name}")).toBe(2);
  expect(countOccurrences("Score: %s", "%s")).toBe(1);
  expect(countOccurrences("nothing", "{name}")).toBe(0);
});

test("reports placeholders whose count changed", () => {
  expect(missingPlaceholders("Hello {name}", "مرحبا {name}", ["{name}"])).toEqual([]);
  expect(missingPlaceholders("Hello {name}", "مرحبا", ["{name}"])).toEqual(["{name}"]);
  expect(missingPlaceholders("{name} {name}", "{name}", ["{name}"])).toEqual(["{name}"]);
  expect(missingPlaceholders("plain", "plain", ["{name}"])).toEqual([]);
});

test("rejects empty or duplicate placeholder specs", () => {
  expect(() => assertPlaceholderSpecs([" "])).toThrow(TranslationError);
  expect(() => assertPlaceholderSpecs(["{name}", "{name}"])).toThrow(/Duplicate placeholder token/);
});
