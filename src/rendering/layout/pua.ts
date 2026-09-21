import { PuaAllocationError, RenderingError } from "../errors.ts";
import type { GlyphMapping, TokenDirection } from "../types.ts";

export const PUA_FIRST = 0xe000;
export const PUA_LAST = 0xf8ff;

export type SpacerRequirement = "optional" | "exactly_one";

export function validateGlyphMappings(
  mappings: readonly GlyphMapping[],
  spacerRequirement: SpacerRequirement = "optional",
): void {
  let spacerCount = 0;

  for (let i = 0; i < mappings.length; i += 1) {
    const mapping = mappings[i];
    if (!mapping) continue;

    if (mapping.direction === "spacer") {
      spacerCount += 1;
      if (mapping.token.length > 0) {
        throw new RenderingError("spacer glyph mapping must have an empty token", "INVALID_SPACER");
      }
    } else if (mapping.direction === "ltr" || mapping.direction === "rtl") {
      if (mapping.token.length === 0) {
        throw new RenderingError(
          "directional glyph mapping must have a nonempty token",
          "EMPTY_TOKEN_MAPPING",
        );
      }
    } else {
      throw new RenderingError("glyph mapping has an invalid direction", "INVALID_DIRECTION");
    }

    for (let j = 0; j < i; j += 1) {
      const prev = mappings[j];
      if (prev && prev.token === mapping.token && prev.direction === mapping.direction) {
        throw new RenderingError("duplicate token and direction glyph mapping", "DUPLICATE_MAPPING");
      }
    }
  }

  if (spacerCount > 1) {
    throw new RenderingError("glyph mappings contain more than one spacer", "MULTIPLE_SPACERS");
  }

  if (spacerRequirement === "exactly_one" && spacerCount !== 1) {
    throw new RenderingError("glyph mappings must contain exactly one spacer", "MISSING_SPACER");
  }
}

export class PuaAllocator {
  private readonly mappingsList: GlyphMapping[];
  private readonly used: boolean[];

  constructor(
    baseCmap: ReadonlyMap<number, number>,
    existing: readonly GlyphMapping[] = [],
  ) {
    this.mappingsList = [...existing];
    const puaSize = PUA_LAST - PUA_FIRST + 1;
    this.used = new Array<boolean>(puaSize).fill(false);

    validateGlyphMappings(
      this.mappingsList,
      this.mappingsList.length === 0 ? "optional" : "exactly_one",
    );

    for (const cp of baseCmap.keys()) {
      if (cp >= PUA_FIRST && cp <= PUA_LAST) {
        this.used[cp - PUA_FIRST] = true;
      }
    }

    for (let i = 0; i < this.mappingsList.length; i += 1) {
      const mapping = this.mappingsList[i];
      if (!mapping) continue;

      if (mapping.codepoint < PUA_FIRST || mapping.codepoint > PUA_LAST) {
        throw new PuaAllocationError("stored glyph mapping is outside the BMP private-use area");
      }

      if (baseCmap.has(mapping.codepoint)) {
        throw new PuaAllocationError("stored glyph mapping conflicts with the Ara base cmap");
      }

      for (let j = 0; j < i; j += 1) {
        const prev = this.mappingsList[j];
        if (prev && prev.codepoint === mapping.codepoint) {
          throw new PuaAllocationError("stored glyph mappings reuse a private-use codepoint");
        }
        if (prev && prev.token === mapping.token && prev.direction === mapping.direction) {
          throw new PuaAllocationError("duplicate stored token mapping");
        }
      }

      this.used[mapping.codepoint - PUA_FIRST] = true;
    }

    if (this.mappingsList.length === 0) {
      this.spacer();
    }
  }

  private nextCodepoint(): number {
    const idx = this.used.indexOf(false);
    if (idx === -1) {
      throw new PuaAllocationError("BMP private-use area U+E000..U+F8FF is exhausted");
    }
    this.used[idx] = true;
    return PUA_FIRST + idx;
  }

  getOrAllocate(token: string, direction: TokenDirection): GlyphMapping {
    if (direction === "spacer") {
      throw new PuaAllocationError("use the dedicated spacer allocator");
    }
    if (direction !== "ltr" && direction !== "rtl") {
      throw new PuaAllocationError("cannot allocate a token with an invalid direction");
    }
    if (token.length === 0) {
      throw new PuaAllocationError("cannot allocate an empty directional token");
    }

    const found = this.mappingsList.find(
      (m) => m.token === token && m.direction === direction,
    );
    if (found) {
      return found;
    }

    const mapping: GlyphMapping = {
      token,
      direction,
      codepoint: this.nextCodepoint(),
    };
    this.mappingsList.push(mapping);
    return mapping;
  }

  spacer(): GlyphMapping {
    const found = this.mappingsList.find((m) => m.direction === "spacer");
    if (found) {
      if (found.token.length > 0) {
        throw new PuaAllocationError("stored spacer mapping has a nonempty token");
      }
      return found;
    }

    const mapping: GlyphMapping = {
      token: "",
      direction: "spacer",
      codepoint: this.nextCodepoint(),
    };
    this.mappingsList.push(mapping);
    return mapping;
  }

  mappings(): readonly GlyphMapping[] {
    return this.mappingsList;
  }
}
