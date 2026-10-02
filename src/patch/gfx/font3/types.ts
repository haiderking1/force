export const DEFINE_FONT3_TAG = 75;
export const DEFINE_FONT2_TAG = 48;
export const DEFINE_FONT4_TAG = 91;
export const DEFINE_FONT_TAG = 10;

// Other flag bits: ShiftJIS 0x40, SmallText 0x20, ANSI 0x10, Italic 0x02, Bold 0x01.
export const FONT3_FLAG_HAS_LAYOUT = 0x80;
export const FONT3_FLAG_WIDE_OFFSETS = 0x08;
export const FONT3_FLAG_WIDE_CODES = 0x04;

export type Font3KerningRecord = {
  readonly code1: number;
  readonly code2: number;
  readonly adjustment: number;
};

export type Font3Glyph = {
  readonly shapeBytes: Uint8Array;
  readonly code: number;
  readonly advance: number;
  readonly boundsBytes: Uint8Array;
};

export type DefineFont3Tag = {
  readonly id: number;
  readonly flags: number;
  readonly language: number;
  readonly nameBytes: Uint8Array;
  readonly name: string;
  readonly wideOffsets: boolean;
  readonly wideCodes: boolean;
  readonly hasLayout: boolean;
  readonly ascent: number;
  readonly descent: number;
  readonly leading: number;
  readonly glyphs: readonly Font3Glyph[];
  readonly kerning: readonly Font3KerningRecord[];
  readonly kerningBytes: Uint8Array;
};

export type Font3AppendedGlyph = {
  readonly code: number;
  readonly shapeBytes: Uint8Array;
  readonly advance: number;
  readonly boundsBytes: Uint8Array;
};
