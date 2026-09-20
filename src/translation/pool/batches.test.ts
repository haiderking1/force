import { expect, test } from "bun:test";
import { numberedItems } from "../http/fixtures/completions.ts";
import { splitIntoBatches } from "./batches.ts";

test("splits items into stable batches without dropping ids", () => {
  const items = numberedItems(5);
  const pairs = splitIntoBatches(items, 2);
  expect(pairs.map((batch) => batch.map((item) => item.id))).toEqual([
    ["id-0", "id-1"],
    ["id-2", "id-3"],
    ["id-4"],
  ]);
  expect(splitIntoBatches(items, 50).map((batch) => batch.map((item) => item.id))).toEqual([
    ["id-0", "id-1", "id-2", "id-3", "id-4"],
  ]);
});
