import { expect, test } from "bun:test";
import { collectPlaceholderTokens, collectTokensInText } from "./scan.ts";
import { isStructuralSlashToken } from "./patterns.ts";

const OBSERVED = {
  printf: "%i of %i pieces unlocked",
  percentProse: "Achieve 100% completion on the stats screen",
  percentParen: "Eddie flight speed (+5%)",
  consecutiveBindings: "Use combo attacks /AxeAttack//GuitarAttack//AxeAttack/ to do more damage.",
  binding: "Press /Activate/ to Build.",
  bleep: "Oh /bleep/shit/bleep/. Here it comes.",
  credits: "Written by Benante//Lilker//Rosenfeld//Spitz//Turbin ",
  oBo: "Published by Downtown Music Publishing LLC o//b//o Sixx Gunner Music",
  escapes: "ROLE\\r\\nRanged vehicle.\\r\\nDOUBLE TEAM\\r\\n",
  tabEscape: "MFMS009GRDN\\tStyle is important.",
  doubleSlash: "marked on your map with \\\\secondary mission\\\\ ",
  underscore: "_PANBUTTON_ Pan    _ZOOMBUTTON_ Zoom    /kBI_UI_DPadLeft/ Previous",
  kbi: "Press /kBI_UI_X/",
  cash: "You don't have enough /CASH/ (Fire Tributes)",
  synthetic:
    "Hello {name} {0} {w=0.5} {/i} %s %d %1$s <color>red</color> [name] [config.version!t] \\n keep going",
};

test("collects observed printf, bindings, bleep, escapes, and underscore tokens", () => {
  expect(collectTokensInText(OBSERVED.printf)).toEqual(["%i", "%i"]);
  expect(collectTokensInText(OBSERVED.binding)).toEqual(["/Activate/"]);
  expect(collectTokensInText(OBSERVED.bleep)).toEqual(["/bleep/", "/bleep/"]);
  expect(collectTokensInText(OBSERVED.consecutiveBindings)).toEqual([
    "/AxeAttack/",
    "/GuitarAttack/",
    "/AxeAttack/",
  ]);
  expect(collectTokensInText(OBSERVED.escapes)).toEqual(["\\r", "\\n", "\\r", "\\n", "\\r", "\\n"]);
  expect(collectTokensInText(OBSERVED.tabEscape)).toEqual(["\\t"]);
  expect(collectTokensInText(OBSERVED.doubleSlash)).toEqual(["\\\\", "\\\\"]);
  expect(collectTokensInText(OBSERVED.underscore)).toEqual([
    "/kBI_UI_DPadLeft/",
    "_PANBUTTON_",
    "_ZOOMBUTTON_",
  ]);
  expect(collectTokensInText(OBSERVED.kbi)).toEqual(["/kBI_UI_X/"]);
  expect(collectTokensInText(OBSERVED.cash)).toEqual(["/CASH/"]);
});

test("does not treat ordinary prose percents, credits, or and/or as placeholders", () => {
  expect(collectTokensInText(OBSERVED.percentProse)).toEqual([]);
  expect(collectTokensInText("Achieved 100% completion on the stats screen")).toEqual([]);
  expect(collectTokensInText(OBSERVED.percentParen)).toEqual([]);
  expect(collectTokensInText("Eddie health (+5% max)")).toEqual([]);
  expect(collectTokensInText(OBSERVED.credits)).toEqual([]);
  expect(collectTokensInText(OBSERVED.oBo)).toEqual([]);
  expect(collectTokensInText("take this and/or that")).toEqual([]);
  expect(collectTokensInText("Creature - Metal Queen/Arachromids/Chrome Recluse - Razmig Mavlian")).toEqual([]);
  expect(collectTokensInText("Written by Bonnet//Glenn//McKenna//Schenker")).toEqual([]);
  expect(collectTokensInText("Press /kBI_UI_X/")).not.toContain("_UI_");
});

test("collects supported brace, bracket, markup, and positional printf tokens", () => {
  const tokens = collectPlaceholderTokens([OBSERVED.synthetic]);
  expect(tokens).toContain("{name}");
  expect(tokens).toContain("{0}");
  expect(tokens).toContain("{w=0.5}");
  expect(tokens).toContain("{/i}");
  expect(tokens).toContain("%s");
  expect(tokens).toContain("%d");
  expect(tokens).toContain("%1$s");
  expect(tokens).toContain("<color>");
  expect(tokens).toContain("</color>");
  expect(tokens).toContain("[name]");
  expect(tokens).toContain("[config.version!t]");
  expect(tokens).toContain("\\n");
  expect(tokens).not.toContain("{hello world}");
});

test("structural slash tokens stay narrow", () => {
  expect(isStructuralSlashToken("/GuitarAttack/")).toBe(true);
  expect(isStructuralSlashToken("/kBI_Accept/")).toBe(true);
  expect(isStructuralSlashToken("/bleep/")).toBe(true);
  expect(isStructuralSlashToken("/CASH/")).toBe(true);
  expect(isStructuralSlashToken("/Lilker/")).toBe(false);
  expect(isStructuralSlashToken("/b/")).toBe(false);
  expect(isStructuralSlashToken("/Attack/")).toBe(false);
  expect(isStructuralSlashToken("/Arachromids/")).toBe(false);
});
