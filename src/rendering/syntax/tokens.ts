import type { Character, LayoutDiagnostic, Line, TokenDirection } from "../types.ts";
import { decodeUtf8 } from "../unicode/utf8.ts";
import { lineBreakLengthInString } from "../unicode/newlines.ts";
import { validateCharacter, validateWords } from "../unicode/categories.ts";
import { RenderingError } from "../errors.ts";
import { classifyBrace, MarkupStack } from "./markup.ts";

export type PlaceholderPolicy =
  | { readonly mode: "fixed-width"; readonly width: number }
  | { readonly mode: "sample-text"; readonly sample: string }
  | { readonly mode: "unresolved-diagnostic"; readonly severity?: "warning" | "error" };

export type GameSyntaxTokenKind =
  | "text"
  | "printf"
  | "binding"
  | "bracket"
  | "brace"
  | "escape"
  | "button";

export type GameSyntaxToken = {
  readonly kind: GameSyntaxTokenKind;
  readonly raw: string;
  readonly isDynamic: boolean;
  readonly direction: TokenDirection;
  readonly range: { readonly start: number; readonly end: number };
};

export type GameSyntaxOptions = {
  readonly placeholderPolicy?: PlaceholderPolicy;
  readonly expandLiteralEscapes?: boolean;
};

