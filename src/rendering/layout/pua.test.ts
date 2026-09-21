import { describe, expect, it } from "bun:test";
import { PuaAllocator, PUA_FIRST, PUA_LAST } from "./pua.ts";
import { PuaAllocationError, RenderingError } from "../errors.ts";

describe("PUA Glyph Allocator", () => {
  it("allocates spacer automatically on empty initial mappings", () => {
    const baseCmap = new Map<number, number>();
    const alloc = new PuaAllocator(baseCmap);
    const mappings = alloc.mappings();
    expect(mappings.length).toBe(1);
    expect(mappings[0]?.direction).toBe("spacer");
    expect(mappings[0]?.codepoint).toBe(PUA_FIRST);
  });

  it("allocates directional tokens monotonically within BMP PUA range", () => {
    const baseCmap = new Map<number, number>();
    const alloc = new PuaAllocator(baseCmap);

    const m1 = alloc.getOrAllocate("مرحبا", "rtl");
    expect(m1.codepoint).toBe(PUA_FIRST + 1);
    expect(m1.direction).toBe("rtl");
    expect(m1.token).toBe("مرحبا");

    // Re-getting returns the same mapping
    const m1Again = alloc.getOrAllocate("مرحبا", "rtl");
    expect(m1Again.codepoint).toBe(m1.codepoint);

    // Same token in LTR is a different mapping
    const m1Ltr = alloc.getOrAllocate("مرحبا", "ltr");
    expect(m1Ltr.codepoint).toBe(PUA_FIRST + 2);
  });

  it("skips codepoints already present in base cmap", () => {
    const baseCmap = new Map<number, number>();
    baseCmap.set(PUA_FIRST + 1, 100); // occupied in font base cmap

    const alloc = new PuaAllocator(baseCmap);
    // spacer is PUA_FIRST
    const m1 = alloc.getOrAllocate("test", "ltr");
    // Should skip PUA_FIRST + 1 and allocate PUA_FIRST + 2
    expect(m1.codepoint).toBe(PUA_FIRST + 2);
  });

  it("rejects invalid allocation requests", () => {
    const alloc = new PuaAllocator(new Map());
    expect(() => alloc.getOrAllocate("", "ltr")).toThrow(PuaAllocationError);
    expect(() => alloc.getOrAllocate("token", "spacer")).toThrow(PuaAllocationError);
  });
});
