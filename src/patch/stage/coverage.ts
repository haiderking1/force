import type { DecodedStringTable } from "../../resources/stringtable/decode.ts";
import { containsPrivateUse } from "../font/display-text.ts";

export type CoverageKind = "timed" | "spoken" | "ui";

export type CoverageRow = {
  readonly id: string;
  readonly table: "main" | "dlc";
  readonly kind: CoverageKind;
  readonly translated: boolean;
  readonly alreadyEncoded: boolean;
  readonly empty: boolean;
  readonly encoded: boolean;
  readonly skipped: boolean;
  readonly skipReason?: "already-encoded" | "empty" | "untranslated";
};

export type CoverageAudit = {
  readonly timedCueRecords: number;
  readonly uniqueTimedIds: number;
  readonly spokenMain: number;
  readonly spokenDlc: number;
  readonly uiMain: number;
  readonly uiDlc: number;
  readonly translationCount: number;
  readonly alreadyEncoded: number;
  readonly encoded: number;
  readonly skippedEmpty: number;
  readonly skippedUntranslated: number;
  readonly orphanTranslations: number;
  readonly rows: readonly CoverageRow[];
};

export function spokenIds(table: DecodedStringTable): Set<string> {
  return new Set(
    table.records
      .filter((record) => record.soundCue !== undefined && record.soundCue.length > 0)
      .map((record) => record.lineCode),
  );
}

export function classifyKind(id: string, timed: ReadonlySet<string>, spoken: ReadonlySet<string>): CoverageKind {
  if (timed.has(id)) {
    return "timed";
  }
  if (spoken.has(id)) {
    return "spoken";
  }
  return "ui";
}

export function auditCoverage(input: {
  readonly main: DecodedStringTable;
  readonly dlc: DecodedStringTable;
  readonly timedIds: readonly string[];
  readonly timedCueRecords: number;
  readonly translations: ReadonlyMap<string, string>;
  readonly encodedIds: ReadonlySet<string>;
}): CoverageAudit {
  const timed = new Set(input.timedIds);
  const spokenMain = spokenIds(input.main);
  const spokenDlc = spokenIds(input.dlc);
  const spoken = new Set([...spokenMain, ...spokenDlc]);
  const rows: CoverageRow[] = [];
  const seen = new Set<string>();

  const visit = (table: DecodedStringTable, name: "main" | "dlc") => {
    for (const record of table.records) {
      if (seen.has(record.lineCode)) {
        continue;
      }
      seen.add(record.lineCode);
      const kind = classifyKind(record.lineCode, timed, spoken);
      const translation = input.translations.get(record.lineCode);
      const alreadyEncoded =
        containsPrivateUse(record.text) || (translation !== undefined && containsPrivateUse(translation));
      const empty = translation !== undefined && translation.length === 0;
      const skipReason = alreadyEncoded
        ? "already-encoded"
        : empty
          ? "empty"
          : translation === undefined
            ? "untranslated"
            : undefined;
      rows.push({
        id: record.lineCode,
        table: name,
        kind,
        translated: translation !== undefined,
        alreadyEncoded,
        empty,
        encoded: skipReason === undefined && input.encodedIds.has(record.lineCode),
        skipped: skipReason !== undefined,
        skipReason,
      });
    }
  };

  visit(input.main, "main");
  visit(input.dlc, "dlc");

  let orphanTranslations = 0;
  for (const id of input.translations.keys()) {
    if (!seen.has(id)) {
      orphanTranslations += 1;
    }
  }

  return {
    timedCueRecords: input.timedCueRecords,
    uniqueTimedIds: timed.size,
    spokenMain: spokenMain.size,
    spokenDlc: spokenDlc.size,
    uiMain: input.main.records.filter((record) => classifyKind(record.lineCode, timed, spoken) === "ui").length,
    uiDlc: input.dlc.records.filter((record) => classifyKind(record.lineCode, timed, spoken) === "ui").length,
    translationCount: input.translations.size,
    alreadyEncoded: rows.filter((row) => row.alreadyEncoded).length,
    encoded: rows.filter((row) => row.encoded).length,
    skippedEmpty: rows.filter((row) => row.skipReason === "empty").length,
    skippedUntranslated: rows.filter((row) => row.skipReason === "untranslated").length,
    orphanTranslations,
    rows,
  };
}
