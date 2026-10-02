import { afterEach, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { brutalLegendAdapter } from "../../games/brutal-legend/discovery/adapter.ts";
import { walkGameTree } from "./walk.ts";
import { createTempDirTracker } from "../../testing/temp-dir.ts";

const tempDirs = createTempDirTracker();
afterEach(() => tempDirs.cleanup());

test("records symlink escapes and does not follow them", async () => {
  const root = await tempDirs.create("force-walk-");
  const outside = path.join(await tempDirs.create("force-escape-"), "secret.cfg");
  await writeFile(path.join(root, "Language.cfg"), "language = 'enUS'\n");
  await writeFile(outside, "secret\n");
  await symlink(outside, path.join(root, "escape.cfg"));
  const walked = await walkGameTree(root, brutalLegendAdapter);
  expect(walked.files.map((file) => file.record.relativePath)).toEqual(["Language.cfg"]);
  expect(walked.exclusions.some((item) => item.reason === "symlink-escape" && item.relativePath === "escape.cfg")).toBe(true);
});

test("follows a symlink that stays inside the game root", async () => {
  const root = await tempDirs.create("force-walk-in-");
  await mkdir(path.join(root, "Data"), { recursive: true });
  await writeFile(path.join(root, "Data", "Language.cfg"), "language = 'enUS'\n");
  await symlink(path.join(root, "Data", "Language.cfg"), path.join(root, "alias.cfg"));
  const walked = await walkGameTree(root, brutalLegendAdapter);
  expect(walked.files.some((file) => file.record.relativePath === "alias.cfg")).toBe(true);
  expect(walked.exclusions.some((item) => item.reason === "symlink-escape")).toBe(false);
});
