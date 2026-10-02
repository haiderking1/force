import { parseSwfRect } from "./rect.ts";

/** Convert our single-white-fill DefineShape1 to DefineShape4 with nonzero winding.
 * Arabic glyph overlaps must add ink rather than cancel under even-odd filling.
 */
export function whiteShapeWithNonzeroFill(shape: Uint8Array): Uint8Array {
  const rect = parseSwfRect(shape, 2);
  const offset = 2 + rect.bytes.length;
  const expected = [1, 0, 255, 255, 255, 0];
  if (!expected.every((value, i) => shape[offset + i] === value))
    throw new Error("Expected one solid white fill and no strokes");
  return new Uint8Array([
    ...shape.subarray(0, offset), ...rect.bytes,
    4, // UsesFillWindingRule, no scaling/non-scaling strokes.
    1, 0, 255, 255, 255, 255, 0, // RGBA fill array and empty LINESTYLE2 array.
    ...shape.subarray(offset + expected.length),
  ]);
}
