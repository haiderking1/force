import { TranslationError } from "../errors.ts";

export function isRecoverableResponseError(error: unknown): boolean {
  return error instanceof TranslationError && error.code === "RESPONSE";
}
