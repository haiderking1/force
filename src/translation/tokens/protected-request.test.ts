import { expect, test } from "bun:test";
import { protectRequest } from "./protected-request.ts";

const source = String.raw`Oh /bleep/fucking/bleep/ /bleep/bastards/bleep? \"quote\" \n %i`;
function fixture(text = source) {
  return protectRequest({ targetLanguage: "Arabic", items: [{ id: "line", text }], placeholders: ["/bleep/", "%i"] });
}
test("protected tokens round-trip exact bytes including malformed game suffix", () => {
  const protectedRequest = fixture();
  const result = protectedRequest.restore({ translations: protectedRequest.request.items });
  expect(result.translations).toEqual([{ id: "line", text: source }]);
  expect(protectedRequest.request.items[0]?.text).not.toContain("/bleep");
  expect(protectedRequest.request.items[0]?.text).not.toContain(String.raw`\n`);
});
test("visible prose can translate without exposing engine markers", () => {
  const protectedRequest = fixture("Hello /bleep/world/bleep/!");
  const translated = protectedRequest.request.items.map(item => ({ ...item, text: item.text.replace("Hello", "مرحبا").replace("world", "عالم") }));
  expect(protectedRequest.restore({ translations: translated }).translations[0]?.text).toBe("مرحبا /bleep/عالم/bleep/!");
});
test("missing duplicated reordered or invented protected markers are rejected", () => {
  const protectedRequest = fixture("a /bleep/b/bleep/");
  const [first, second] = protectedRequest.request.placeholders;
  if (!first || !second) throw Error("Expected two markers");
  for (const text of [first, first + first + second, second + first, first + second + "__FORCE_TOKEN_999__"]) {
    expect(() => protectedRequest.restore({ translations: [{ id: "line", text }] })).toThrow();
  }
});
test("source sentinel collisions cannot be mistaken for generated markers", () => {
  const protectedRequest = fixture("__FORCE_TOKEN_0__ /bleep/");
  expect(protectedRequest.restore({ translations: protectedRequest.request.items }).translations[0]?.text).toBe("__FORCE_TOKEN_0__ /bleep/");
});
test("overlapping explicit tokens are protected longest-first", () => {
  const protectedRequest = protectRequest({ targetLanguage: "Arabic", items: [{ id: "x", text: "%item %i" }], placeholders: ["%i", "%item"] });
  expect(protectedRequest.restore({ translations: protectedRequest.request.items }).translations[0]?.text).toBe("%item %i");
});
