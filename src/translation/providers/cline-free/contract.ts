// Values below come from the installed cline-free extension, not from the Pi model id.
export const CLINE_FREE_PROVIDER = "cline-free" as const;
export const CLINE_FREE_BASE_URL = "https://api.cline.bot/api/v1";
export const CLINE_FREE_MODEL = "cline-free/deepseek-v4.1-flash";
export const CLINE_FREE_COMPLETIONS_PATH = "/chat/completions";

export const CLINE_FREE_HEADERS = {
  "HTTP-Referer": "https://cline.bot",
  "X-Title": "Cline",
  "X-IS-MULTIROOT": "false",
  "X-CLIENT-TYPE": "cline-desktop",
  "X-CLIENT-VERSION": "1.0.0",
} as const;

export const CLINE_FREE_DEFAULTS = {
  targetLanguage: "ar",
  maxRetries: 2,
  retryBackoffMs: 500,
  workers: 100,
  batchSize: 50,
  temperature: 0,
} as const;

export const CLINE_THINKING_DISABLED_EFFORT = "none" as const;

export function formatClineBearer(accessToken: string): string {
  const token = accessToken.trim();
  return token.toLowerCase().startsWith("workos:") ? token : `workos:${token}`;
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
