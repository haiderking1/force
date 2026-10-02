import { PatchError } from "../errors.ts";
import { parseSwfRect } from "./rect.ts";
import { readU16Le } from "./swf.ts";

export type EditTextAlignment = "left" | "right" | "center" | "justify";

const ALIGN_VALUE: Record<EditTextAlignment, number> = {
  left: 0,
  right: 1,
  center: 2,
  justify: 3,
};

const ALIGN_NAME: Record<number, EditTextAlignment> = {
  0: "left",
  1: "right",
  2: "center",
  3: "justify",
};

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
  readonly align: EditTextAlignment | undefined;
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
  let align: EditTextAlignment | undefined;
  if (hasLayout) {
    const alignByte = data[pos] ?? 0;
    align = ALIGN_NAME[alignByte] ?? "left";
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
    align,
  };
}

export function lineCodeInEditText(edit: DefineEditText): string | undefined {
  const match = /\*([A-Z]{4}[0-9]{3}TEXT)/.exec(edit.initial) ?? /\*([A-Z]{4}[0-9]{3}TEXT)/.exec(edit.variable);
  return match?.[1];
}

export function patchDefineEditTextAlignment(
  data: Uint8Array,
  targetAlign: EditTextAlignment,
): Uint8Array {
  if (data.length < 6) {
    throw new PatchError("GFX", "DefineEditText is shorter than the fixed header");
  }
  const bounds = parseSwfRect(data, 2);
  const flagsPos = 2 + bounds.bytes.length;
  const flags1 = data[flagsPos];
  const flags2 = data[flagsPos + 1];
  if (flags1 === undefined || flags2 === undefined) {
    throw new PatchError("GFX", "DefineEditText flags are missing");
  }

  let pos = flagsPos + 2;
  const hasText = (flags1 & 0x80) !== 0;
  const hasTextColor = (flags1 & 0x04) !== 0;
  const hasMaxLength = (flags1 & 0x02) !== 0;
  const hasFont = (flags1 & 0x01) !== 0;
  const hasFontClass = (flags2 & 0x80) !== 0;
  const hasLayout = (flags2 & 0x20) !== 0;

  if (hasFont) pos += 2;
  if (hasFontClass) {
    while (pos < data.length && data[pos] !== 0) pos += 1;
    pos += 1;
  }
  if (hasFont) pos += 2;
  if (hasTextColor) pos += 4;
  if (hasMaxLength) pos += 2;

  const preLayoutPos = pos;
  let layoutBytes: Uint8Array;
  if (hasLayout) {
    layoutBytes = Uint8Array.from(data.subarray(pos, pos + 9));
    layoutBytes[0] = ALIGN_VALUE[targetAlign];
    pos += 9;
  } else {
    layoutBytes = new Uint8Array(9);
    layoutBytes[0] = ALIGN_VALUE[targetAlign];
  }

  const varStart = pos;
  while (pos < data.length && data[pos] !== 0) pos += 1;
  const varEnd = pos + 1;
  const variableBytes = data.subarray(varStart, varEnd);
  pos = varEnd;

  let initialBytes: Uint8Array;
  if (hasText) {
    const initStart = pos;
    while (pos < data.length && data[pos] !== 0) pos += 1;
    const initialText = new TextDecoder("utf-8").decode(data.subarray(initStart, pos));
    const patchedText = initialText.replace(/<p\s+align="[a-z]+">/gi, `<p align="${targetAlign}">`);
    const encoded = new TextEncoder().encode(patchedText);
    initialBytes = new Uint8Array(encoded.length + 1);
    initialBytes.set(encoded, 0);
    initialBytes[encoded.length] = 0;
  } else {
    initialBytes = new Uint8Array(0);
  }

  const newFlags2 = flags2 | 0x20;
  const prefix = data.subarray(0, flagsPos);
  const betweenFlagsAndLayout = data.subarray(flagsPos + 2, preLayoutPos);

  const chunks: Uint8Array[] = [
    prefix,
    Uint8Array.from([flags1, newFlags2]),
    betweenFlagsAndLayout,
    layoutBytes,
    variableBytes,
  ];
  if (hasText) {
    chunks.push(initialBytes);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const chunk of chunks) {
    out.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return out;
}
