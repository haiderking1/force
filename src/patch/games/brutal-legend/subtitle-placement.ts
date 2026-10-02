import { PatchError } from "../../errors.ts";
import { parseDefineEditText } from "../../gfx/edit-text.ts";
import { parsePlaceObject2, translatePlaceObject2, assertNamedCharacter } from "../../gfx/place-object.ts";
import { parsePlaceObject3 } from "../../gfx/place-object3.ts";
import { parseSwfRect } from "../../gfx/rect.ts";
import { rebuildGfxFile } from "../../gfx/rewrite.ts";
import { walkSpriteTags } from "../../gfx/sprite-tags.ts";
import { decompressGfx, walkSwfTags } from "../../gfx/swf.ts";
import {
  SUBTITLE_BOTTOM_MARGIN_PX,
  SUBTITLE_FIELD_PROFILES,
  SUBTITLE_LOWER_TWIPS,
  SUBTITLE_ROOT_NAME,
  SUBTITLE_SPRITE_ID,
} from "./subtitle-profile.ts";

export type SubtitlePlacement = {
  readonly bytes: Uint8Array;
  readonly beforeY: number;
  readonly afterY: number;
  readonly deltaTwips: number;
  readonly stageHeightPx: number;
  readonly lowestBottomPx: number;
};

function twipsToPx(value: number): number {
  return value / 20;
}

export function inspectSubtitleFields(bytes: Uint8Array) {
  const tags = walkSwfTags(decompressGfx(bytes).body).tags.filter((tag) => tag.type === 37);
  return SUBTITLE_FIELD_PROFILES.map((profile) => {
    const tag = tags.find((item) => parseDefineEditText(item.data).id === profile.id);
    if (tag === undefined) {
      throw new PatchError("GFX", `Subtitle field ${profile.id} (${profile.label}) is missing`);
    }
    const edit = parseDefineEditText(tag.data);
    const bounds = parseSwfRect(tag.data, 2);
    const widthTwips = bounds.xMax - bounds.xMin;
    const heightTwips = bounds.yMax - bounds.yMin;
    if (edit.fontFace !== "$Condensed" || edit.fontHeight !== 480 || edit.align !== "center") {
      throw new PatchError("GFX", `Subtitle field ${profile.id} font or align changed`);
    }
    return { profile, widthTwips, heightTwips, widthPx: twipsToPx(widthTwips), heightPx: twipsToPx(heightTwips) };
  });
}

export function lowerSubtitleSprite(bytes: Uint8Array): SubtitlePlacement {
  const gfx = decompressGfx(bytes);
  const walked = walkSwfTags(gfx.body);
  const stage = parseSwfRect(gfx.body, 0);
  const stageHeightPx = twipsToPx(stage.yMax - stage.yMin);
  const root = walked.tags.find((tag) => tag.type === 26);
  if (root === undefined) {
    throw new PatchError("GFX", "Subtitle GFX is missing the root PlaceObject2");
  }
  const place = parsePlaceObject2(root.data);
  assertNamedCharacter(place, SUBTITLE_ROOT_NAME, SUBTITLE_SPRITE_ID);
  if (place.matrix === undefined) {
    throw new PatchError("GFX", "Subtitle root PlaceObject2 has no matrix");
  }
  const beforeY = place.matrix.translateY;
  const afterY = beforeY + SUBTITLE_LOWER_TWIPS;
  const sprite = walked.tags.find((tag) => tag.type === 39 && walkSpriteTags(tag.data).id === SUBTITLE_SPRITE_ID);
  if (sprite === undefined) {
    throw new PatchError("GFX", "Subtitle sprite 8 is missing");
  }
  const fields = inspectSubtitleFields(bytes);
  const heightById = new Map(fields.map((field) => [field.profile.id, field.heightTwips]));
  let lowestBottomPx = 0;
  for (const tag of walkSpriteTags(sprite.data).tags) {
    if (tag.type !== 70) {
      continue;
    }
    const inner = parsePlaceObject3(tag.data);
    if (inner.characterId === undefined || inner.matrix === undefined) {
      continue;
    }
    if (inner.matrix.translateY > 0) {
      continue;
    }
    const heightTwips = heightById.get(inner.characterId);
    if (heightTwips === undefined) {
      continue;
    }
    const bottom = twipsToPx(afterY + inner.matrix.translateY + heightTwips);
    lowestBottomPx = Math.max(lowestBottomPx, bottom);
  }
  if (lowestBottomPx > stageHeightPx - SUBTITLE_BOTTOM_MARGIN_PX) {
    throw new PatchError(
      "LIMIT",
      `Lowering subtitles by ${SUBTITLE_LOWER_TWIPS} twips puts the box at ${lowestBottomPx}px, past the ${SUBTITLE_BOTTOM_MARGIN_PX}px bottom margin of a ${stageHeightPx}px stage`,
    );
  }
  const nextData = translatePlaceObject2(root.data, 0, SUBTITLE_LOWER_TWIPS);
  return {
    bytes: rebuildGfxFile(bytes, new Map([[root.offset, nextData]])),
    beforeY,
    afterY,
    deltaTwips: SUBTITLE_LOWER_TWIPS,
    stageHeightPx,
    lowestBottomPx,
  };
}
