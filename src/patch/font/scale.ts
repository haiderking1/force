import { PatchError } from "../errors.ts";

export const SWF_FONT_EM = 1024;
export const FONT3_UNIT_SCALE = 20;
export const FONT3_EM = SWF_FONT_EM * FONT3_UNIT_SCALE;

export const SI16_MIN = -32768;
export const SI16_MAX = 32767;

export function font3ScaleFromUpem(upem: number): number {
  if (!Number.isInteger(upem) || upem <= 0) {
    throw new PatchError("GFX", `Invalid unitsPerEm ${upem}`);
  }
  return FONT3_EM / upem;
}

export function scaleFont3Coordinate(value: number, scale: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(scale)) {
    throw new PatchError("GFX", "Font3 coordinate scale produced a non-finite value");
  }
  const scaled = Math.round(value * scale);
  if (scaled < -1073741823 || scaled > 1073741823) {
    throw new PatchError("LIMIT", `Font3 coordinate ${scaled} exceeds the 31-bit SWF range`);
  }
  return scaled;
}

export function scaleFont3Advance(value: number, scale: number): number {
  const scaled = scaleFont3Coordinate(value, scale);
  if (scaled < SI16_MIN || scaled > SI16_MAX) {
    throw new PatchError("LIMIT", `Font3 advance ${scaled} exceeds SI16`);
  }
  return scaled;
}

export function fitsSigned16(value: number): boolean {
  return Number.isInteger(value) && value >= SI16_MIN && value <= SI16_MAX;
}
