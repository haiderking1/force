import { InvalidProfileError, LayoutOverflowError, RenderingError } from "../errors.ts";
import type { Profile } from "../types.ts";

export function validateProfile(p: Profile): void {
  const height = p.height ?? 0;
  const padding = p.padding ?? 0;
  const lineGap = p.lineGap ?? 0;
  const minimumSize = p.minimumSize ?? 0;

  if (
    p.size <= 0 ||
    p.width <= 0 ||
    height < 0 ||
    padding < 0 ||
    padding >= p.width ||
    lineGap < 0 ||
    minimumSize < 0 ||
    minimumSize > p.size
  ) {
    throw new InvalidProfileError("invalid layout profile");
  }
}

export function widthUnits(p: Profile, size: number, unitsPerEm: number): number {
  validateProfile(p);
  if (size <= 0 || unitsPerEm <= 0) {
    throw new RenderingError("invalid layout scale", "INVALID_SCALE");
  }

  const padding = p.padding ?? 0;
  const availableWidth = p.width - padding;
  const width = Math.floor((availableWidth * unitsPerEm) / size);

  if (width <= 0) {
    throw new LayoutOverflowError("layout width is less than one font unit");
  }

  if (!Number.isSafeInteger(width) || width > 2147483647) {
    throw new RenderingError("layout width exceeds font-unit range", "COORDINATE_OVERFLOW");
  }

  return width;
}
