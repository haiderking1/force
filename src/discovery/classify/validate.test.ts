import { expect, test } from "bun:test";
import { DiscoveryError } from "../errors.ts";
import { ROLE_QUESTION_KEYS } from "./questions.ts";
import { rolesFromAnswers, validateJevResponse } from "./validate.ts";

function noulAnswers(values: Record<string, number>): Record<string, { type: "noul"; noul: number }> {
  const answers: Record<string, { type: "noul"; noul: number }> = {};
  for (const key of ROLE_QUESTION_KEYS) {
    answers[key] = { type: "noul", noul: values[key] ?? 0.1 };
  }
  return answers;
}

test("accepts independent noul probabilities that do not sum to 1", () => {
  const parsed = validateJevResponse(
    {
      model: "jev-1.13.0",
      answers: noulAnswers({
        playerVisibleUiText: 0.8,
        spokenDialogueOrSubtitles: 0.7,
        referenceOnly: 0.2,
        debugOrInternal: 0.1,
        insufficientEvidence: 0.05,
      }),
    },
    ROLE_QUESTION_KEYS,
  );
  const roles = rolesFromAnswers(parsed.answers);
  expect(roles.playerVisibleUiText).toBe(0.8);
  expect(roles.spokenDialogueOrSubtitles).toBe(0.7);
});

test("rejects missing, non-finite, and out-of-range probabilities", () => {
  expect(() => validateJevResponse({ model: "jev-1.13.0", answers: {} }, ROLE_QUESTION_KEYS)).toThrow(DiscoveryError);
  expect(() =>
    validateJevResponse(
      {
        model: "jev-1.13.0",
        answers: noulAnswers({ playerVisibleUiText: Number.NaN }),
      },
      ROLE_QUESTION_KEYS,
    ),
  ).toThrow(/finite number/);
  expect(() =>
    validateJevResponse(
      {
        model: "jev-1.13.0",
        answers: {
          ...noulAnswers({}),
          playerVisibleUiText: { type: "noul", noul: 1.4 },
        },
      },
      ROLE_QUESTION_KEYS,
    ),
  ).toThrow(/between 0 and 1/);
  expect(() =>
    validateJevResponse(
      {
        model: "jev-1.13.0",
        answers: {
          ...noulAnswers({}),
          playerVisibleUiText: { type: "noul" },
        },
      },
      ROLE_QUESTION_KEYS,
    ),
  ).toThrow(/finite number/);
});
