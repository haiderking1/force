import { expect, test } from "bun:test";
import { parseDefineEditText, patchDefineEditTextAlignment } from "./edit-text.ts";
import { encodeSwfRect } from "./rect.ts";

test("patches alignment on synthetic DefineEditText with layout and html initial text", () => {
  const bounds = encodeSwfRect(-100, 100, -50, 50);
  const id = 42;
  const flags1 = 0x80; // hasText
  const flags2 = 0x22; // hasLayout | html
  const layout = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 40, 0]); // align=0 (left)
  const variable = new TextEncoder().encode("msg\0");
  const initial = new TextEncoder().encode('<p align="left">Hello</p>\0');

  const raw = new Uint8Array(2 + bounds.length + 2 + layout.length + variable.length + initial.length);
  const view = new DataView(raw.buffer);
  view.setUint16(0, id, true);
  raw.set(bounds, 2);
  let pos = 2 + bounds.length;
  raw[pos] = flags1;
  raw[pos + 1] = flags2;
  pos += 2;
  raw.set(layout, pos);
  pos += layout.length;
  raw.set(variable, pos);
  pos += variable.length;
  raw.set(initial, pos);

  const parsedBefore = parseDefineEditText(raw);
  expect(parsedBefore.id).toBe(42);
  expect(parsedBefore.align).toBe("left");
  expect(parsedBefore.initial).toBe('<p align="left">Hello</p>');

  const patched = patchDefineEditTextAlignment(raw, "right");
  const parsedAfter = parseDefineEditText(patched);
  expect(parsedAfter.id).toBe(42);
  expect(parsedAfter.align).toBe("right");
  expect(parsedAfter.initial).toBe('<p align="right">Hello</p>');
  expect(parsedAfter.variable).toBe("msg");
});
