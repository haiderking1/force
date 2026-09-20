export const CLINE_BASE_URL = "https://api.cline.bot/api/v1";
export const CLINE_COMPLETIONS_PATH = "/chat/completions";

export const CLINE_DEFAULTS = {
  targetLanguage: "ar",
  maxRetries: 2,
  retryBackoffMs: 500,
  workers: 100,
  batchSize: 50,
  temperature: 0,
} as const;

export const CLINE_THINKING_DISABLED_EFFORT = "none" as const;

// API keys are sent verbatim. Preserve explicit account-token prefixes as supplied.
// https://docs.cline.bot/api/authentication
export function formatClineBearer(credential: string): string {
  return credential.trim();
}

export function applyClineThinkingDisabled(body: Record<string, unknown>): Record<string, unknown> {
  delete body.reasoning_effort;
  delete body.reasoning;
  delete body.include_reasoning;
  delete body.thinking;
  delete body.enable_thinking;
  body.include_reasoning = true;
  body.reasoning = { effort: CLINE_THINKING_DISABLED_EFFORT };
  return body;
}
