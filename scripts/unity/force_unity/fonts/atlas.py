"""Append outlined glyphs to a TMP atlas without moving existing glyph rectangles."""
import copy
from PIL import Image
from .raster import raster_glyph


def extend_atlas(font, original_image, glyph_manifest, size=4096):
    result = copy.deepcopy(font)
    old_width, old_height = original_image.size
    if size not in (1024,2048,4096,8192) or size <= max(old_width,old_height):
        raise ValueError("New atlas must be a larger supported power of two")
    if len(font["m_AtlasTextures"]) != 1 or any(g["m_AtlasIndex"] != 0 for g in font["m_GlyphTable"]):
        raise ValueError("Only single-atlas TMP fonts are supported by this appender")
    padding = font["m_AtlasPadding"]
    point_size = font["m_FaceInfo"]["m_PointSize"]
    if not 1 <= padding <= 64:
        raise ValueError("Unsupported SDF padding")
    alpha = Image.new("L",(size,size),0)
    original_alpha = original_image.convert("RGBA").getchannel("A")
    # Unity glyph rectangles have a bottom-left origin; decoded PIL images do not.
    alpha.paste(original_alpha,(0,size-old_height))
    occupied = {c["m_Unicode"] for c in font["m_CharacterTable"]}
    index = max((g["m_Index"] for g in font["m_GlyphTable"]),default=0)+1
    x,y,row_height = 0,0,0
    for glyph in glyph_manifest["glyphs"]:
        code = glyph["code"]
        if code in occupied or not 0xe000 <= code <= 0xf8ff:
            raise ValueError("PUA character collision or out-of-range code")
        occupied.add(code)
        tile,metrics = raster_glyph(glyph,glyph_manifest["unitsPerEm"],point_size,padding)
        rect = {"m_X":0,"m_Y":0,"m_Width":0,"m_Height":0}
        if tile is not None:
            if x+tile.width > size:
                x=0; y+=row_height; row_height=0
            if y+tile.height > size-old_height:
                raise ValueError("New glyphs exceed reserved atlas space")
            alpha.paste(tile,(x,y))
            rect = {"m_X":x+padding,"m_Y":size-(y+padding+int(metrics["m_Height"])),
                    "m_Width":int(metrics["m_Width"]),"m_Height":int(metrics["m_Height"])}
            result["m_UsedGlyphRects"].append({"m_X":x,"m_Y":size-y-tile.height,"m_Width":tile.width,"m_Height":tile.height})
            x+=tile.width+1; row_height=max(row_height,tile.height+1)
        result["m_GlyphTable"].append({"m_Index":index,"m_Metrics":metrics,"m_GlyphRect":rect,
            "m_Scale":1.0,"m_AtlasIndex":0,"m_ClassDefinitionType":0})
        result["m_CharacterTable"].append({"m_ElementType":1,"m_Unicode":code,"m_GlyphIndex":index,"m_Scale":1.0})
        index+=1
    result.update(m_AtlasWidth=size,m_AtlasHeight=size,m_AtlasPopulationMode=0,m_FreeGlyphRects=[])
    # Dynamic allocation is disabled because the old free-rect list is stale.
    result["m_CreationSettings"].update(atlasWidth=size,atlasHeight=size)
    image = Image.new("RGBA",(size,size),(255,255,255,0)); image.putalpha(alpha)
    if image.crop((0,size-old_height,old_width,size)).getchannel("A").tobytes() != original_alpha.tobytes():
        raise ValueError("Existing atlas alpha changed")
    if result["m_GlyphTable"][:len(font["m_GlyphTable"])] != font["m_GlyphTable"] or result["m_CharacterTable"][:len(font["m_CharacterTable"])] != font["m_CharacterTable"]:
        raise ValueError("Existing glyph indices or characters changed")
    return result,image
