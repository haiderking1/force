import { expect, test } from "bun:test";
import type { DecodedStringTable } from "../../../resources/stringtable/decode.ts";
import { auditCoverage, classifyKind, spokenIds } from "./coverage.ts";

function table(
  records: readonly { lineCode: string; text: string; soundCue?: string }[],
): DecodedStringTable {
  return {
    typeName: "StringTable",
    records: records.map((record) => ({
      lineCode: record.lineCode,
      text: record.text,
      volumeDb: undefined,
      soundCue: record.soundCue,
      keyOffset: 0,
      textOffset: 0,
    })),
  };
}

test("coverage classifies timed over spoken and skips already-PUA rows", () => {
  const main = table([
    { lineCode: "INTR001GUIT", text: "Rise", soundCue: "Voice/A" },
    { lineCode: "SPOK001GUIT", text: "Talk", soundCue: "Voice/B" },
    { lineCode: "MENU001TEXT", text: "Continue" },
    { lineCode: "PMTE028TEXT", text: "\uE000Menu" },
  ]);
  const dlc = table([{ lineCode: "DLC001TEXT", text: "Dlc" }]);
  const audit = auditCoverage({
    main,
    dlc,
    timedIds: ["INTR001GUIT"],
    timedCueRecords: 2,
    translations: new Map([
      ["INTR001GUIT", "مرحبا"],
      ["SPOK001GUIT", "كلام"],
      ["MENU001TEXT", "متابعة"],
      ["PMTE028TEXT", "قائمة"],
      ["ORPHAN001", "يتيم"],
    ]),
    encodedIds: new Set(["INTR001GUIT", "SPOK001GUIT", "MENU001TEXT"]),
  });
  expect(classifyKind("INTR001GUIT", new Set(["INTR001GUIT"]), spokenIds(main))).toBe("timed");
  expect(audit.timedCueRecords).toBe(2);
  expect(audit.uniqueTimedIds).toBe(1);
  expect(audit.spokenMain).toBe(2);
  expect(audit.encoded).toBe(3);
  expect(audit.alreadyEncoded).toBe(1);
  expect(audit.orphanTranslations).toBe(1);
  expect(audit.rows.find((row) => row.id === "PMTE028TEXT")?.skipReason).toBe("already-encoded");
  expect(audit.rows.find((row) => row.id === "DLC001TEXT")?.skipReason).toBe("untranslated");
});
