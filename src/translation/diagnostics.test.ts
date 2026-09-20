import { expect, test } from "bun:test";
import { redactText, redactValue, secretsFromApiKey } from "./diagnostics.ts";

test("redacts API keys and authorization fields", () => {
  const secrets = secretsFromApiKey("workos:super-secret-token");
  expect(secrets).toEqual(["workos:super-secret-token", "super-secret-token"]);
  expect(redactText("Bearer workos:super-secret-token leaked", secrets)).toBe("Bearer [redacted] leaked");
  expect(
    redactValue(
      {
        Authorization: "Bearer workos:super-secret-token",
        api_key: "workos:super-secret-token",
        url: "https://api.cline.bot/api/v1/chat/completions",
        nested: { token: "keep-structure", note: "super-secret-token" },
      },
      secrets,
    ),
  ).toEqual({
    Authorization: "[redacted]",
    api_key: "[redacted]",
    url: "https://api.cline.bot/api/v1/chat/completions",
    nested: { token: "[redacted]", note: "[redacted]" },
  });
});

test("does not invent a secret from an empty key", () => {
  expect(secretsFromApiKey("   ")).toEqual([]);
  expect(redactText("workos:visible-only-if-configured", [])).toBe("workos:visible-only-if-configured");
});
