import { expect, test } from "bun:test";
import { brutalLegendAdapter } from "../games/brutal-legend/adapter.ts";
import { linkCompanions, packStem } from "./companions.ts";

test("links .~h/.~p companions to a case-insensitive manifest stem", () => {
  const links = linkCompanions(
    [
      { id: "Win/Packs/Loc_enUS.~h", relativePath: "Win/Packs/Loc_enUS.~h", kind: "pack-header" },
      { id: "Win/Packs/Loc_enUS.~p", relativePath: "Win/Packs/Loc_enUS.~p", kind: "pack-payload" },
      { id: "Win/Packs/loc_enus.txt", relativePath: "Win/Packs/loc_enus.txt", kind: "text" },
      { id: "Win/Packs/out.txt", relativePath: "Win/Packs/out.txt", kind: "text" },
    ],
    brutalLegendAdapter,
  );
  expect(packStem("Win/Packs/loc_enus.txt", brutalLegendAdapter)).toBe("win/packs/loc_enus");
  expect(links.get("Win/Packs/Loc_enUS.~h")?.manifestIds).toEqual(["Win/Packs/loc_enus.txt"]);
  expect(links.get("Win/Packs/Loc_enUS.~p")?.companionIds).toEqual([
    "Win/Packs/Loc_enUS.~h",
    "Win/Packs/loc_enus.txt",
  ]);
  expect(links.get("Win/Packs/loc_enus.txt")?.packFamilyId).toBe("win/packs/loc_enus");
  expect(links.get("Win/Packs/out.txt")?.packFamilyId).toBeUndefined();
});
