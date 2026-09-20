import { expect, test } from "bun:test";
import { TranslationError, TranslationHttpError } from "../errors.ts";
import { decideRecovery, SAME_INPUT_RETRY_LIMIT, SINGLETON_REPAIR_LIMIT, singletonAttemptCount } from "./policy.ts";

test("retries a RESPONSE batch once, then splits, then bounds singleton repair", () => {
  const response = new TranslationError("RESPONSE", "Translation response is not valid JSON");
  expect(decideRecovery({ error: response, itemCount: 4, sameInputRetries: 0, singletonRepairs: 0 })).toBe("retry-same");
  expect(decideRecovery({ error: response, itemCount: 4, sameInputRetries: SAME_INPUT_RETRY_LIMIT, singletonRepairs: 0 })).toBe("split");
  expect(decideRecovery({ error: response, itemCount: 1, sameInputRetries: 0, singletonRepairs: 0 })).toBe("retry-same");
  expect(decideRecovery({ error: response, itemCount: 1, sameInputRetries: SAME_INPUT_RETRY_LIMIT, singletonRepairs: 0 })).toBe("repair");
  expect(
    decideRecovery({
      error: response,
      itemCount: 1,
      sameInputRetries: SAME_INPUT_RETRY_LIMIT,
      singletonRepairs: SINGLETON_REPAIR_LIMIT - 1,
    }),
  ).toBe("repair");
  expect(
    decideRecovery({
      error: response,
      itemCount: 1,
      sameInputRetries: SAME_INPUT_RETRY_LIMIT,
      singletonRepairs: SINGLETON_REPAIR_LIMIT,
    }),
  ).toBe("unresolved");
  expect(singletonAttemptCount(SAME_INPUT_RETRY_LIMIT, SINGLETON_REPAIR_LIMIT)).toBe(1 + SAME_INPUT_RETRY_LIMIT + SINGLETON_REPAIR_LIMIT);
});

test("does not recover HTTP or other non-RESPONSE failures", () => {
  expect(
    decideRecovery({
      error: new TranslationHttpError(503, true),
      itemCount: 4,
      sameInputRetries: 0,
      singletonRepairs: 0,
    }),
  ).toBe("fail");
  expect(
    decideRecovery({
      error: new TranslationError("HTTP", "Translation request failed"),
      itemCount: 1,
      sameInputRetries: 0,
      singletonRepairs: 0,
    }),
  ).toBe("fail");
  expect(
    decideRecovery({
      error: new TranslationError("CANCELLED", "Translation request was cancelled"),
      itemCount: 2,
      sameInputRetries: 0,
      singletonRepairs: 0,
    }),
  ).toBe("fail");
});
