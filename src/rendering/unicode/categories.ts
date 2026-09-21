import { UnsupportedCharacterError, RenderingError } from "../errors.ts";
import type { Line } from "../types.ts";

export type JoiningType = "U" | "R" | "D" | "C" | "T" | "L" | "G";

export function isWordPart(cp: number): boolean {
  if (cp < 0 || cp > 0x10ffff) return false;
  const str = String.fromCodePoint(cp);
  return /\p{L}|\p{M}/u.test(str);
}

export function isCombiningMark(cp: number): boolean {
  if (cp < 0 || cp > 0x10ffff) return false;
  const str = String.fromCodePoint(cp);
  return /\p{M}/u.test(str);
}

export function getJoiningType(cp: number): JoiningType {
  // Join-causing: ZWJ (U+200D), Tatweel (U+0640)
  if (cp === 0x200d || cp === 0x0640) {
    return "C";
  }
  // Non-joining: ZWNJ (U+200C)
  if (cp === 0x200c) {
    return "U";
  }

  // Arabic combining marks (Tashkeel) are Transparent (T)
  if (
    (cp >= 0x0610 && cp <= 0x061a) ||
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06dc) ||
    (cp >= 0x06df && cp <= 0x06e4) ||
    (cp >= 0x06e7 && cp <= 0x06e8) ||
    (cp >= 0x06ea && cp <= 0x06ed) ||
    (cp >= 0x08d3 && cp <= 0x08e1) ||
    (cp >= 0x08e3 && cp <= 0x08ff)
  ) {
    return "T";
  }

  // Non-spacing marks in general are Transparent if in cursive blocks
  if (isCombiningMark(cp)) {
    return "T";
  }

  // Arabic primary letters
  // Right-joining Arabic letters (cannot join to the left):
  // Alef with various marks (0622, 0623, 0625, 0627), Waw with Hamza (0624),
  // Teh Marbuta (0629), Dal (062f), Thal (0630), Reh (0631), Zain (0632),
  // Waw (0648), Yeh Barree (06d2-06d3), Ae (06d5), etc.
  if (
    cp === 0x0622 ||
    cp === 0x0623 ||
    cp === 0x0624 ||
    cp === 0x0625 ||
    cp === 0x0627 ||
    cp === 0x0629 ||
    cp === 0x062f ||
    cp === 0x0630 ||
    cp === 0x0631 ||
    cp === 0x0632 ||
    cp === 0x0648 ||
    cp === 0x0671 ||
    cp === 0x0672 ||
    cp === 0x0673 ||
    cp === 0x0675 ||
    cp === 0x0676 ||
    cp === 0x0677 ||
    (cp >= 0x0688 && cp <= 0x0699) ||
    (cp >= 0x06c4 && cp <= 0x06cb) ||
    cp === 0x06cd ||
    cp === 0x06cf ||
    (cp >= 0x06d2 && cp <= 0x06d3) ||
    cp === 0x06d5 ||
    (cp >= 0x06ee && cp <= 0x06ef)
  ) {
    return "R";
  }

  // Dual-joining Arabic letters:
  // Beh (0626), Teh (062a), Theh (062b), Jeem (062c), Hah (062d), Khah (062e),
  // Seen (0633), Sheen (0634), Sad (0635), Dad (0636), Tah (0637), Zah (0638),
  // Ain (0639), Ghain (063a), Feh (0641), Qaf (0642), Kaf (0643), Lam (0644),
  // Meem (0645), Noon (0646), Heh (0647), Yeh (064a), etc.
  if (
    (cp >= 0x0626 && cp <= 0x062e && cp !== 0x0627 && cp !== 0x0629) ||
    (cp >= 0x0633 && cp <= 0x063f) ||
    (cp >= 0x0641 && cp <= 0x0647) ||
    (cp >= 0x0649 && cp <= 0x064a) ||
    (cp >= 0x066e && cp <= 0x066f) ||
    (cp >= 0x0678 && cp <= 0x0687) ||
    (cp >= 0x069a && cp <= 0x06bf) ||
    (cp >= 0x06cc && cp <= 0x06ce) ||
    (cp >= 0x06d0 && cp <= 0x06d1) ||
    (cp >= 0x06fa && cp <= 0x06fc) ||
    cp === 0x06ff ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08c7) ||
    (cp >= 0x08c9 && cp <= 0x08d2) ||
    (cp >= 0x0870 && cp <= 0x088e) ||
    (cp >= 0x0898 && cp <= 0x089f) ||
    (cp >= 0xfb50 && cp <= 0xfd3d) ||
    (cp >= 0xfd50 && cp <= 0xfdfb) ||
    (cp >= 0xfe70 && cp <= 0xfefc)
  ) {
    return "D";
  }

  // Syriac cursive joining
  if ((cp >= 0x0710 && cp <= 0x072f) || (cp >= 0x074d && cp <= 0x074f)) {
    return "D";
  }

  // N'Ko cursive joining
  if ((cp >= 0x07ca && cp <= 0x07ea) || cp === 0x07fa) {
    return "D";
  }

  return "U";
}

export function isCursiveJoining(cp: number): boolean {
  const type = getJoiningType(cp);
  return type === "R" || type === "D" || type === "C" || type === "L";
}

export function validateCharacter(cp: number): void {
  if (cp === 0x20 || cp === 0x0a) {
    return;
  }

  if (
    cp === 0x034f ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  ) {
    throw new UnsupportedCharacterError(
      "layout: unsupported spacing, control or invisible character",
    );
  }

  if (cp < 0 || cp > 0x10ffff) {
    throw new UnsupportedCharacterError(
      "layout: unsupported spacing, control or invisible character",
    );
  }

  const str = String.fromCodePoint(cp);
  if (/\p{C}|\p{Z}/u.test(str)) {
    throw new UnsupportedCharacterError(
      "layout: unsupported spacing, control or invisible character",
    );
  }
}

export function stylesEqual(
  a: readonly number[],
  b: readonly number[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function validateWords(line: Line): void {
  const chars = line.chars;
  for (let begin = 0; begin < chars.length; ) {
    const firstChar = chars[begin];
    if (firstChar === undefined || !isWordPart(firstChar.codepoint)) {
      begin += 1;
      continue;
    }

    let end = begin;
    let joining = false;
    let styleChange = false;

    while (end < chars.length) {
      const charAtEnd = chars[end];
      if (charAtEnd === undefined || !isWordPart(charAtEnd.codepoint)) {
        break;
      }

      joining = joining || isCursiveJoining(charAtEnd.codepoint);
      styleChange = styleChange || !stylesEqual(charAtEnd.styles, firstChar.styles);

      if (isCombiningMark(charAtEnd.codepoint)) {
        const prevChar = end > 0 ? chars[end - 1] : undefined;
        if (
          end === begin ||
          prevChar === undefined ||
          !stylesEqual(charAtEnd.styles, prevChar.styles)
        ) {
          throw new RenderingError(
            "layout: detached or separately styled combining mark",
            "DETACHED_COMBINING_MARK",
          );
        }
      }

      end += 1;
    }

    if (joining && styleChange) {
      throw new RenderingError(
        "layout: joining word crosses a style boundary",
        "JOINING_WORD_STYLE_BOUNDARY",
      );
    }

    begin = end;
  }
}
