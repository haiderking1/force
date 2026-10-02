import { expect, test } from "bun:test";
import { Shaper } from "../../rendering/font/shaper.ts";
import { UnityGlyphs } from "./glyphs.ts";
import { encodeUnityText } from "./encode.ts";
import { parseUnityRichText } from "./rich-text.ts";

const profile = { widthEm: 20, maxLines: 4, pairedTags: new Set(["red", "i"]) };

test("static Arabic uses reusable PUA outlines while Latin and digits survive", () => {
  const shaper = Shaper.open("assets/fonts/force.ttf");
  try {
    const glyphs = new UnityGlyphs(shaper);
    const first = encodeUnityText("مرحبا ABC 123", glyphs, profile);
    expect(first).toContain("ABC 123"); expect(first).toMatch(/[\ue800-\uf8ff]/u);
    expect(first).not.toMatch(/[\u0621-\u064a]/u);
    const count = glyphs.glyphs.length;
    expect(encodeUnityText("مرحبا ABC 123", glyphs, profile)).toBe(first);
    expect(glyphs.glyphs.length).toBe(count);
    const styled = encodeUnityText("<red>مرحبا</red>\nأهلا", glyphs, profile);
    expect(styled).toContain("<red>");expect(styled).toContain("</red>\n");
  } finally { shaper.destroy(); }
});

test("unknown controls, runtime variables, and invalid tag nesting fail closed", () => {
  for (const text of ["مرحبا {0}", "<dt>شرح", "<red>س<i>ص</red></i>", "<red>س"]) {
    expect(() => parseUnityRichText(text, profile.pairedTags)).toThrow();
  }
});

test("explicit width and line limits reject overflowing static text", () => {
  const shaper = Shaper.open("assets/fonts/force.ttf");
  try {
    expect(() => encodeUnityText("أهلا\nمرحبا", new UnityGlyphs(shaper), { ...profile, maxLines: 1 })).toThrow("line limit");
    expect(() => encodeUnityText("مرحبا", new UnityGlyphs(shaper), { ...profile, widthEm: 0.01 })).toThrow();
  } finally { shaper.destroy(); }
});
