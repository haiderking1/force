import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { parseDefineEditText, patchDefineEditTextAlignment } from "./edit-text.ts";
import { decompressGfx, readU16Le, walkSwfTags } from "./swf.ts";
import { encodeSwfRect } from "./rect.ts";

const BACKUP_PACK_HEADER = "out/backups/brutal-legend-main-menu/files/Win/Packs/Man_Gfx.~h";

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

test("patches DefineEditText 337 and 338 from production FrontEnd.gfx", async () => {
  if (!existsSync(BACKUP_PACK_HEADER)) {
    return;
  }
  const { openBuddhaPack } = await import("../../archive/buddha/open.ts");
  const { extractBuddhaEntry } = await import("../../archive/buddha/extract.ts");
  const pack = await openBuddhaPack({
    headerPath: BACKUP_PACK_HEADER,
    payloadPath: "out/backups/brutal-legend-main-menu/files/Win/Packs/Man_Gfx.~p",
  });
  const frontendEntry = await extractBuddhaEntry(pack, "data/ui/frontend/opt/frontend.gfx");
  const decomp = decompressGfx(frontendEntry.bytes);
  const swf = walkSwfTags(decomp.body);

  for (const targetId of [337, 338]) {
    const tag = swf.tags.find((t) => t.type === 37 && readU16Le(t.data, 0) === targetId);
    expect(tag).toBeDefined();
    if (tag === undefined) continue;

    const before = parseDefineEditText(tag.data);
    expect(before.id).toBe(targetId);
    expect(before.align).toBe("left");
    expect(before.initial).toBe('<p align="left"></p>');

    const patched = patchDefineEditTextAlignment(tag.data, "right");
    const after = parseDefineEditText(patched);
    expect(after.id).toBe(targetId);
    expect(after.align).toBe("right");
    expect(after.initial).toBe('<p align="right"></p>');
    expect(after.fontId).toBe(before.fontId);
    expect(after.fontHeight).toBe(before.fontHeight);
    expect(after.html).toBe(before.html);
    expect(after.useOutlines).toBe(before.useOutlines);
  }
});
