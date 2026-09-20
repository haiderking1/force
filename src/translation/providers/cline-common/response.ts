import { TranslationError } from "../../errors.ts";

/** Cline API-key requests return { success: true, data: completion }. */
export function unwrapClineCompletion(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return payload;
  if (!("success" in payload)) return payload;
  if (payload.success !== true || !("data" in payload) || typeof payload.data !== "object" || payload.data === null || Array.isArray(payload.data)) {
    throw new TranslationError("RESPONSE", "Cline returned an unsuccessful or malformed completion envelope");
  }
  return payload.data;
}
