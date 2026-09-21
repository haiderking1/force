import { describe, expect, it } from "bun:test";
import { RenderingError, TokenSyntaxError } from "../errors.ts";
import { Shaper } from "../font/shaper.ts";
import { measureLineAdvance } from "../layout/measure.ts";
import { prepareGameLines, tokenizeGameSyntax } from "./tokens.ts";
import { classifyBrace } from "./markup.ts";

const FONT_PATH = "assets/fonts/force.ttf";

function paragraphText(paragraphs: readonly { chars: readonly { codepoint: number }[] }[]): string {
  return (
    paragraphs[0]?.chars
      .map((ch) => String.fromCodePoint(ch.codepoint))
      .join("") ?? ""
  );
}

describe("Game Syntax and Token Protection", () => {
  it("identifies printf tokens, bindings, brackets, braces, and buttons", () => {
    const text = "Score: %i | Press /bleep/ to jump! [player] {b}WIN{/b} _BTN_A_";
    const tokens = tokenizeGameSyntax(text);

    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toContain("printf");
    expect(kinds).toContain("binding");
    expect(kinds).toContain("bracket");
    expect(kinds).toContain("brace");
    expect(kinds).toContain("button");

    const printfToken = tokens.find((t) => t.kind === "printf");
    expect(printfToken?.raw).toBe("%i");
    expect(printfToken?.isDynamic).toBe(true);

    const bindingToken = tokens.find((t) => t.kind === "binding");
    expect(bindingToken?.raw).toBe("/bleep/");
    expect(bindingToken?.direction).toBe("ltr");
  });

  it("preserves literal \\n as characters when expandLiteralEscapes is false", () => {
    const text = "Line1\\nLine2";
    const { paragraphs } = prepareGameLines(text, { expandLiteralEscapes: false });
    // Single line containing literal backslash and n
    expect(paragraphs.length).toBe(1);
    const chars = paragraphs[0]?.chars.map((c) => String.fromCodePoint(c.codepoint)).join("");
    expect(chars).toBe("Line1\\nLine2");
  });

  it("splits at literal \\n when expandLiteralEscapes is true", () => {
    const text = "Line1\\nLine2";
    const { paragraphs } = prepareGameLines(text, { expandLiteralEscapes: true });
    expect(paragraphs.length).toBe(2);
  });

  it("preserves malformed source spelling without crashing or modifying", () => {
    const malformed = "Broken % not a token {unclosed tag [unclosed bracket";
    const tokens = tokenizeGameSyntax(malformed);
    let reconstructed = "";
    for (const t of tokens) {
      reconstructed += t.raw;
    }
    expect(reconstructed).toBe(malformed);
  });

  it("emits diagnostic warning for unresolved dynamic placeholders when configured", () => {
    const text = "Hello %s, welcome!";
    const { diagnostics } = prepareGameLines(text, {
      placeholderPolicy: { mode: "unresolved-diagnostic", severity: "warning" },
    });
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]?.code).toBe("UNRESOLVED_DYNAMIC_PLACEHOLDER");
  });

  it("substitutes sample text for dynamic placeholders when configured", () => {
    const text = "Hello %s!";
    const { paragraphs } = prepareGameLines(text, {
      placeholderPolicy: { mode: "sample-text", sample: "Hero" },
    });
    const chars = paragraphs[0]?.chars.map((c) => String.fromCodePoint(c.codepoint)).join("");
    expect(chars).toBe("Hello Hero!");
  });

  it("reserves distinct font-unit widths for %i instead of substituting one space", () => {
    const shaper = Shaper.open(FONT_PATH);
    const ten = prepareGameLines("X%iY", {
      placeholderPolicy: { mode: "fixed-width", width: 10 },
    });
    const fat = prepareGameLines("X%iY", {
      placeholderPolicy: { mode: "fixed-width", width: 300 },
    });

    const tenSlot = ten.paragraphs[0]?.chars[1];
    const fatSlot = fat.paragraphs[0]?.chars[1];
    expect(tenSlot?.reservedAdvance).toBe(10);
    expect(fatSlot?.reservedAdvance).toBe(300);
    expect(tenSlot?.codepoint).toBe(0xfffc);
    expect(fatSlot?.codepoint).toBe(0xfffc);

    const tenChars = ten.paragraphs[0]?.chars ?? [];
    const fatChars = fat.paragraphs[0]?.chars ?? [];
    expect(measureLineAdvance(shaper, fatChars, "ltr") - measureLineAdvance(shaper, tenChars, "ltr")).toBe(
      290,
    );

    expect(() =>
      prepareGameLines("%i", { placeholderPolicy: { mode: "fixed-width", width: 0 } }),
    ).toThrow(RenderingError);
    expect(() =>
      prepareGameLines("%i", { placeholderPolicy: { mode: "fixed-width", width: 10.5 } }),
    ).toThrow(RenderingError);
  });

  it("treats numbered braces as placeholders so A{0}B keeps A and B", () => {
    const tokens = tokenizeGameSyntax("A{0}B");
    expect(tokens.map((t) => ({ kind: t.kind, raw: t.raw, isDynamic: t.isDynamic }))).toEqual([
      { kind: "text", raw: "A", isDynamic: false },
      { kind: "brace", raw: "{0}", isDynamic: true },
      { kind: "text", raw: "B", isDynamic: false },
    ]);
    expect(classifyBrace("{0}")).toEqual({ kind: "placeholder" });
    expect(classifyBrace("{12}")).toEqual({ kind: "placeholder" });
    expect(classifyBrace("{b}")).toEqual({ kind: "open", name: "b" });

    const sampled = prepareGameLines("A{0}B", {
      placeholderPolicy: { mode: "sample-text", sample: "Z" },
    });
    expect(paragraphText(sampled.paragraphs)).toBe("AZB");

    const unresolved = prepareGameLines("A{0}B");
    expect(paragraphText(unresolved.paragraphs)).toBe("AB");
    expect(unresolved.diagnostics).toEqual([
      expect.objectContaining({
        level: "warning",
        code: "UNRESOLVED_DYNAMIC_PLACEHOLDER",
      }),
    ]);
  });

  it("rejects mismatched and unclosed markup tags", () => {
    expect(() => prepareGameLines("{b}hello{/color}")).toThrow(TokenSyntaxError);
    try {
      prepareGameLines("{b}hello{/color}");
      expect.unreachable("mismatched tags must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenSyntaxError);
      expect((error as TokenSyntaxError).code).toBe("MISMATCHED_MARKUP_TAG");
    }

    try {
      prepareGameLines("{b}hello");
      expect.unreachable("unclosed tags must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenSyntaxError);
      expect((error as TokenSyntaxError).code).toBe("UNCLOSED_MARKUP_TAG");
    }

    try {
      prepareGameLines("hello{/b}");
      expect.unreachable("unmatched close must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenSyntaxError);
      expect((error as TokenSyntaxError).code).toBe("UNMATCHED_CLOSING_TAG");
    }

    const paired = prepareGameLines("{b}hello{/b}");
    expect(paragraphText(paired.paragraphs)).toBe("hello");
    expect(paired.paragraphs[0]?.chars[0]?.styles).toEqual([1]);

    const named = prepareGameLines("{color=red}hello{/color}");
    expect(paragraphText(named.paragraphs)).toBe("hello");
    expect(named.paragraphs[0]?.chars[0]?.styles).toEqual([1]);
  });

  it("treats CR and CRLF as line breaks instead of unsupported characters", () => {
    const crlf = prepareGameLines("A\r\nB");
    expect(crlf.paragraphs.length).toBe(2);
    expect(paragraphText([crlf.paragraphs[0] ?? { chars: [] }])).toBe("A");
    expect(crlf.paragraphs[0]?.newline).toBe(true);
    expect(paragraphText([crlf.paragraphs[1] ?? { chars: [] }])).toBe("B");

    const cr = prepareGameLines("A\rB");
    expect(cr.paragraphs.length).toBe(2);
    expect(paragraphText([cr.paragraphs[0] ?? { chars: [] }])).toBe("A");
    expect(paragraphText([cr.paragraphs[1] ?? { chars: [] }])).toBe("B");

    const lf = prepareGameLines("A\nB");
    expect(lf.paragraphs.length).toBe(2);
    expect(paragraphText([lf.paragraphs[0] ?? { chars: [] }])).toBe("A");
    expect(paragraphText([lf.paragraphs[1] ?? { chars: [] }])).toBe("B");
  });

  it("emits an unknown-width diagnostic for %i when no measurement policy is set", () => {
    const shaper = Shaper.open(FONT_PATH);
    const missing = prepareGameLines("Score: %i!");
    expect(paragraphText(missing.paragraphs)).toBe("Score: !");
    expect(missing.diagnostics).toEqual([
      expect.objectContaining({
        level: "warning",
        code: "UNRESOLVED_DYNAMIC_PLACEHOLDER",
        message: "Dynamic placeholder %i has unknown display width",
      }),
    ]);

    const literal = prepareGameLines("Score: !");
    const asText = prepareGameLines("Score: %i!", {
      placeholderPolicy: { mode: "sample-text", sample: "%i" },
    });
    const missingWidth = measureLineAdvance(shaper, missing.paragraphs[0]?.chars ?? [], "ltr");
    const literalWidth = measureLineAdvance(shaper, literal.paragraphs[0]?.chars ?? [], "ltr");
    const asTextWidth = measureLineAdvance(shaper, asText.paragraphs[0]?.chars ?? [], "ltr");
    expect(missingWidth).toBe(literalWidth);
    expect(asTextWidth).toBeGreaterThan(missingWidth);
  });
});
