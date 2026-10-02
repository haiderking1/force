import { isRecord } from "../../shared/validation/is-record.ts";
import { DiscoveryError } from "../errors.ts";
import type { RoleProbabilities } from "../report/types.ts";
import type { JevAnswer, JevNoulAnswer, JevResponseBody } from "./contract.ts";
import { ROLE_QUESTION_KEYS } from "./questions.ts";

function finiteUnit(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DiscoveryError("RESPONSE", `${label} must be a finite number`);
  }
  if (value < 0 || value > 1) {
    throw new DiscoveryError("RESPONSE", `${label} must be between 0 and 1`);
  }
  return value;
}

function asNoulAnswer(value: unknown, key: string): JevNoulAnswer {
  if (!isRecord(value)) {
    throw new DiscoveryError("RESPONSE", `Answer ${key} must be an object`);
  }
  if (value.type !== "noul") {
    throw new DiscoveryError("RESPONSE", `Answer ${key} must have type noul`);
  }
  return {
    type: "noul",
    noul: finiteUnit(value.noul, `answers.${key}.noul`),
  };
}

export function validateJevResponse(payload: unknown, expectedKeys: readonly string[]): JevResponseBody {
  if (!isRecord(payload)) {
    throw new DiscoveryError("RESPONSE", "Jev response must be an object");
  }
  const model = payload.model;
  if (typeof model !== "string" || model.trim().length === 0) {
    throw new DiscoveryError("RESPONSE", "Jev response.model must be a non-empty string");
  }
  if (!isRecord(payload.answers)) {
    throw new DiscoveryError("RESPONSE", "Jev response.answers must be an object");
  }
  const answers: Record<string, JevAnswer> = {};
  for (const key of expectedKeys) {
    if (!(key in payload.answers)) {
      throw new DiscoveryError("RESPONSE", `Jev response is missing answer ${key}`);
    }
    answers[key] = asNoulAnswer(payload.answers[key], key);
  }
  return { model, answers };
}

export function rolesFromAnswers(answers: JevResponseBody["answers"]): RoleProbabilities {
  const noulOf = (key: (typeof ROLE_QUESTION_KEYS)[number]): number => {
    const answer = answers[key];
    if (answer === undefined || answer.type !== "noul") {
      throw new DiscoveryError("RESPONSE", `Missing noul answer ${key}`);
    }
    return answer.noul;
  };
  return {
    playerVisibleUiText: noulOf("playerVisibleUiText"),
    spokenDialogueOrSubtitles: noulOf("spokenDialogueOrSubtitles"),
    referenceOnly: noulOf("referenceOnly"),
    debugOrInternal: noulOf("debugOrInternal"),
    insufficientEvidence: noulOf("insufficientEvidence"),
  };
}
