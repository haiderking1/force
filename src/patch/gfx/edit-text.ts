import { PatchError } from "../errors.ts";
import { parseSwfRect } from "./rect.ts";
import { readU16Le } from "./swf.ts";

export type DefineEditText = {
  readonly id: number;
  readonly fontId: number | undefined;
  readonly fontClass: string | undefined;
  readonly fontHeight: number | undefined;
  readonly html: boolean;
  readonly useOutlines: boolean;
  readonly variable: string;
  readonly initial: string;
  readonly fontFace: string | undefined;
};

function readCString(data: Uint8Array, offset: number): { readonly text: string; readonly end: number } {
  let end = offset;
  while (end < data.length && data[end] !== 0) {
    end += 1;
  }
  if (end >= data.length) {
    throw new PatchError("GFX", `DefineEditText string overruns the tag at ${offset}`);
  }
  return {
    text: new TextDecoder("utf-8").decode(data.subarray(offset, end)),
    end: end + 1,
  };
}

export function parseDefineEditText(data: Uint8Array): DefineEditText {
  if (data.length < 6) {
    throw new PatchError("GFX", "DefineEditText is shorter than the fixed header");
  }
  const id = readU16Le(data, 0);
  const bounds = parseSwfRect(data, 2);
  let pos = 2 + bounds.bytes.length;
  const flags1 = data[pos];
  const flags2 = data[pos + 1];
  if (flags1 === undefined || flags2 === undefined) {
    throw new PatchError("GFX", "DefineEditText flags are missing");
  }
  pos += 2;
  const hasText = (flags1 & 0x80) !== 0;
  const hasTextColor = (flags1 & 0x04) !== 0;
  const hasMaxLength = (flags1 & 0x02) !== 0;
  const hasFont = (flags1 & 0x01) !== 0;
  const hasFontClass = (flags2 & 0x80) !== 0;
  const hasLayout = (flags2 & 0x20) !== 0;
  const html = (flags2 & 0x02) !== 0;
  const useOutlines = (flags2 & 0x01) !== 0;
  let fontId: number | undefined;
  let fontClass: string | undefined;
  let fontHeight: number | undefined;
  if (hasFont) {
    fontId = readU16Le(data, pos);
    pos += 2;
  }
  if (hasFontClass) {
    const parsed = readCString(data, pos);
    fontClass = parsed.text;
    pos = parsed.end;
  }
  if (hasFont) {
    fontHeight = readU16Le(data, pos);
    pos += 2;
  }
  if (hasTextColor) {
    pos += 4;
  }
  if (hasMaxLength) {
    pos += 2;
  }
  if (hasLayout) {
    pos += 9;
  }
  const variable = readCString(data, pos);
  pos = variable.end;
  let initial = "";
  if (hasText) {
    initial = readCString(data, pos).text;
  }
  const face = /face="([^"]+)"/.exec(initial);
  return {
    id,
    fontId,
    fontClass,
    fontHeight,
    html,
    useOutlines,
    variable: variable.text,
    initial,
    fontFace: face?.[1],
  };
}

export function lineCodeInEditText(edit: DefineEditText): string | undefined {
  const match = /\*([A-Z]{4}[0-9]{3}TEXT)/.exec(edit.initial) ?? /\*([A-Z]{4}[0-9]{3}TEXT)/.exec(edit.variable);
  return match?.[1];
}
