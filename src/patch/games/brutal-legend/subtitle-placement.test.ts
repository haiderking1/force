import { expect, test } from "bun:test";
import path from "node:path";
import { extractBuddhaEntry } from "../../../archive/buddha/extract.ts";
import { openBuddhaPack } from "../../../archive/buddha/open.ts";
import { payloadPathFromHeader } from "../../../archive/companion-path.ts";
import { parsePlaceObject2 } from "../../gfx/place-object.ts";
import { decompressGfx, walkSwfTags } from "../../gfx/swf.ts";
import { BRUTAL_LEGEND_DEFAULT_ROOT, BRUTAL_LEGEND_GFX_PACK } from "./config.ts";
import { inspectSubtitleFields, lowerSubtitleSprite } from "./subtitle-placement.ts";
import { SUBTITLE_ASSET, SUBTITLE_LOWER_TWIPS, SUBTITLE_ROOT_NAME, SUBTITLE_SPRITE_ID } from "./subtitle-profile.ts";

test("subtitle fields match the inspected boxes and lowering keeps the bottom margin", async () => {
  const headerPath = path.join(BRUTAL_LEGEND_DEFAULT_ROOT, BRUTAL_LEGEND_GFX_PACK);
  if (!(await Bun.file(headerPath).exists())) {
    throw new Error("Installed Brutal Legend Man_Gfx pack is required for subtitle placement");
  }
  const list = await openBuddhaPack({ headerPath, payloadPath: payloadPathFromHeader(headerPath) });
  const bytes = (await extractBuddhaEntry(list, SUBTITLE_ASSET)).bytes;
  const fields = inspectSubtitleFields(bytes);
  expect(fields.map((field) => ({ id: field.profile.id, width: Math.round(field.widthPx), height: Math.round(field.heightPx) }))).toEqual([
    { id: 2, width: 574, height: 126 },
    { id: 3, width: 424, height: 136 },
    { id: 4, width: 574, height: 126 },
    { id: 5, width: 574, height: 126 },
    { id: 7, width: 574, height: 102 },
  ]);
  const root = walkSwfTags(decompressGfx(bytes).body).tags.find((tag) => tag.type === 26);
  if (root === undefined) throw new Error("missing root PlaceObject2");
  const before = parsePlaceObject2(root.data);
  expect(before.name).toBe(SUBTITLE_ROOT_NAME);
  expect(before.characterId).toBe(SUBTITLE_SPRITE_ID);
  if (before.matrix === undefined) throw new Error("missing root matrix");
  if (before.matrix.translateY === 11200) {
    const lowered = lowerSubtitleSprite(bytes);
    expect(lowered.deltaTwips).toBe(SUBTITLE_LOWER_TWIPS);
    expect(lowered.afterY).toBe(11920);
    expect(lowered.lowestBottomPx).toBeLessThanOrEqual(lowered.stageHeightPx - 40);
    const afterRoot = walkSwfTags(decompressGfx(lowered.bytes).body).tags.find((tag) => tag.type === 26);
    if (afterRoot === undefined) throw new Error("missing lowered root");
    const after = parsePlaceObject2(afterRoot.data);
    expect(after.matrix?.translateX).toBe(before.matrix.translateX);
    expect(after.matrix?.translateY).toBe(11920);
    expect(inspectSubtitleFields(lowered.bytes).map((field) => field.heightTwips)).toEqual(
      fields.map((field) => field.heightTwips),
    );
  } else {
    expect(before.matrix.translateY).toBe(11920);
  }
});
