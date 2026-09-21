import type { Line } from "../types.ts";
import { decodeUtf8 } from "../unicode/utf8.ts";
import { lineBreakLength } from "../unicode/newlines.ts";
import { validateCharacter, validateWords } from "../unicode/categories.ts";

export function validateSource(paragraphs: readonly Line[]): void {
  for (const line of paragraphs) {
    for (const ch of line.chars) {
      if (ch.reservedAdvance === undefined) {
        validateCharacter(ch.codepoint);
      }
    }
    validateWords(line);
  }
}

export function plainSource(text: string): Line[] {
  const paragraphs: Line[] = [{ chars: [], breakStyles: [], newline: false }];
  const codepoints = decodeUtf8(text);

  for (let i = 0; i < codepoints.length; ) {
    const breakLen = lineBreakLength(codepoints, i);
    if (breakLen > 0) {
      const last = paragraphs[paragraphs.length - 1];
      if (last) {
        paragraphs[paragraphs.length - 1] = {
          chars: last.chars,
          breakStyles: last.breakStyles,
          newline: true,
        };
      }
      paragraphs.push({ chars: [], breakStyles: [], newline: false });
      i += breakLen;
      continue;
    }

    const cp = codepoints[i];
    if (cp === undefined) {
      break;
    }
    const last = paragraphs[paragraphs.length - 1];
    if (last) {
      paragraphs[paragraphs.length - 1] = {
        chars: [...last.chars, { codepoint: cp, styles: [] }],
        breakStyles: last.breakStyles,
        newline: last.newline,
      };
    }
    i += 1;
  }

  validateSource(paragraphs);
  return paragraphs;
}
