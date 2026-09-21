import { expect, test } from "bun:test";
import { mergeTranslations } from "./load.ts";

test("keeps the first saved translation and reads candidates.json arabic fields", () => {
  const merged = mergeTranslations([
    {
      path: "prompt-v2",
      raw: { translations: [{ id: "PMTE028TEXT", text: "رجوع", sourceText: "BACK" }] },
    },
    {
      path: "older",
      raw: { translations: [{ id: "PMTE028TEXT", text: "wrong" }] },
    },
    {
      path: "candidates",
      raw: { candidates: [{ id: "TOGU042TEXT", english: "New Game", arabic: "لعبة جديدة" }] },
    },
  ]);
  expect(merged.get("PMTE028TEXT")?.text).toBe("رجوع");
  expect(merged.get("TOGU042TEXT")?.text).toBe("لعبة جديدة");
});
