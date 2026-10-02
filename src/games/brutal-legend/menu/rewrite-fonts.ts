import { PatchError } from "../../../patch/errors.ts";
import { parseDefineEditText, lineCodeInEditText, patchDefineEditTextAlignment, type EditTextAlignment } from "../../../patch/gfx/edit-text.ts";
import { appendFont3Glyphs } from "../../../patch/gfx/font3/append.ts";
import { parseDefineFont3Tag, assertDefineFont3Tag } from "../../../patch/gfx/font3/parse.ts";
import { serializeDefineFont3Tag } from "../../../patch/gfx/font3/serialize.ts";
import { DEFINE_FONT_TAG, DEFINE_FONT2_TAG, DEFINE_FONT4_TAG, type DefineFont3Tag } from "../../../patch/gfx/font3/types.ts";
import { font3GlyphPreviewSvg } from "../../../patch/font/preview.ts";
import { planPuaLabels, type EncodedPuaLabel, type PuaLabelPlan } from "../../../patch/font/pua-labels.ts";
import {
  BRUTAL_LEGEND_TITLE_FRAME_LABELS,
  BRUTAL_LEGEND_V2_MENU_FIELDS,
  fontsRequiredForV2Fields,
} from "./fields.ts";
import { rebuildGfxFile } from "../../../patch/gfx/rewrite.ts";
import { decompressGfx, readU16Le, SWF_TAG_NAMES, walkSwfTags } from "../../../patch/gfx/swf.ts";
import { Shaper } from "../../../rendering/font/shaper.ts";

export type FontRewriteResult = {
  readonly fontsBytes: Uint8Array;
  readonly frontendBytes: Uint8Array;
  readonly plan: PuaLabelPlan;
  readonly rewrittenFonts: readonly {
    readonly file: "englishfonts" | "frontend";
    readonly name: string;
    readonly id: number;
    readonly originalGlyphCount: number;
    readonly nextGlyphCount: number;
    readonly appendedCodes: readonly number[];
    readonly wideOffsets: boolean;
    readonly originalTagLength: number;
    readonly nextTagLength: number;
  }[];
  readonly editTextEvidence: readonly {
    readonly lineCode: string;
    readonly fontFace: string | undefined;
    readonly fontId: number | undefined;
  }[];
  readonly patchedEditTexts: readonly {
    readonly id: number;
    readonly align: EditTextAlignment;
  }[];
  readonly titleFrameLabels: readonly string[];
  readonly previewSvgByFont: Readonly<Record<string, string>>;
};

function rejectUnsupportedFontTags(body: Uint8Array, label: string): void {
  for (const tag of walkSwfTags(body).tags) {
    if (tag.type === DEFINE_FONT_TAG || tag.type === DEFINE_FONT2_TAG || tag.type === DEFINE_FONT4_TAG) {
      throw new PatchError(
        "GFX",
        `${label} contains ${SWF_TAG_NAMES[tag.type] ?? `tag ${tag.type}`}; only DefineFont3 can be rewritten`,
      );
    }
  }
}

