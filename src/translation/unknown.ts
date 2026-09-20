export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Unknown translation error";
}
