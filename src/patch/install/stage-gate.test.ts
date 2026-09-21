import { expect, test } from "bun:test";
import { PatchError } from "../errors.ts";
import { assertStageFontComplete } from "./stage-gate.ts";

test("apply gate refuses a v1-style manifest without verified fonts", () => {
  expect(() =>
    assertStageFontComplete({
      gameRoot: "/game",
      files: [],
    }),
  ).toThrow(PatchError);
  expect(() =>
    assertStageFontComplete({
      gameRoot: "/game",
      files: [],
    }),
  ).toThrow(/font-incomplete/);
});

test("apply gate accepts a verified font resource list", () => {
  expect(() =>
    assertStageFontComplete({
      gameRoot: "/game",
      fontResourcesVerified: true,
      fontResources: [{ name: "TG_Menu", verified: true }],
      files: [],
    }),
  ).not.toThrow();
});
