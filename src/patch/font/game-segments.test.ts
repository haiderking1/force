import { expect, test } from "bun:test";
import { LayoutEngine } from "../../rendering/engine.ts";
import { isOperativeToken } from "./game-segments.ts";
import { prepareGameSegments, reservedAdvanceForToken, splitGameSegments } from "./game-segments.ts";
import { tokenizeGameSyntax } from "../../rendering/syntax/tokens.ts";

test("splitGameSegments keeps operative tokens out of display text", () => {
  const segments = splitGameSegments('قل /bleep/ ثم %s و {color=red}دم{/color}');
  expect(segments.filter((segment) => segment.kind === "token").map((segment) => segment.raw)).toEqual([
    "/bleep/",
    "%s",
    "{color=red}",
    "{/color}",
  ]);
  expect(segments.some((segment) => segment.kind === "display" && segment.raw.includes("/bleep/"))).toBe(false);
  const syntax = tokenizeGameSyntax("/Attack/");
  expect(syntax.some((token) => isOperativeToken(token) && token.raw === "/Attack/")).toBe(true);
});

test("prepareGameSegments reserves measured gaps and expands corpus escapes", () => {
  const { shaper } = LayoutEngine.fromFont("assets/fonts/force.ttf");
  try {
    const prepared = prepareGameSegments("سطر\\nثاني /bleep/", shaper);
    expect(prepared.paragraphs.length).toBe(2);
    expect(prepared.tokens.map((token) => token.raw)).toEqual(["/bleep/"]);
    const bleep = prepared.tokens[0];
    if (!bleep) throw new Error("missing /bleep/");
    expect(reservedAdvanceForToken(shaper, bleep)).toBe(Math.round(shaper.unitsPerEm() * 0.55));
    const last = prepared.paragraphs[1]?.chars.at(-1);
    expect(last?.tokenRaw).toBe("/bleep/");
    expect(last?.reservedAdvance).toBe(Math.round(shaper.unitsPerEm() * 0.55));
    const tabbed = prepareGameSegments("أ\tب", shaper);
    expect(tabbed.paragraphs[0]?.chars.map((item) => item.codepoint)).toEqual([0x0623, 0x0020, 0x0628]);
  } finally {
    shaper.destroy();
  }
});
