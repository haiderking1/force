// Values below come from the installed cline-free extension, not from the Pi model id.
export const CLINE_FREE_PROVIDER = "cline-free" as const;
export const CLINE_FREE_MODEL = "cline-free/deepseek-v4.1-flash";

export const CLINE_FREE_HEADERS = {
  "HTTP-Referer": "https://cline.bot",
  "X-Title": "Cline",
  "X-IS-MULTIROOT": "false",
  "X-CLIENT-TYPE": "cline-desktop",
  "X-CLIENT-VERSION": "1.0.0",
} as const;

export {
  CLINE_BASE_URL as CLINE_FREE_BASE_URL,
  CLINE_COMPLETIONS_PATH as CLINE_FREE_COMPLETIONS_PATH,
  CLINE_DEFAULTS as CLINE_FREE_DEFAULTS,
  CLINE_THINKING_DISABLED_EFFORT,
  applyClineThinkingDisabled,
  formatClineBearer,
} from "../cline-common/contract.ts";
