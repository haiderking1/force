"""Reconstruct static text from the rebuilt TMP glyph table and atlas.

This checks stored glyph geometry, not Unity shaders, layout, or typewriters.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw
from ..assets import load, select


def preview_font(container, asset, font_id, encoded_path, output):
    env,_ = load(container)
    font = select(env,asset,font_id,"MonoBehaviour").parse_as_dict()
    reference = font["m_AtlasTextures"][0]
    if reference["m_FileID"] != 0:
        raise ValueError("External preview atlas is unsupported")
    atlas = select(env,asset,reference["m_PathID"],"Texture2D").read().image.getchannel("A")
    glyphs = {g["m_Index"]:g for g in font["m_GlyphTable"]}
    characters = {c["m_Unicode"]:glyphs[c["m_GlyphIndex"]] for c in font["m_CharacterTable"]}
    records = json.loads(Path(encoded_path).read_text())["encoded"]
    pictures = []
    for record in records:
        text = record["encoded"]
        import re
        text = re.sub(r"<[^<>]+>","",text)
        lines = text.split("\n")
        image = Image.new("RGB",(1200,100*len(lines)+30),"#eee4cc")
        draw = ImageDraw.Draw(image);draw.text((10,8),record["id"],fill="black")
        for line_index,line in enumerate(lines):
            pen = 30.0; baseline = 75+line_index*100
            for char in line:
                g = characters.get(ord(char))
                if g is None:
                    if char == " ":
                        pen += 14; continue
                    raise ValueError(f"Preview font has no U+{ord(char):04X}")
                rect,metrics = g["m_GlyphRect"],g["m_Metrics"]
                x,y,w,h = (rect[k] for k in ("m_X","m_Y","m_Width","m_Height"))
                if w and h:
                    mask = atlas.crop((x,atlas.height-y-h,x+w,atlas.height-y))
                    mask = mask.point(lambda v:max(0,min(255,(v-112)*8)))
                    ink = Image.new("RGB",mask.size,"#401610")
                    image.paste(ink,(round(pen+metrics["m_HorizontalBearingX"]),round(baseline-metrics["m_HorizontalBearingY"])),mask)
                pen += metrics["m_HorizontalAdvance"]
        pictures.append(image)
    sheet = Image.new("RGB",(1200,sum(i.height for i in pictures)),"#eee4cc")
    y=0
    for image in pictures:
        sheet.paste(image,(0,y)); y+=image.height
    sheet.save(output)
