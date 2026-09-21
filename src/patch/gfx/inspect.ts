import { decompressGfx, SWF_TAG_NAMES, walkSwfTags } from "./swf.ts";
import { fontHasArabicOrPua, parseDefineFont3, type DefineFont3Info } from "./define-font3.ts";
import { collectAsciiLineCodes, uniqueStarredLineCodes, type GfxLineCodeHit } from "./line-codes.ts";

export type GfxFontReport = {
  readonly name: string;
  readonly id: number;
  readonly glyphCount: number;
  readonly wideOffsets: boolean;
  readonly hasLayout: boolean;
  readonly printableAscii: string;
  readonly nonAsciiCount: number;
  readonly hasArabicOrPua: boolean;
  readonly codeMin: number;
  readonly codeMax: number;
  readonly tagLength: number;
};

export type GfxInspectReport = {
  readonly signature: string;
  readonly version: number;
  readonly declaredLength: number;
  readonly decompressedBytes: number;
  readonly frameCount: number;
  readonly leftover: number;
  readonly tagCounts: readonly { readonly name: string; readonly count: number }[];
  readonly fonts: readonly GfxFontReport[];
  readonly lineCodes: readonly GfxLineCodeHit[];
  readonly starredLineCodes: readonly string[];
};

function toFontReport(info: DefineFont3Info): GfxFontReport {
  return {
    name: info.name,
    id: info.id,
    glyphCount: info.glyphCount,
    wideOffsets: info.wideOffsets,
    hasLayout: info.hasLayout,
    printableAscii: info.printableAscii,
    nonAsciiCount: info.nonAsciiCodes.length,
    hasArabicOrPua: fontHasArabicOrPua(info),
    codeMin: info.codeMin,
    codeMax: info.codeMax,
    tagLength: info.tagLength,
  };
}

export function inspectGfxBytes(bytes: Uint8Array): GfxInspectReport {
  const gfx = decompressGfx(bytes);
  const walked = walkSwfTags(gfx.body);
  const counts = new Map<string, number>();
  const fonts: GfxFontReport[] = [];
  for (const tag of walked.tags) {
    const name = SWF_TAG_NAMES[tag.type] ?? `tag${tag.type}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (tag.type === 75) {
      fonts.push(toFontReport(parseDefineFont3(tag.data)));
    }
  }
  const lineCodes = collectAsciiLineCodes(gfx.body, walked.tags);
  return {
    signature: gfx.signature,
    version: gfx.version,
    declaredLength: gfx.declaredLength,
    decompressedBytes: gfx.body.length,
    frameCount: walked.frameCount,
    leftover: walked.leftover,
    tagCounts: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    fonts,
    lineCodes,
    starredLineCodes: uniqueStarredLineCodes(lineCodes),
  };
}
