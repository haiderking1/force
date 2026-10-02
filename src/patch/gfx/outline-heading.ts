import type { Shaper } from "../../rendering/font/shaper.ts";
import { composeOutline } from "../../rendering/font/outline.ts";
import { outlineToFont3Shape } from "../font/outline-to-shape.ts";
import { encodeFontShape, type FontShapeRecord } from "./shape.ts";
import { parseSwfRect } from "./rect.ts";

/** Replace a DefineShape1 lettering asset with fitted white vector lettering. */
export function outlineHeading(data: Uint8Array, text: string, shaper: Shaper,
  fit = { widthFraction: 0.94, heightFraction: 0.84, centerYFraction: 0.5 }): Uint8Array {
  const bounds = parseSwfRect(data, 2);
  const outline = composeOutline(shaper, shaper.shape(text, "rtl"));
  const raw = outlineToFont3Shape(outline, 1);
  const scale = Math.min((bounds.xMax - bounds.xMin) * fit.widthFraction / (raw.xMax - raw.xMin),
    (bounds.yMax - bounds.yMin) * fit.heightFraction / (raw.yMax - raw.yMin));
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid heading outline bounds");
  const dx = (bounds.xMin + bounds.xMax - scale * (raw.xMin + raw.xMax)) / 2;
  const dy = bounds.yMin + (bounds.yMax - bounds.yMin) * fit.centerYFraction
    - scale * (raw.yMin + raw.yMax) / 2;
  const records: FontShapeRecord[] = raw.records.map(record => {
    const point = { x: Math.round(record.x * scale + dx), y: Math.round(record.y * scale + dy) };
    if (record.kind === "curve") return { ...record, ...point,
      controlX: Math.round(record.controlX * scale + dx), controlY: Math.round(record.controlY * scale + dy) };
    return { ...record, ...point };
  });
  const shape = encodeFontShape(records);
  // DefineShape1: one solid RGB white fill, no lines, original ID and bounds.
  const prefix = data.subarray(0, 2 + bounds.bytes.length);
  const styles = new Uint8Array([1, 0, 255, 255, 255, 0]);
  const result = new Uint8Array(prefix.length + styles.length + shape.length);
  result.set(prefix); result.set(styles, prefix.length); result.set(shape, prefix.length + styles.length);
  return result;
}
