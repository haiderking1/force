import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTranslations } from "./load.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(files: Readonly<Record<string, unknown>>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "force-translation-inputs-"));
  directories.push(dir);
  for (const [name, raw] of Object.entries(files)) {
    await writeFile(path.join(dir, name), JSON.stringify(raw));
  }
  return dir;
}

test("loads files in order, retaining first rows, empty text, and existing row parsing", async () => {
  const dir = await fixture({
    "first.json": { translations: [
      { id: "a", text: "first", sourceText: "English" },
      { id: "a", text: "duplicate" }, { id: "empty", text: "" },
      null, { id: "invalid", text: 4 },
    ] },
    "second.json": { translations: [
      { id: "a", text: "second" }, { id: "empty", text: "fallback" }, { id: "b", text: "later" },
    ] },
  });
  const first = path.join(dir, "first.json");
  const second = path.join(dir, "second.json");
  const loaded = await loadTranslations([first, second]);
  expect([...loaded.translations].map(([id, row]) => [id, row.text])).toEqual([
    ["a", "first"], ["empty", ""], ["b", "later"],
  ]);
  expect(loaded.translations.get("a")?.sourceText).toBe("English");
  expect(loaded.provenance.selectedSources).toEqual({ a: first, empty: first, b: second });
  expect(loaded.provenance.inputs.map((input) => input.selectedCount)).toEqual([2, 1]);
  expect((await loadTranslations([second, first])).translations.get("a")?.text).toBe("second");
});

test("candidate files precede translations and retain their own first-occurrence order", async () => {
  const dir = await fixture({
    "translations.json": { translations: [{ id: "a", text: "translation" }, { id: "b", text: "fallback" }] },
    "candidate.json": { candidates: [{ id: "a", arabic: "مرشح", english: "Candidate" }, { id: "skip" }] },
    "older.json": { candidates: [{ id: "a", arabic: "older" }] },
  });
  const candidates = [path.join(dir, "candidate.json"), path.join(dir, "older.json")] as const;
  const loaded = await loadTranslations([path.join(dir, "translations.json")], candidates);
  expect(loaded.translations.get("a")).toEqual({ id: "a", text: "مرشح", sourceText: "Candidate", sourceFile: candidates[0] });
  expect(loaded.translations.get("b")?.text).toBe("fallback");
  expect(loaded.translations.has("skip")).toBe(false);
  expect(loaded.provenance.inputs.map((input) => [input.kind, input.selectedCount])).toEqual([
    ["candidates", 1], ["candidates", 0], ["translations", 1],
  ]);
});

test("hashes the exact file bytes and records resolved paths, including duplicate inputs", async () => {
  const dir = await fixture({});
  const file = path.join(dir, "input.json");
  const bytes = ' { "translations": [{"id":"a","text":"عربي"}] }\n';
  await writeFile(file, bytes);
  const loaded = await loadTranslations([path.relative(process.cwd(), file), file]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(loaded.provenance.inputs).toEqual([
    { kind: "translations", path: file, sha256, selectedCount: 1 },
    { kind: "translations", path: file, sha256, selectedCount: 0 },
  ]);
  expect(loaded.provenance.selectedSources.a).toBe(file);
});

test("fails clearly for missing translation and candidate files, even after a valid input", async () => {
  const dir = await fixture({ "valid.json": { translations: [{ id: "a", text: "ok" }] } });
  const missing = path.join(dir, "missing.json");
  await expect(loadTranslations([path.join(dir, "valid.json"), missing])).rejects.toThrow(`Cannot read translation input ${missing}`);
  await expect(loadTranslations([path.join(dir, "valid.json")], [missing])).rejects.toThrow(`Cannot read translation input ${missing}`);
});

test("rejects invalid JSON and unrecognized file shapes with the input path", async () => {
  const dir = await fixture({ "wrong.json": { rows: [] } });
  const invalid = path.join(dir, "invalid.json");
  await writeFile(invalid, "{");
  await expect(loadTranslations([invalid])).rejects.toThrow(`Cannot parse translation input ${invalid}`);
  await expect(loadTranslations([path.join(dir, "wrong.json")])).rejects.toThrow(`Unrecognized translation file ${path.join(dir, "wrong.json")}`);
});
