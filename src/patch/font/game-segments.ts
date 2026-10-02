import type { Shaper } from "../../rendering/font/shaper.ts";
import type { Character, LayoutDiagnostic, Line } from "../../rendering/types.ts";
import { classifyBrace } from "../../rendering/syntax/markup.ts";
import { tokenizeGameSyntax, type GameSyntaxToken } from "../../rendering/syntax/tokens.ts";
import { lineBreakLengthInString } from "../../rendering/unicode/newlines.ts";
import { PatchError } from "../errors.ts";

const OBJECT_REPLACEMENT = 0xfffc;

export type GameSegmentKind = "display" | "token";

export type GameSegment = {
  readonly kind: GameSegmentKind;
  readonly raw: string;
  readonly tokenKind?: GameSyntaxToken["kind"];
};

export function isOperativeToken(token: GameSyntaxToken): boolean {
  if (token.kind === "text" || token.kind === "escape") {
    return false;
  }
  if (token.kind === "brace" && !token.isDynamic) {
    return true;
  }
  return token.kind === "binding" || token.kind === "button" || token.kind === "printf" ||
    token.kind === "bracket" || token.isDynamic;
}

export function splitGameSegments(text: string): readonly GameSegment[] {
  const tokens = tokenizeGameSyntax(text);
  const segments: GameSegment[] = [];
  let display = "";
  const flushDisplay = (): void => {
    if (display.length === 0) {
      return;
    }
    segments.push({ kind: "display", raw: display });
    display = "";
  };
  for (const token of tokens) {
    if (token.kind === "escape") {
      if (token.raw === "\\n") {
        display += "\n";
      } else if (token.raw === "\\r") {
        display += "\r";
      } else if (token.raw === "\\t") {
        display += "\t";
      } else if (token.raw === '\\"') {
        display += '"';
      } else if (token.raw === "\\\\") {
        display += "\\";
      } else {
        display += token.raw;
      }
      continue;
    }
    if (isOperativeToken(token)) {
      flushDisplay();
      segments.push({ kind: "token", raw: token.raw, tokenKind: token.kind });
      continue;
    }
    display += token.raw;
  }
  flushDisplay();
  return segments;
}

export function reservedAdvanceForToken(shaper: Shaper, token: GameSegment): number {
  const upem = shaper.unitsPerEm();
  if (token.tokenKind === "binding" && token.raw === "/bleep/") {
    return Math.round(upem * 0.55);
  }
  if (token.tokenKind === "binding" || token.tokenKind === "button") {
    return Math.round(upem * 1.6);
  }
  if (token.tokenKind === "printf" || token.tokenKind === "bracket") {
    return Math.round(upem * 2);
  }
  if (token.tokenKind === "brace") {
    const role = classifyBrace(token.raw);
    if (role.kind === "placeholder") {
      return Math.round(upem * 2);
    }
    return 0;
  }
  return shaper.shape(token.raw, "ltr").advance();
}

function currentParagraph(paragraphs: Line[]): Line {
  const current = paragraphs[paragraphs.length - 1];
  if (current === undefined) {
    throw new PatchError("VALIDATION", "Game text paragraph list is empty");
  }
  return current;
}

function emitDisplay(content: string, paragraphs: Line[]): void {
  for (let index = 0; index < content.length; ) {
    const code = content.codePointAt(index);
    if (code === undefined) {
      break;
    }
    const breakLen = lineBreakLengthInString(content, index, code);
    if (breakLen > 0) {
      const current = currentParagraph(paragraphs);
      paragraphs[paragraphs.length - 1] = { chars: current.chars, breakStyles: [], newline: true };
      paragraphs.push({ chars: [], breakStyles: [], newline: false });
      index += breakLen;
      continue;
    }
    const displayCode = code === 0x0009 ? 0x0020 : code;
    const current = currentParagraph(paragraphs);
    paragraphs[paragraphs.length - 1] = {
      chars: [...current.chars, { codepoint: displayCode, styles: [] }],
      breakStyles: current.breakStyles,
      newline: current.newline,
    };
    index += code > 0xffff ? 2 : 1;
  }
}

function emitToken(token: GameSegment, advance: number, paragraphs: Line[]): void {
  const current = currentParagraph(paragraphs);
  const reserved: Character = {
    codepoint: OBJECT_REPLACEMENT,
    styles: [],
    reservedAdvance: advance,
    tokenRaw: token.raw,
  };
  paragraphs[paragraphs.length - 1] = {
    chars: [...current.chars, reserved],
    breakStyles: current.breakStyles,
    newline: current.newline,
  };
}

export function prepareGameSegments(
  text: string,
  shaper: Shaper,
): { readonly paragraphs: Line[]; readonly diagnostics: LayoutDiagnostic[]; readonly tokens: readonly GameSegment[] } {
  const segments = splitGameSegments(text);
  const paragraphs: Line[] = [{ chars: [], breakStyles: [], newline: false }];
  for (const segment of segments) {
    if (segment.kind === "token") {
      emitToken(segment, reservedAdvanceForToken(shaper, segment), paragraphs);
      continue;
    }
    emitDisplay(segment.raw, paragraphs);
  }
  return { paragraphs, diagnostics: [], tokens: segments.filter((segment) => segment.kind === "token") };
}
