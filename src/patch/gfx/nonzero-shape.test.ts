import { expect, test } from "bun:test";
import { Shaper } from "../../rendering/font/shaper.ts";
import { outlineHeading } from "./outline-heading.ts";
import { whiteShapeWithNonzeroFill } from "./nonzero-shape.ts";
import { encodeSwfRect, parseSwfRect } from "./rect.ts";
import { parseFontShape, fontShapePoints } from "./shape.ts";

test("nonzero heading keeps contours and adds clearance below the letters", () => {
  const rect = encodeSwfRect(-2580, 2580, -2080, 0);
  const input = new Uint8Array([119, 0, ...rect]);
  const shaper = Shaper.open("assets/fonts/force.ttf");
  try {
    const heading = outlineHeading(input, "الخيارات", shaper,
      { widthFraction: 0.68, heightFraction: 0.60, centerYFraction: 0.37 });
    const result = whiteShapeWithNonzeroFill(heading);
    const edgeBounds = parseSwfRect(result, 2 + rect.length);
    expect(edgeBounds.bytes).toEqual(rect);
    const flagsOffset = 2 + rect.length * 2;
    expect(result[flagsOffset]).toBe(4);
    const recordsOffset = flagsOffset + 8;
    expect(result.subarray(recordsOffset)).toEqual(heading.subarray(2 + rect.length + 6));
    const shape = parseFontShape(result, recordsOffset, result.length - recordsOffset);
    const points = fontShapePoints(shape);
    expect(Math.max(...points.map(p => p.y))).toBeLessThan(-680);
    expect(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))).toBeLessThanOrEqual(3510);
    expect(shape.records.length).toBeGreaterThan(100);
    expect(() => whiteShapeWithNonzeroFill(input)).toThrow("Expected one solid white fill");
  } finally { shaper.destroy(); }
});
