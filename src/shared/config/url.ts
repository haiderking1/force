export function parseBaseUrl(
  value: string,
  fallback: string,
  name: string,
  issues: string[],
): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      issues.push(`${name} must be an http or https URL`);
      return fallback;
    }
    if (url.username.length > 0 || url.password.length > 0) {
      issues.push(`${name} must not include credentials`);
      return fallback;
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    issues.push(`${name} must be an absolute URL`);
    return fallback;
  }
}
