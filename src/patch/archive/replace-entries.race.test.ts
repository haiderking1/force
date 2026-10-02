import { afterEach, expect, mock, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createTempDirTracker } from "../../testing/temp-dir.ts";
import { buildV5Pack } from "../../archive/buddha/build-v5-pack.ts";
import * as readRange from "../../archive/read-range.ts";
import { PatchError } from "../errors.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

// replaceBuddhaEntries plans from range reads, then reads the whole payload again.
// A same-size change between those reads must not become the recorded original.
const realReadFileInto = readRange.readFileInto;
let beforeFinalRead: ((filePath: string) => Promise<void>) | undefined;

mock.module("../../archive/read-range.ts", () => ({
  ...readRange,
  readFileInto: async (filePath: string, target: Uint8Array) => {
    await beforeFinalRead?.(filePath);
    return realReadFileInto(filePath, target);
  },
}));

const { replaceBuddhaEntries } = await import("./replace-entries.ts");

test("rejects a same-size payload change between planning and the final read", async () => {
  const keep = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const original = new Uint8Array([9, 10, 11, 12]);
  const pack = buildV5Pack(
    [{ name: "Blob" }],
    [
      { name: "keep", typeIndex: 0, bytes: keep, compress: false },
      { name: "replace", typeIndex: 0, bytes: original, compress: false },
    ],
  );
  const dir = await tempDirs.create("force-patch-race-");
  const headerPath = path.join(dir, "Sample.~h");
  const payloadPath = path.join(dir, "Sample.~p");
  await writeFile(headerPath, pack.header);
  await writeFile(payloadPath, pack.payload);

  const mutated = pack.payload.slice();
  const at = mutated.lastIndexOf(9);
  expect(at).toBeGreaterThan(-1);
  mutated[at] = 99;
  beforeFinalRead = async (filePath) => {
    if (filePath === payloadPath) {
      await writeFile(payloadPath, mutated);
    }
  };
  try {
    const rebuild = replaceBuddhaEntries({
      headerPath,
      payloadPath,
      replacements: [{ identifier: "replace", bytes: new Uint8Array([7, 7]) }],
    });
    await expect(rebuild).rejects.toBeInstanceOf(PatchError);
    await expect(rebuild).rejects.toThrow("payload changed between planning and rebuild");
  } finally {
    beforeFinalRead = undefined;
  }
});
