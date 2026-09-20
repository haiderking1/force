import { isRecoverableResponseError } from "./kinds.ts";

export const SAME_INPUT_RETRY_LIMIT = 1;
export const SINGLETON_REPAIR_LIMIT = 3;

export type RecoveryDecision = "retry-same" | "split" | "repair" | "unresolved" | "fail";

export type RecoveryPolicyInput = {
  readonly error: unknown;
  readonly itemCount: number;
  readonly sameInputRetries: number;
  readonly singletonRepairs: number;
};

export function decideRecovery(input: RecoveryPolicyInput): RecoveryDecision {
  if (!isRecoverableResponseError(input.error)) {
    return "fail";
  }
  if (input.itemCount > 1) {
    if (input.sameInputRetries < SAME_INPUT_RETRY_LIMIT) {
      return "retry-same";
    }
    return "split";
  }
  if (input.sameInputRetries < SAME_INPUT_RETRY_LIMIT) {
    return "retry-same";
  }
  if (input.singletonRepairs < SINGLETON_REPAIR_LIMIT) {
    return "repair";
  }
  return "unresolved";
}

export function singletonAttemptCount(sameInputRetries: number, singletonRepairs: number): number {
  return 1 + sameInputRetries + singletonRepairs;
}
