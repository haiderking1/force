import { expect, test } from "bun:test";
import { Shaper } from "../../rendering/font/shaper.ts";
import { outlineHeading } from "./outline-heading.ts";
import { encodeSwfRect, parseSwfRect } from "./rect.ts";
import { parseFontShape, fontShapePoints } from "./shape.ts";

test("Arabic heading stays within original bounds and retains its character ID", () => {
  const rect = encodeSwfRect(-2580, 2580, -2080, 0);
  const data = new Uint8Array(2 + rect.length); data[0] = 119; data.set(rect, 2);
  const shaper = Shaper.open("assets/fonts/force.ttf");
  try {
    const result = outlineHeading(data, "الخيارات", shaper);
    expect(result[0]).toBe(119);
    const bounds = parseSwfRect(result, 2);
    expect(bounds.bytes).toEqual(rect);
    const offset = 2 + rect.length + 6;
    const shape = parseFontShape(result, offset, result.length - offset);
    expect(shape.records.length).toBeGreaterThan(100);
    for (const point of fontShapePoints(shape)) {
      expect(point.x).toBeGreaterThanOrEqual(-2580); expect(point.x).toBeLessThanOrEqual(2580);
      expect(point.y).toBeGreaterThanOrEqual(-2080); expect(point.y).toBeLessThanOrEqual(0);
    }
  } finally { shaper.destroy(); }
});
