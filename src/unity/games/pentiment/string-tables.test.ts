import { expect, test } from "bun:test";
import { parsePentimentTables, replacePentimentText, stringId } from "./string-tables.ts";

const fixture = { Hash: -12, StringTables: [
  { Name: "game/gui", UObjectName: "gui_enus", Entries: [{ ID: 1, DefaultText: "Continue" }, { ID: 2, DefaultText: "" }] },
  { Name: "conversations/intro", UObjectName: "intro_enus", Entries: [{ ID: 1, DefaultText: "<red>Hello</red> {0}" }] },
] };

test("Pentiment table IDs are scoped and replacement preserves all other fields", () => {
  const source = parsePentimentTables(fixture);
  const result = replacePentimentText(source, new Map([[stringId("game/gui", 1), "متابعة"]]));
  expect(result.Hash).toBe(-12);
  expect(result.StringTables[0]?.Entries[0]?.DefaultText).toBe("متابعة");
  expect(result.StringTables[0]?.Entries[1]?.DefaultText).toBe("");
  expect(result.StringTables[1]).toEqual(source.StringTables[1]);
  expect(source).toEqual(fixture);
  expect(parsePentimentTables(JSON.parse(JSON.stringify(result)))).toEqual(result);
});

test("schema drift, duplicates, and unknown replacements fail closed", () => {
  expect(() => parsePentimentTables({ ...fixture, Unknown: 1 })).toThrow("schema");
  expect(() => parsePentimentTables({ ...fixture, StringTables: [fixture.StringTables[0], fixture.StringTables[0]] })).toThrow("Duplicate");
  expect(() => parsePentimentTables({ Hash: 0, StringTables: [{ Name: "x", UObjectName: "x", Entries: [{ ID: 1, DefaultText: "a" }, { ID: 1, DefaultText: "b" }] }] })).toThrow("Duplicate");
  expect(() => replacePentimentText(parsePentimentTables(fixture), new Map([["unknown", "نص"]]))).toThrow("unknown");
});
