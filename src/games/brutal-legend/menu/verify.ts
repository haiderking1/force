import { PatchError } from "../../../patch/errors.ts";
import {
  BRUTAL_LEGEND_CANDIDATE_IDS,
  BRUTAL_LEGEND_TITLE_MENU_STARRED_IDS,
} from "../config.ts";
import type { GfxInspectReport } from "../../../patch/gfx/inspect.ts";

export type MenuIdDecision = {
  readonly lineCode: string;
  readonly english: string | undefined;
  readonly arabic: string | undefined;
  readonly status: "verified" | "rejected-candidate" | "missing-translation";
  readonly evidence: readonly string[];
};

export type MenuVerification = {
  readonly frontendFlashFile: string | undefined;
  readonly usePackfiles: boolean | undefined;
  readonly looseFrontendPresent: boolean;
  readonly looseFontsPresent: boolean;
  readonly starredInFrontend: readonly string[];
  readonly decisions: readonly MenuIdDecision[];
  readonly verifiedIds: readonly string[];
  readonly rejectedCandidateIds: readonly string[];
};

export function verifyMainMenuIds(options: {
  readonly frontend: GfxInspectReport;
  readonly englishById: ReadonlyMap<string, string>;
  readonly arabicById: ReadonlyMap<string, string>;
  readonly frontendFlashFile?: string;
  readonly usePackfiles?: boolean;
  readonly looseFrontendPresent: boolean;
  readonly looseFontsPresent: boolean;
}): MenuVerification {
  const starred = new Set(options.frontend.starredLineCodes);
  const decisions: MenuIdDecision[] = [];

  for (const lineCode of BRUTAL_LEGEND_CANDIDATE_IDS) {
    const hits = options.frontend.lineCodes.filter((hit) => hit.lineCode === lineCode);
    if (hits.length === 0) {
      decisions.push({
        lineCode,
        english: options.englishById.get(lineCode),
        arabic: options.arabicById.get(lineCode),
        status: "rejected-candidate",
        evidence: [
          "Not present in FrontEnd.gfx ActionScript constants, EditText, or other decompressed tags.",
          "Matching English in the StringTable is not a menu reference.",
        ],
      });
      continue;
    }
    decisions.push({
      lineCode,
      english: options.englishById.get(lineCode),
      arabic: options.arabicById.get(lineCode),
      status: starred.has(lineCode) ? "verified" : "rejected-candidate",
      evidence: hits.map((hit) => `${hit.starred ? "*" : ""}${hit.lineCode} at ${hit.offset} (${hit.tagName ?? "unknown"})`),
    });
  }

  for (const lineCode of BRUTAL_LEGEND_TITLE_MENU_STARRED_IDS) {
    if (!starred.has(lineCode)) {
      throw new PatchError(
        "MENU",
        `Configured title-menu id ${lineCode} is not a *LINECODE reference in FrontEnd.gfx`,
      );
    }
    const arabic = options.arabicById.get(lineCode);
    const hits = options.frontend.lineCodes.filter((hit) => hit.lineCode === lineCode && hit.starred);
    decisions.push({
      lineCode,
      english: options.englishById.get(lineCode),
      arabic,
      status: arabic === undefined ? "missing-translation" : "verified",
      evidence: hits.map((hit) => `*${hit.lineCode} at ${hit.offset} (${hit.tagName ?? "unknown"})`),
    });
  }

  return {
    frontendFlashFile: options.frontendFlashFile,
    usePackfiles: options.usePackfiles,
    looseFrontendPresent: options.looseFrontendPresent,
    looseFontsPresent: options.looseFontsPresent,
    starredInFrontend: options.frontend.starredLineCodes,
    decisions,
    verifiedIds: decisions.filter((item) => item.status === "verified").map((item) => item.lineCode),
    rejectedCandidateIds: decisions
      .filter((item) => item.status === "rejected-candidate")
      .map((item) => item.lineCode),
  };
}
