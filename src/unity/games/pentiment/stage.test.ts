import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stagePentimentText } from "./stage.ts";
import { PENTIMENT_ENGLISH } from "./extract.ts";
import { stringId } from "./string-tables.ts";
import { assertArtifactOutsideGame } from "../../paths.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "force-unity-")); roots.push(root);
  const game = path.join(root, "game"), corpus = path.join(root, "corpus"), translations = path.join(root, "translations.json"), out = path.join(root, "stage");
  await mkdir(path.dirname(path.join(game, PENTIMENT_ENGLISH)), { recursive: true }); await mkdir(corpus);
  const source = { StringTables: [{ Name: "gui", UObjectName: "gui", Entries: [{ ID: 1, DefaultText: "Hello {0}" }, { ID: 2, DefaultText: "" }] }], Hash: 123 };
  const bytes = JSON.stringify(source);
  await writeFile(path.join(game, PENTIMENT_ENGLISH), bytes); await writeFile(path.join(corpus, "source.stringtablebundle"), bytes);
  const rows = [{ id: stringId("gui", 1), sourceText: "Hello {0}", text: "مرحبًا {0}" }, { id: stringId("gui", 2), sourceText: "", text: "" }];
  await writeFile(translations, JSON.stringify({ translations: rows }));
  return { root, game, corpus, translations, out, source, rows, bytes };
}

test("stages a complete table with provenance and leaves the installation untouched", async () => {
  const f = await fixture(); await stagePentimentText(f.game, f.corpus, f.translations, f.out);
  const result = JSON.parse(await readFile(path.join(f.out, "files", PENTIMENT_ENGLISH), "utf8"));
  expect(result.StringTables[0].Entries[0].DefaultText).toBe("مرحبًا {0}");
  expect(result.Hash).toBe(f.source.Hash);
  expect(await readFile(path.join(f.game, PENTIMENT_ENGLISH), "utf8")).toBe(f.bytes);
  expect(JSON.parse(await readFile(path.join(f.out, "stage.json"), "utf8")).installReady).toBe(false);
});

test("rejects missing translations, missing placeholders, and changed source provenance", async () => {
  for (const mode of ["missing", "token", "source", "empty"] as const) {
    const f = await fixture();
    if (mode === "missing") f.rows.pop();
    else {
      const first = f.rows[0]; if (!first) throw new Error("Missing fixture row");
      if (mode === "token") first.text = "مرحبًا";
      if (mode === "source") first.sourceText = "tampered";
      if (mode === "empty") first.text = "";
    }
    await writeFile(f.translations, JSON.stringify({ translations: f.rows }));
    await expect(stagePentimentText(f.game, f.corpus, f.translations, f.out)).rejects.toThrow();
  }
});

test("rejects stale live tables and output paths inside the game including symlinks", async () => {
  const f = await fixture();
  await writeFile(path.join(f.game, PENTIMENT_ENGLISH), "changed");
  await expect(stagePentimentText(f.game, f.corpus, f.translations, f.out)).rejects.toThrow("changed");
  await expect(assertArtifactOutsideGame(f.game, path.join(f.game, "stage"))).rejects.toThrow("outside");
  const alias = path.join(f.root, "alias"); await symlink(f.game, alias, "dir");
  await expect(assertArtifactOutsideGame(f.game, path.join(alias, "stage"))).rejects.toThrow("outside");
});
