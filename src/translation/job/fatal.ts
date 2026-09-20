import { TranslationError, TranslationHttpError } from "../errors.ts";

export function isFatalDispatchError(error: unknown): boolean {
  return fatalStopReason(error) !== undefined;
}

export function fatalStopReason(error: unknown): "auth" | "config" | undefined {
  if (
    error instanceof TranslationHttpError &&
    (error.status === 401 || error.status === 403 || error.status === 402)
  ) {
    return "auth";
  }
  if (error instanceof TranslationError && (error.code === "CONFIG" || error.code === "AUTH")) {
    return "config";
  }
  return undefined;
}

export function errorDetail(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof TranslationError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error && error.message.length > 0) {
    return { code: "ERROR", message: error.message };
  }
  return { code: "ERROR", message: "Unknown translation error" };
}
