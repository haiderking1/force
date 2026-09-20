import type { RoleName } from "../report/types.ts";
import type { JevNoulQuestion } from "./contract.ts";
import { JEV_QUESTION_SET_VERSION } from "./contract.ts";

export const ROLE_QUESTION_KEYS = [
  "playerVisibleUiText",
  "spokenDialogueOrSubtitles",
  "referenceOnly",
  "debugOrInternal",
  "insufficientEvidence",
] as const satisfies readonly RoleName[];

export function discoveryQuestions(): Record<(typeof ROLE_QUESTION_KEYS)[number], JevNoulQuestion> {
  return {
    playerVisibleUiText: {
      type: "noul",
      instructions:
        "This resource contains player-visible user-interface text that a player would read on screen during normal play, such as menus, HUD labels, buttons, alerts, or journal UI.",
      criteria: {
        true: "The supplied evidence includes menu, HUD, button, alert, or other on-screen UI wording.",
        false: "The evidence is only paths, code, assets, or other non-UI material.",
      },
    },
    spokenDialogueOrSubtitles: {
      type: "noul",
      instructions:
        "This resource contains spoken dialogue or subtitle text that a player would hear or read as character speech.",
      criteria: {
        true: "The evidence includes subtitle, story-line, or spoken-dialogue wording.",
        false: "The evidence does not include spoken dialogue or subtitle wording.",
      },
    },
    referenceOnly: {
      type: "noul",
      instructions:
        "This resource is reference material only: manifests, paths, asset names, fonts, or configuration that point at text stored elsewhere.",
      criteria: {
        true: "The evidence is names, paths, or configuration rather than the playable text itself.",
        false: "The evidence is the playable text, or there is not enough to call it reference-only.",
      },
    },
    debugOrInternal: {
      type: "noul",
      instructions:
        "This resource contains debug, developer, or internal-only text that players are not meant to see in normal play.",
      criteria: {
        true: "The evidence is debug, engine, or developer wording.",
        false: "The evidence is not internal-only debug text.",
      },
    },
    insufficientEvidence: {
      type: "noul",
      instructions:
        "The supplied evidence is not enough to decide whether this resource holds player-visible UI text or spoken dialogue.",
      criteria: {
        true: "The samples and references are missing, opaque, or too thin to decide.",
        false: "The evidence is enough to judge at least one role.",
      },
    },
  };
}

export function questionSetVersion(): string {
  return JEV_QUESTION_SET_VERSION;
}
