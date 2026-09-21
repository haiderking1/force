import { PatchError } from "../errors.ts";
import { readU16Le, readU32Le } from "./swf.ts";

export type DefineFont3Info = {
  readonly id: number;
  readonly flags: number;
  readonly language: number;
  readonly name: string;
  readonly glyphCount: number;
  readonly wideOffsets: boolean;
  readonly wideCodes: boolean;
  readonly hasLayout: boolean;
  readonly codes: readonly number[];
  readonly codeMin: number;
  readonly codeMax: number;
  readonly printableAscii: string;
  readonly nonAsciiCodes: readonly number[];
  readonly tagLength: number;
};

function readFontName(data: Uint8Array): { readonly name: string; readonly afterName: number } {
  const nameLen = data[4];
  if (nameLen === undefined || 5 + nameLen + 2 > data.length) {
    throw new PatchError("GFX", "DefineFont3 name overruns the tag");
  }
  const raw = new TextDecoder("ascii").decode(data.subarray(5, 5 + nameLen));
  return { name: raw.replaceAll("\0", ""), afterName: 5 + nameLen };
}

export function parseDefineFont3(data: Uint8Array): DefineFont3Info {
  if (data.length < 8) {
    throw new PatchError("GFX", "DefineFont3 tag is shorter than the fixed header");
  }
  const id = readU16Le(data, 0);
  const flags = data[2];
  const language = data[3];
  if (flags === undefined || language === undefined) {
    throw new PatchError("GFX", "DefineFont3 flags are missing");
  }
  const wideOffsets = (flags & 0x08) !== 0;
  const wideCodes = (flags & 0x04) !== 0;
  const hasLayout = (flags & 0x80) !== 0;
  const named = readFontName(data);
  const glyphCount = readU16Le(data, named.afterName);
  const offsetSize = wideOffsets ? 4 : 2;
  const offsetTableStart = named.afterName + 2;
  const codeTableOffsetField = wideOffsets
    ? readU32Le(data, offsetTableStart + glyphCount * offsetSize)
    : readU16Le(data, offsetTableStart + glyphCount * offsetSize);
  const codeTableAbs = offsetTableStart + codeTableOffsetField;
  const codeWidth = wideCodes ? 2 : 1;
  if (codeTableAbs + glyphCount * codeWidth > data.length) {
    throw new PatchError("GFX", `DefineFont3 ${named.name} code table overruns the tag`);
  }
  const codes: number[] = [];
  for (let index = 0; index < glyphCount; index += 1) {
    codes.push(wideCodes ? readU16Le(data, codeTableAbs + index * 2) : (data[codeTableAbs + index] ?? 0));
  }
  const printable = codes
    .filter((code) => code >= 0x20 && code <= 0x7e)
    .map((code) => String.fromCharCode(code))
    .join("");
  const nonAscii = codes.filter((code) => code >= 0x80);
  return {
    id,
    flags,
    language,
    name: named.name,
    glyphCount,
    wideOffsets,
    wideCodes,
    hasLayout,
    codes,
    codeMin: codes.length === 0 ? 0 : Math.min(...codes),
    codeMax: codes.length === 0 ? 0 : Math.max(...codes),
    printableAscii: printable,
    nonAsciiCodes: nonAscii,
    tagLength: data.length,
  };
}

export function fontHasArabicOrPua(info: DefineFont3Info): boolean {
  return info.codes.some((code) => (code >= 0x0600 && code <= 0x06ff) || (code >= 0xe000 && code <= 0xf8ff));
}
