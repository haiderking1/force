import { PatchError } from "../errors.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function encodeBuddhaQuoted(text: string): Uint8Array {
  let escaped = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"" && (index === 0 || text[index - 1] !== "\\")) {
      escaped += "\\\"";
    } else {
      escaped += char;
    }
  }
  return encoder.encode(`"${escaped}"`);
}

export function decodeBuddhaQuoted(bytes: Uint8Array, start: number): { readonly text: string; readonly end: number } {
  if (bytes[start] !== 0x22) {
    throw new PatchError("RESOURCE", `Expected quoted string at ${start}`);
  }
  let offset = start + 1;
  while (offset < bytes.length) {
    const value = bytes[offset];
    if (value === 0x22) {
      const inner = bytes.subarray(start + 1, offset);
      let text: string;
      try {
        text = decoder.decode(inner);
      } catch {
        throw new PatchError("RESOURCE", `Quoted string at ${start} is not valid UTF-8`);
      }
      return { text, end: offset + 1 };
    }
    if (value === 0x5c && offset + 1 < bytes.length) {
      offset += 2;
      continue;
    }
    offset += 1;
  }
  throw new PatchError("RESOURCE", `Unterminated quoted string at ${start}`);
}

export function decodeBuddhaUnquoted(bytes: Uint8Array, start: number): { readonly text: string; readonly end: number } {
  let offset = start;
  while (offset < bytes.length) {
    const value = bytes[offset];
    if (
      value === 0x3b ||
      value === 0x2c ||
      value === 0x7d ||
      value === 0x5d ||
      value === 0x7b ||
      value === 0x5b
    ) {
      break;
    }
    offset += 1;
  }
  let text: string;
  try {
    text = decoder.decode(bytes.subarray(start, offset)).trimEnd();
  } catch {
    throw new PatchError("RESOURCE", `Unquoted string at ${start} is not valid UTF-8`);
  }
  return { text, end: offset };
}
