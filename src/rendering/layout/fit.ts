import { LayoutOverflowError, RenderingError } from "../errors.ts";
import type { BaseDirection, FittedText, Line, Profile } from "../types.ts";
import type { Shaper } from "../font/shaper.ts";
import { validateProfile, widthUnits } from "./profile.ts";
import { validateSource } from "./source.ts";
import { wrapLines } from "./wrap.ts";
import { PuaAllocator } from "./pua.ts";
import { encodeLines } from "./encode.ts";

export function fitText(
  paragraphs: readonly Line[],
  profile: Profile,
  shaper: Shaper,
  allocator: PuaAllocator,
  lineUnits: number,
  baseDirection: BaseDirection = "rtl",
): FittedText {
  validateProfile(profile);
  validateSource(paragraphs);

  if (lineUnits <= 0) {
    throw new RenderingError("invalid font line metrics", "INVALID_LINE_METRICS");
  }

  const minimum = profile.minimumSize && profile.minimumSize > 0 ? profile.minimumSize : profile.size;
  const lineGap = profile.lineGap ?? 0;
  const upem = shaper.unitsPerEm();

  for (let size = profile.size; size >= minimum; size -= 1) {
    try {
      const targetWidth = widthUnits(profile, size, upem);
      const lines = wrapLines(shaper, paragraphs, targetWidth, baseDirection);

      const count =
        lines.length === 1 && lines[0]?.chars.length === 0 && !lines[0]?.newline
          ? 0
          : lines.length;

      const lineHeight = Math.floor((lineUnits * size + upem - 1) / upem) + lineGap;

      if (profile.height && profile.height > 0) {
        const maxLines = Math.floor(profile.height / lineHeight);
        if (count > maxLines) {
          continue;
        }
      }

      // Clone allocator state so failed attempts don't pollute allocator
      const candidateAllocator = new PuaAllocator(shaper.cmap(), allocator.mappings());
      const spans = encodeLines(lines, candidateAllocator, shaper, baseDirection);

      // Success: copy candidate mappings to input allocator
      const currentCount = allocator.mappings().length;
      const candidateMappings = candidateAllocator.mappings();
      for (let i = currentCount; i < candidateMappings.length; i += 1) {
        const m = candidateMappings[i];
        if (m) {
          if (m.direction === "spacer") {
            allocator.spacer();
          } else {
            allocator.getOrAllocate(m.token, m.direction);
          }
        }
      }

      return {
        spans,
        size,
        lines: count,
      };
    } catch (err) {
      if (err instanceof LayoutOverflowError) {
        // A smaller size can fix overflow, not a missing glyph or malformed text.
        continue;
      }
      throw err;
    }
  }

  throw new LayoutOverflowError("text cannot fit its requested layout profile");
}
