import { expect, test } from "bun:test";
import { JEV_ENV, loadJevConfig } from "./config.ts";
import { JEV_DEFAULT_MODEL } from "./contract.ts";

test("loads Jev defaults without reading the translation key", () => {
  const config = loadJevConfig({
    [JEV_ENV.API_KEY]: " jev-secret ",
    FORCE_TRANSLATION_API_KEY: "cline-only",
  });
  expect(config.apiKey).toBe("jev-secret");
  expect(config.model).toBe(JEV_DEFAULT_MODEL);
  expect(config.concurrency).toBe(4);
  expect(config).not.toHaveProperty("timeoutMs");
});

test("rejects concurrency above the Jev cap", () => {
  expect(() =>
    loadJevConfig({
      [JEV_ENV.API_KEY]: "k",
      [JEV_ENV.CONCURRENCY]: "100",
    }),
  ).toThrow(/between 1 and 16/);
});
