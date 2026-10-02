export { isRecord } from "../shared/validation/is-record.ts";

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Unknown translation error";
}