function replaceNamedFonts(
  bytes: Uint8Array,
  families: ReadonlySet<string>,
  glyphs: PuaLabelPlan["glyphs"],
  file: "englishfonts" | "frontend",
  editTextAlignments?: readonly { readonly id: number; readonly align: EditTextAlignment }[],
): {
  readonly next: Uint8Array;
  readonly rewritten: FontRewriteResult["rewrittenFonts"];
  readonly parsed: readonly DefineFont3Tag[];
  readonly patchedEditTexts: readonly { readonly id: number; readonly align: EditTextAlignment }[];
} {
  const gfx = decompressGfx(bytes);
  rejectUnsupportedFontTags(gfx.body, file);
  const walked = walkSwfTags(gfx.body);
  const replacements = new Map<number, Uint8Array>();
  const rewritten: Array<{
    file: "englishfonts" | "frontend";
    name: string;
    id: number;
    originalGlyphCount: number;
    nextGlyphCount: number;
    appendedCodes: readonly number[];
    wideOffsets: boolean;
    originalTagLength: number;
    nextTagLength: number;
  }> = [];
  const parsed: DefineFont3Tag[] = [];
  const patchedEditTexts: Array<{ id: number; align: EditTextAlignment }> = [];
  for (const tag of walked.tags) {
    if (tag.type === 37 && editTextAlignments !== undefined) {
      const editId = readU16Le(tag.data, 0);
      const target = editTextAlignments.find((item) => item.id === editId);
      if (target !== undefined) {
        const nextData = patchDefineEditTextAlignment(tag.data, target.align);
        replacements.set(tag.offset, nextData);
        patchedEditTexts.push({ id: editId, align: target.align });
      }
      continue;
    }
    if (tag.type !== 75) {
      continue;
    }
    assertDefineFont3Tag(tag.type, file);
    const font = parseDefineFont3Tag(tag.data);
    if (!families.has(font.name)) {
      continue;
    }
    const identity = serializeDefineFont3Tag(font);
    if (identity.length !== tag.data.length || identity.some((value, index) => value !== tag.data[index])) {
      throw new PatchError("ROUNDTRIP", `DefineFont3 ${font.name} identity serialize did not match production bytes`);
    }
    const nextFont = appendFont3Glyphs(font, glyphs);
    const nextData = serializeDefineFont3Tag(nextFont);
    replacements.set(tag.offset, nextData);
    parsed.push(parseDefineFont3Tag(nextData));
    rewritten.push({
      file,
      name: font.name,
      id: font.id,
      originalGlyphCount: font.glyphs.length,
      nextGlyphCount: nextFont.glyphs.length,
      appendedCodes: glyphs.map((glyph) => glyph.code),
      wideOffsets: (nextData[2] ?? 0) & 0x08 ? true : nextFont.wideOffsets,
      originalTagLength: tag.data.length,
      nextTagLength: nextData.length,
    });
  }
  const missing = [...families].filter((name) => !rewritten.some((item) => item.file === file && item.name === name));
  if (missing.length > 0) {
    throw new PatchError("GFX", `${file} is missing DefineFont3 families ${missing.join(", ")}`);
  }
  return { next: rebuildGfxFile(bytes, replacements), rewritten, parsed, patchedEditTexts };
}

export function rewriteMenuFonts(options: {
  readonly fontsBytes: Uint8Array;
  readonly frontendBytes: Uint8Array;
  readonly shaper: Shaper;
  readonly labels: readonly { readonly id: string; readonly text: string }[];
  readonly editTextAlignments?: readonly { readonly id: number; readonly align: EditTextAlignment }[];
}): FontRewriteResult {
  const required = fontsRequiredForV2Fields();
  const plan = planPuaLabels(options.shaper, options.labels);
  const english = replaceNamedFonts(
    options.fontsBytes,
    new Set(required.englishFontFamilies),
    plan.glyphs,
    "englishfonts",
  );
  const frontend = replaceNamedFonts(
    options.frontendBytes,
    new Set(required.frontendFontFamilies),
    plan.glyphs,
    "frontend",
    options.editTextAlignments,
  );

  const gfx = decompressGfx(options.frontendBytes);
  const walked = walkSwfTags(gfx.body);
  const editTextEvidence = walked.tags
    .filter((tag) => tag.type === 37)
    .map((tag) => parseDefineEditText(tag.data))
    .map((edit) => ({ edit, lineCode: lineCodeInEditText(edit) }))
    .filter((item): item is { edit: ReturnType<typeof parseDefineEditText>; lineCode: string } => item.lineCode !== undefined)
    .filter((item) => BRUTAL_LEGEND_V2_MENU_FIELDS.some((field) => field.lineCode === item.lineCode))
    .map((item) => ({
      lineCode: item.lineCode,
      fontFace: item.edit.fontFace,
      fontId: item.edit.fontId,
    }));

  const titleFrameLabels = walked.tags
    .filter((tag) => tag.type === 43)
    .map((tag) => new TextDecoder("latin1").decode(tag.data.subarray(0, tag.data.indexOf(0))))
    .filter((label) => (BRUTAL_LEGEND_TITLE_FRAME_LABELS as readonly string[]).includes(label));

  const previewSvgByFont: Record<string, string> = {};
  for (const font of [...english.parsed, ...frontend.parsed]) {
    previewSvgByFont[font.name] = font3GlyphPreviewSvg(font, plan.labels);
  }

  return {
    fontsBytes: english.next,
    frontendBytes: frontend.next,
    plan,
    rewrittenFonts: [...english.rewritten, ...frontend.rewritten],
    editTextEvidence,
    patchedEditTexts: frontend.patchedEditTexts,
    titleFrameLabels,
    previewSvgByFont,
  };
}

export function encodedReplacements(
  plan: PuaLabelPlan,
): readonly { readonly lineCode: string; readonly text: string }[] {
  return plan.labels.map((label: EncodedPuaLabel) => ({ lineCode: label.id, text: label.encoded }));
}
