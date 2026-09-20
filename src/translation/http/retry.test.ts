import { expect, test } from "bun:test";
import { isRetryableStatus, parseRetryAfterMs, retryDelayMs } from "./retry.ts";

test("retries the transient statuses Ara uses plus HTTP 500", () => {
  expect(isRetryableStatus(429)).toBe(true);
  expect(isRetryableStatus(500)).toBe(true);
  expect(isRetryableStatus(502)).toBe(true);
  expect(isRetryableStatus(503)).toBe(true);
  expect(isRetryableStatus(504)).toBe(true);
  expect(isRetryableStatus(529)).toBe(true);
  expect(isRetryableStatus(401)).toBe(false);
  expect(isRetryableStatus(400)).toBe(false);
  expect(isRetryableStatus(404)).toBe(false);
});

test("parses Retry-After as seconds or an HTTP date", () => {
  expect(parseRetryAfterMs("2")).toBe(2000);
  expect(parseRetryAfterMs("0")).toBe(0);
  expect(parseRetryAfterMs("nope")).toBeUndefined();
  expect(parseRetryAfterMs(null)).toBeUndefined();
  const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
  expect(parseRetryAfterMs("Wed, 21 Oct 2015 07:28:03 GMT", now)).toBe(3000);
  expect(parseRetryAfterMs("Wed, 21 Oct 2015 07:27:00 GMT", now)).toBe(0);
});

test("prefers Retry-After over exponential backoff", () => {
  expect(retryDelayMs(5, 2)).toBe(20);
  expect(retryDelayMs(5, 2, "3")).toBe(3000);
  expect(retryDelayMs(5, 2, "bogus")).toBe(20);
});
