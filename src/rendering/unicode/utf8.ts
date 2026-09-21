import { RenderingError } from "../errors.ts";

export function decodeUtf8(text: string | Uint8Array): number[] {
  if (typeof text === "string") {
    const codepoints: number[] = [];
    for (let i = 0; i < text.length; ) {
      const cp = text.codePointAt(i);
      if (cp === undefined) {
        break;
      }
      if (cp >= 0xd800 && cp <= 0xdfff) {
        throw new RenderingError("invalid UTF-8 codepoint: surrogate", "INVALID_UTF8");
      }
      if (cp > 0x10ffff) {
        throw new RenderingError("invalid UTF-8 codepoint: out of range", "INVALID_UTF8");
      }
      codepoints.push(cp);
      i += cp > 0xffff ? 2 : 1;
    }
    return codepoints;
  }

  const codepoints: number[] = [];
  let offset = 0;
  while (offset < text.length) {
    const first = text[offset];
    if (first === undefined) break;

    if (first < 0x80) {
      codepoints.push(first);
      offset += 1;
      continue;
    }

    let count = 0;
    let value = 0;
    let minimum = 0;

    if ((first & 0xe0) === 0xc0) {
      count = 2;
      value = first & 0x1f;
      minimum = 0x80;
    } else if ((first & 0xf0) === 0xe0) {
      count = 3;
      value = first & 0x0f;
      minimum = 0x800;
    } else if ((first & 0xf8) === 0xf0) {
      count = 4;
      value = first & 0x07;
      minimum = 0x10000;
    } else {
      throw new RenderingError("invalid UTF-8 leading byte", "INVALID_UTF8");
    }

    if (offset + count > text.length) {
      throw new RenderingError("truncated UTF-8 sequence", "INVALID_UTF8");
    }

    for (let i = 1; i < count; i += 1) {
      const byte = text[offset + i];
      if (byte === undefined || (byte & 0xc0) !== 0x80) {
        throw new RenderingError("invalid UTF-8 continuation byte", "INVALID_UTF8");
      }
      value = (value << 6) | (byte & 0x3f);
    }

    offset += count;

    if (value < minimum || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
      throw new RenderingError("invalid UTF-8 codepoint", "INVALID_UTF8");
    }

    codepoints.push(value);
  }

  return codepoints;
}

export function encodeUtf8(codepointOrList: number | readonly number[]): string {
  if (typeof codepointOrList === "number") {
    if (
      !Number.isInteger(codepointOrList) ||
      codepointOrList < 0 ||
      codepointOrList > 0x10ffff ||
      (codepointOrList >= 0xd800 && codepointOrList <= 0xdfff)
    ) {
      throw new RenderingError("cannot encode invalid Unicode codepoint", "INVALID_CODEPOINT");
    }
    return String.fromCodePoint(codepointOrList);
  }

  let result = "";
  for (const cp of codepointOrList) {
    if (
      !Number.isInteger(cp) ||
      cp < 0 ||
      cp > 0x10ffff ||
      (cp >= 0xd800 && cp <= 0xdfff)
    ) {
      throw new RenderingError("cannot encode invalid Unicode codepoint", "INVALID_CODEPOINT");
    }
    result += String.fromCodePoint(cp);
  }
  return result;
}

export function unicodeWhitespace(cp: number): boolean {
  if (
    (cp >= 0x0009 && cp <= 0x000d) ||
    cp === 0x0020 ||
    cp === 0x0085 ||
    cp === 0x00a0 ||
    cp === 0x1680 ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    cp === 0x202f ||
    cp === 0x205f ||
    cp === 0x3000
  ) {
    return true;
  }
  return cp >= 0x2000 && cp <= 0x200a;
}

export function splitWhitespace(text: string): string[] {
  const codepoints = decodeUtf8(text);
  const tokens: string[] = [];
  let current: number[] = [];

  for (const cp of codepoints) {
    if (unicodeWhitespace(cp)) {
      if (current.length > 0) {
        tokens.push(encodeUtf8(current));
        current = [];
      }
    } else {
      current.push(cp);
    }
  }

  if (current.length > 0) {
    tokens.push(encodeUtf8(current));
  }

  return tokens;
}
