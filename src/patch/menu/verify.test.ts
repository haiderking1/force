import { expect, test } from "bun:test";
import type { GfxInspectReport } from "../gfx/inspect.ts";
import { verifyMainMenuIds } from "./verify.ts";

function report(starred: readonly string[], extras: readonly string[] = []): GfxInspectReport {
  const codes = [...starred, ...extras];
  return {
    signature: "CFX",
    version: 8,
    declaredLength: 1,
    decompressedBytes: 1,
    frameCount: 1,
    leftover: 0,
    tagCounts: [],
    fonts: [],
    lineCodes: codes.map((lineCode, index) => ({
      lineCode,
      starred: starred.includes(lineCode),
      offset: index,
      tagType: 12,
      tagName: "DoAction",
    })),
    starredLineCodes: [...starred],
  };
}

test("rejects candidate ids that are not FrontEnd.gfx *LINECODE refs", () => {
  const frontend = report(
    [
      "PMTE102TEXT",
      "PMTE107TEXT",
      "PMTE073TEXT",
      "TMPP159TEXT",
      "PMTE103TEXT",
      "TCRR002TEXT",
      "TCRR003TEXT",
      "TCRR004TEXT",
      "PMTE100TEXT",
      "PMTE125TEXT",
      "TOGU036TEXT",
      "TOGU038TEXT",
      "TOGU041TEXT",
      "PMTE095TEXT",
      "PMTE096TEXT",
      "PMTE097TEXT",
      "PMTE098TEXT",
      "PMTE028TEXT",
      "PMTE029TEXT",
      "TOLB032TEXT",
      "TOLB065TEXT",
      "TOLB066TEXT",
      "TOLB134TEXT",
    ],
    ["TOGU042TEXT"],
  );
  const arabic = new Map(frontend.starredLineCodes.map((id) => [id, `ar:${id}`]));
  const verified = verifyMainMenuIds({
    frontend,
    englishById: new Map([["TOGU042TEXT", "New Game"]]),
    arabicById: arabic,
    looseFrontendPresent: false,
    looseFontsPresent: false,
  });
  expect(verified.rejectedCandidateIds).toContain("TOGU042TEXT");
  expect(verified.rejectedCandidateIds).toContain("TOGU046TEXT");
  expect(verified.verifiedIds).toContain("PMTE028TEXT");
  expect(verified.verifiedIds).not.toContain("TOGU042TEXT");
});