const PRINTF_PATTERN =
  /%(?:%|(?:\d+\$)?[-+0#]*(?:\d+|\*)?(?:\.(?:\d+|\*))?(?:hh|h|ll|l|L|z|j|t)?[diuoxXfFeEgGaAcspni])/gy;

const BRACE_TAG_PATTERN = /\{(?:\/)?(?:[A-Za-z_][A-Za-z0-9_.]*|\d+)(?:=[^\s{}]+)?\}/gy;

const BRACKET_PATTERN =
  /\[[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:![A-Za-z0-9_]+)?\]/gy;

const BINDING_SLASH_PATTERN = /\/[A-Za-z_][A-Za-z0-9_]*\//gy;

const UNDERSCORE_BUTTON_PATTERN = /_[A-Z][A-Z0-9]+_/gy;

const OBJECT_REPLACEMENT = 0xfffc;

export function tokenizeGameSyntax(text: string): readonly GameSyntaxToken[] {
  const tokens: GameSyntaxToken[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === "\\" && index + 1 < text.length) {
      const next = text[index + 1];
      if (next === "n" || next === "r" || next === "t" || next === '"' || next === "\\") {
        tokens.push({
          kind: "escape",
          raw: text.slice(index, index + 2),
          isDynamic: false,
          direction: "ltr",
          range: { start: index, end: index + 2 },
        });
        index += 2;
        continue;
      }
    }

    if (text[index] === "%") {
      PRINTF_PATTERN.lastIndex = index;
      const match = PRINTF_PATTERN.exec(text);
      if (match && match.index === index) {
        const raw = match[0];
        tokens.push({
          kind: "printf",
          raw,
          isDynamic: raw !== "%%",
          direction: "ltr",
          range: { start: index, end: index + raw.length },
        });
        index += raw.length;
        continue;
      }
    }

    if (text[index] === "{") {
      BRACE_TAG_PATTERN.lastIndex = index;
      const match = BRACE_TAG_PATTERN.exec(text);
      if (match && match.index === index) {
        const raw = match[0];
        tokens.push({
          kind: "brace",
          raw,
          isDynamic: classifyBrace(raw).kind === "placeholder",
          direction: "ltr",
          range: { start: index, end: index + raw.length },
        });
        index += raw.length;
        continue;
      }
    }

    if (text[index] === "[") {
      BRACKET_PATTERN.lastIndex = index;
      const match = BRACKET_PATTERN.exec(text);
      if (match && match.index === index) {
        const raw = match[0];
        tokens.push({
          kind: "bracket",
          raw,
          isDynamic: true,
          direction: "ltr",
          range: { start: index, end: index + raw.length },
        });
        index += raw.length;
        continue;
      }
    }

    if (text[index] === "/") {
      BINDING_SLASH_PATTERN.lastIndex = index;
      const match = BINDING_SLASH_PATTERN.exec(text);
      if (match && match.index === index) {
        const raw = match[0];
        tokens.push({
          kind: "binding",
          raw,
          isDynamic: false,
          direction: "ltr",
          range: { start: index, end: index + raw.length },
        });
        index += raw.length;
        continue;
      }
    }

    if (text[index] === "_") {
      UNDERSCORE_BUTTON_PATTERN.lastIndex = index;
      const match = UNDERSCORE_BUTTON_PATTERN.exec(text);
      if (match && match.index === index) {
        const raw = match[0];
        tokens.push({
          kind: "button",
          raw,
          isDynamic: false,
          direction: "ltr",
          range: { start: index, end: index + raw.length },
        });
        index += raw.length;
        continue;
      }
    }

    let nextSpecial = index + 1;
    while (nextSpecial < text.length) {
      const ch = text[nextSpecial];
      if (
        ch === "\\" ||
        ch === "%" ||
        ch === "{" ||
        ch === "[" ||
        ch === "/" ||
        ch === "_"
      ) {
        break;
      }
      nextSpecial += 1;
    }

    const raw = text.slice(index, nextSpecial);
    tokens.push({
      kind: "text",
      raw,
      isDynamic: false,
      direction: "ltr",
      range: { start: index, end: nextSpecial },
    });
    index = nextSpecial;
  }

  return tokens;
}

export type PreparedGameLines = {
  readonly paragraphs: Line[];
  readonly diagnostics: LayoutDiagnostic[];
};

function appendChars(paragraphs: Line[], chars: readonly Character[]): void {
  const last = paragraphs[paragraphs.length - 1];
  if (!last) {
    return;
  }
  paragraphs[paragraphs.length - 1] = {
    chars: [...last.chars, ...chars],
    breakStyles: last.breakStyles,
    newline: last.newline,
  };
}

function appendNewline(paragraphs: Line[], styles: readonly number[]): void {
  const last = paragraphs[paragraphs.length - 1];
  if (last) {
    paragraphs[paragraphs.length - 1] = {
      chars: last.chars,
      breakStyles: [...styles],
      newline: true,
    };
  }
  paragraphs.push({ chars: [], breakStyles: [], newline: false });
}

function emitUnresolved(
  token: GameSyntaxToken,
  diagnostics: LayoutDiagnostic[],
  severity: "warning" | "error",
): void {
  diagnostics.push({
    level: severity,
    code: "UNRESOLVED_DYNAMIC_PLACEHOLDER",
    message: `Dynamic placeholder ${token.raw} has unknown display width`,
    range: token.range,
  });
  if (severity === "error") {
    throw new RenderingError(
      `Dynamic placeholder ${token.raw} has unknown display width`,
      "UNRESOLVED_DYNAMIC_PLACEHOLDER",
    );
  }
}

function applyPlaceholder(
  token: GameSyntaxToken,
  policy: PlaceholderPolicy | undefined,
  styles: readonly number[],
  paragraphs: Line[],
  diagnostics: LayoutDiagnostic[],
): void {
  const resolved = policy ?? { mode: "unresolved-diagnostic", severity: "warning" };

  if (resolved.mode === "sample-text") {
    const codepoints = decodeUtf8(resolved.sample);
    appendChars(
      paragraphs,
      codepoints.map((cp) => ({
        codepoint: cp,
        styles: [...styles],
      })),
    );
    return;
  }

  if (resolved.mode === "fixed-width") {
    if (!Number.isSafeInteger(resolved.width) || resolved.width <= 0) {
      throw new RenderingError(
        `fixed placeholder width must be a positive number of font units, got ${resolved.width}`,
        "INVALID_PLACEHOLDER_WIDTH",
      );
    }
    appendChars(paragraphs, [
      {
        codepoint: OBJECT_REPLACEMENT,
        styles: [...styles],
        reservedAdvance: resolved.width,
      },
    ]);
    return;
  }

  emitUnresolved(token, diagnostics, resolved.severity ?? "warning");
}

function emitSourceText(
  content: string,
  styles: readonly number[],
  paragraphs: Line[],
): void {
  for (let i = 0; i < content.length; ) {
    const cp = content.codePointAt(i);
    if (cp === undefined) {
      break;
    }
    const breakLen = lineBreakLengthInString(content, i, cp);
    if (breakLen > 0) {
      appendNewline(paragraphs, styles);
      i += breakLen;
      continue;
    }

    const step = cp > 0xffff ? 2 : 1;
    appendChars(paragraphs, [{ codepoint: cp, styles: [...styles] }]);
    i += step;
  }
}

export function prepareGameLines(
  text: string,
  options: GameSyntaxOptions = {},
): PreparedGameLines {
  const tokens = tokenizeGameSyntax(text);
  const diagnostics: LayoutDiagnostic[] = [];
  const paragraphs: Line[] = [{ chars: [], breakStyles: [], newline: false }];
  const markup = new MarkupStack();

  let currentStyleId = 0;
  const activeStyles: number[] = [];

  for (const token of tokens) {
    if (token.kind === "brace" && !token.isDynamic) {
      markup.apply(token.raw);
      if (token.raw.startsWith("{/")) {
        activeStyles.pop();
      } else {
        currentStyleId += 1;
        activeStyles.push(currentStyleId);
      }
      continue;
    }

    if (token.kind === "escape") {
      if (options.expandLiteralEscapes && token.raw === "\\n") {
        appendNewline(paragraphs, activeStyles);
        continue;
      }

      const codepoints = decodeUtf8(token.raw);
      appendChars(
        paragraphs,
        codepoints.map((cp) => ({
          codepoint: cp,
          styles: [...activeStyles],
        })),
      );
      continue;
    }

    if (token.isDynamic) {
      applyPlaceholder(token, options.placeholderPolicy, activeStyles, paragraphs, diagnostics);
      continue;
    }

    emitSourceText(token.raw, activeStyles, paragraphs);
  }

  markup.finish();

  for (const line of paragraphs) {
    for (const ch of line.chars) {
      if (ch.reservedAdvance === undefined) {
        validateCharacter(ch.codepoint);
      }
    }
    validateWords(line);
  }

  return { paragraphs, diagnostics };
}
