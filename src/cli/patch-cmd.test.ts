import { expect, test } from "bun:test";
import { parsePatchArgs } from "./patch-cmd.ts";

test("patch stage preserves repeated translation and candidate flag order", () => {
  expect(parsePatchArgs([
    "stage", "--translations", "first.json", "--candidates", "menu.json",
    "--translations", "second.json", "--candidates", "older-menu.json",
    "--game", "brutal-legend", "--scope", "main-menu", "--root", "/game", "--out", "/stage",
  ])).toEqual({
    command: "patch", action: "stage", game: "brutal-legend", scope: "main-menu",
    root: "/game", out: "/stage", help: false,
    translations: ["first.json", "second.json"], candidates: ["menu.json", "older-menu.json"],
  });
});

test("patch stage requires translations, including when candidates are supplied", () => {
  expect(() => parsePatchArgs(["stage"])).toThrow("requires at least one --translations");
  expect(() => parsePatchArgs(["stage", "--candidates", "menu.json"])).toThrow("requires at least one --translations");
  expect(parsePatchArgs(["stage", "--help"])).toMatchObject({ action: "stage", help: true });
});

test("candidates are allowed only with the explicit or default main-menu scope", () => {
  expect(parsePatchArgs(["stage", "--translations", "t.json", "--candidates", "c.json"]))
    .toMatchObject({ scope: "main-menu", candidates: ["c.json"] });
  for (const scope of ["game-text", "unknown"]) {
    expect(() => parsePatchArgs(["stage", "--candidates", "c.json", "--scope", scope, "--translations", "t.json"]))
      .toThrow("--candidates is only valid for --scope main-menu");
  }
  expect(parsePatchArgs(["stage", "--scope", "game-text", "--translations", "t.json"]))
    .toMatchObject({ scope: "game-text", translations: ["t.json"], candidates: [] });
});

test("translation flags require values and are rejected for other actions", () => {
  for (const flag of ["--translations", "--candidates"]) {
    expect(() => parsePatchArgs(["stage", "--translations", "valid.json", flag])).toThrow(`${flag} requires a value`);
    expect(() => parsePatchArgs(["stage", flag, "--out", "stage"])).toThrow(`${flag} requires a value`);
    for (const action of ["apply", "restore"]) {
      expect(() => parsePatchArgs([action, flag, "input.json"])).toThrow(`Unknown argument: ${flag}`);
    }
  }
});

test("patch apply and restore parsing retains existing behavior", () => {
  expect(parsePatchArgs(["apply", "--stage", "stage", "--backup", "backup", "--confirm"]))
    .toEqual({ command: "patch", action: "apply", stage: "stage", backup: "backup", confirm: true, help: false });
  expect(parsePatchArgs(["restore", "--backup", "backup", "--confirm"]))
    .toEqual({ command: "patch", action: "restore", backup: "backup", confirm: true, help: false });
});
