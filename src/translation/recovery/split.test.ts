import { expect, test } from "bun:test";
import { splitItems } from "./split.ts";

test("splits even and odd batches without dropping items", () => {
  expect(splitItems(["a", "b", "c", "d"])).toEqual([["a", "b"], ["c", "d"]]);
  expect(splitItems(["a", "b", "c"])).toEqual([["a"], ["b", "c"]]);
  expect(splitItems(["a", "b"])).toEqual([["a"], ["b"]]);
});

test("refuses to split a singleton", () => {
  expect(() => splitItems(["a"])).toThrow(/at least two items/);
  expect(() => splitItems([])).toThrow(/at least two items/);
});
