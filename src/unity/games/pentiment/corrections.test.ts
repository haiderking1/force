import { expect, test } from "bun:test";
import { correctPentimentText } from "./corrections.ts";

test("puzzle clues name the monastery meeting room, not a Bible chapter", () => {
  const text = correctPentimentText('"The girl. The girl who died and the innocent with her. Matins. Chapter."', "wrong");
  expect(text).toContain("صلاة السحر. قاعة الرهبان");
  expect(correctPentimentText("Chapter House", "قاعة الفصل")).toBe("قاعة الرهبان");
  expect(correctPentimentText("Convent Chapter House", "قاعة فصل الدير")).toBe("قاعة الراهبات");
});

test("terminology changes are source-guarded", () => {
  expect(correctPentimentText("Before Matins", "قبل صلاة الفجر")).toBe("قبل صلاة السحر");
  expect(correctPentimentText("Morning prayer", "صلاة الفجر")).toBe("صلاة الفجر");
  expect(correctPentimentText("Read the next chapter", "الفصل التالي")).toBe("الفصل التالي");
});
