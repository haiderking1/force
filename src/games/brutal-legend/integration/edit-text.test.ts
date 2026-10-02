import { expect, test } from "bun:test";
import { originalGamePack } from "./original-game.ts";
import { BRUTAL_LEGEND_GFX_PACK } from "../config.ts";
import { parseDefineEditText, patchDefineEditTextAlignment } from "../../../patch/gfx/edit-text.ts";
import { decompressGfx, readU16Le, walkSwfTags } from "../../../patch/gfx/swf.ts";

test("patches DefineEditText 337 and 338 from production FrontEnd.gfx", async () => {
  const { headerPath, payloadPath } = await originalGamePack(BRUTAL_LEGEND_GFX_PACK, process.env);
  const { openBuddhaPack } = await import("../../../archive/buddha/open.ts");
  const { extractBuddhaEntry } = await import("../../../archive/buddha/extract.ts");
  const pack = await openBuddhaPack({
    headerPath,
    payloadPath,
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
