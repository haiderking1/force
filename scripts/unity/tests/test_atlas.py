import copy
import unittest
from PIL import Image
from force_unity.fonts.atlas import extend_atlas


class AtlasTests(unittest.TestCase):
    def fixture(self):
        return {"m_AtlasTextures":[{"m_FileID":0,"m_PathID":1}],"m_AtlasPadding":4,
                "m_FaceInfo":{"m_PointSize":32},"m_CreationSettings":{},"m_UsedGlyphRects":[],
                "m_GlyphTable":[{"m_Index":3,"m_AtlasIndex":0}],
                "m_CharacterTable":[{"m_Unicode":65,"m_GlyphIndex":3}]}

    def glyph(self):
        return {"code":0xe800,"advance":800,"outline":{"bounds":{"empty":False,"xMin":0,"yMin":0,"xMax":500,"yMax":700},
            "commands":[{"op":"move","a":{"x":0,"y":0}},{"op":"line","a":{"x":500,"y":0}},
                        {"op":"line","a":{"x":500,"y":700}},{"op":"line","a":{"x":0,"y":700}},
                        {"op":"close","a":{"x":0,"y":0}}]}}

    def test_append_preserves_existing_pixels_indices_and_origin(self):
        font=self.fixture();original=copy.deepcopy(font);image=Image.new("RGBA",(64,64),(255,255,255,17))
        result,atlas=extend_atlas(font,image,{"unitsPerEm":1000,"glyphs":[self.glyph()]},1024)
        self.assertEqual(font,original)
        self.assertEqual(result["m_CharacterTable"][0],font["m_CharacterTable"][0])
        self.assertEqual(result["m_GlyphTable"][0],font["m_GlyphTable"][0])
        self.assertEqual(atlas.crop((0,960,64,1024)).getchannel("A").tobytes(),image.getchannel("A").tobytes())
        rect=result["m_GlyphTable"][-1]["m_GlyphRect"]
        self.assertGreater(rect["m_Y"],64)
        self.assertEqual(result["m_AtlasPopulationMode"],0)
        self.assertEqual(result["m_CharacterTable"][-1]["m_GlyphIndex"],4)

    def test_collision_rejected(self):
        glyph=self.glyph();glyph["code"]=65
        with self.assertRaises(ValueError):extend_atlas(self.fixture(),Image.new("RGBA",(64,64)),{"unitsPerEm":1000,"glyphs":[glyph]},1024)


if __name__ == "__main__":unittest.main()
