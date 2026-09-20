import { expect, test } from "bun:test";
import { TranslationError } from "../errors.ts";
import { assertPoolLimits, DEFAULT_BATCH_SIZE, DEFAULT_WORKERS } from "./settings.ts";

test("default worker count is 100 and default batch size is 50", () => {
  expect(DEFAULT_WORKERS).toBe(100);
  expect(DEFAULT_BATCH_SIZE).toBe(50);
});

test("rejects worker and batch values outside the configured bounds", () => {
  expect(() => assertPoolLimits(0, 50)).toThrow(TranslationError);
  expect(() => assertPoolLimits(1001, 50)).toThrow(/Worker count must be between 1 and 1000/);
  expect(() => assertPoolLimits(100, 0)).toThrow(/Batch size must be between 1 and 200/);
  expect(() => assertPoolLimits(100, 201)).toThrow(/Batch size must be between 1 and 200/);
  expect(() => assertPoolLimits(100, 50)).not.toThrow();
});
