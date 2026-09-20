import { expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { brutalLegendAdapter } from "../games/brutal-legend/adapter.ts";
import { walkGameTree } from "./walk.ts";

test("records symlink escapes and does not follow them", async () => {
  const root = path.join(tmpdir(), `force-walk-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const outside = path.join(tmpdir(), `force-escape-${Date.now()}`);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "Language.cfg"), "language = 'enUS'\n");
  await writeFile(outside, "secret\n");
  await symlink(outside, path.join(root, "escape.cfg"));
  const walked = await walkGameTree(root, brutalLegendAdapter);
  expect(walked.files.map((file) => file.record.relativePath)).toEqual(["Language.cfg"]);
  expect(walked.exclusions.some((item) => item.reason === "symlink-escape" && item.relativePath === "escape.cfg")).toBe(true);
});

test("follows a symlink that stays inside the game root", async () => {
  const root = path.join(tmpdir(), `force-walk-in-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(path.join(root, "Data"), { recursive: true });
  await writeFile(path.join(root, "Data", "Language.cfg"), "language = 'enUS'\n");
  await symlink(path.join(root, "Data", "Language.cfg"), path.join(root, "alias.cfg"));
  const walked = await walkGameTree(root, brutalLegendAdapter);
  expect(walked.files.some((file) => file.record.relativePath === "alias.cfg")).toBe(true);
  expect(walked.exclusions.some((item) => item.reason === "symlink-escape")).toBe(false);
});
