export const CLINE_PASS_PROVIDER = "cline-pass" as const;
export const CLINE_PASS_MODEL = "cline-pass/deepseek-v4.1-flash";

export function isClinePassModel(model: string): boolean {
  return /^cline-pass\/[A-Za-z0-9_.:/-]+$/.test(model);
}
