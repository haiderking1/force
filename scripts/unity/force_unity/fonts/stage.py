"""Stage a shared TMP PUA fallback and its explicitly selected font links."""
import json
from pathlib import Path
from ..assets import load, metadata, object_key, resources, save_verified, select, snapshot
from ..paths import confined, file_hash, write_json
from .atlas import extend_atlas


def stage_font(config_path, glyph_path, out):
    config = json.loads(Path(config_path).read_text())
    glyph_manifest = json.loads(Path(glyph_path).read_text())
    root, out = Path(config["root"]).resolve(), Path(out).resolve()
    if out == root or out.is_relative_to(root):
        raise ValueError("Font staging must be outside the game")
    source = confined(root, config["file"])
    if file_hash(source) != config["sha256"]:
        raise ValueError("Font bundle changed since inventory")
    out.mkdir(parents=True,exist_ok=False)
    env,top = load(source)
    before,meta,res = snapshot(env),metadata(env),resources(top)
    fallback = select(env,config["asset"],config["fallbackPathId"],"MonoBehaviour")
    font = fallback.parse_as_dict()
    atlas_ref,material_ref = font["m_AtlasTextures"][0],font["m_Material"]
    if atlas_ref["m_FileID"] != 0 or material_ref["m_FileID"] != 0:
        raise ValueError("External atlas/material writing is not implemented")
    texture = select(env,config["asset"],atlas_ref["m_PathID"],"Texture2D")
    tex = texture.read()
    if int(tex.m_TextureFormat) != 1:
        raise ValueError("This SDF writer requires an Alpha8 source atlas")
    extended,image = extend_atlas(font,tex.image,glyph_manifest,config.get("atlasSize",4096))
    fallback.save_typetree(extended)
    tex.set_image(image,target_format=1,mipmap_count=1); tex.save()
    material = select(env,config["asset"],material_ref["m_PathID"],"Material")
    mat = material.parse_as_dict()
    floats = mat["m_SavedProperties"]["m_Floats"]
    names = {row[0] for row in floats}
    if not {"_TextureWidth","_TextureHeight"} <= names:
        raise ValueError("Material lacks SDF atlas dimensions")
    mat["m_SavedProperties"]["m_Floats"] = [
        (name, float(image.width) if name in ("_TextureWidth","_TextureHeight") else value)
        for name,value in floats
    ]
    material.save_typetree(mat)
    changed = {object_key(fallback),object_key(texture),object_key(material)}
    codes = {g["code"] for g in glyph_manifest["glyphs"]}
    for identifier in config["targetFonts"]:
        target = select(env,config["asset"],identifier,"MonoBehaviour")
        if object_key(target) in changed:
            raise ValueError("Duplicate or self-referencing fallback font target")
        data = target.parse_as_dict()
        if codes & {c["m_Unicode"] for c in data["m_CharacterTable"]}:
            raise ValueError("Target font already occupies generated PUA codes")
        reference = {"m_FileID":0,"m_PathID":fallback.path_id}
        if reference in data["m_FallbackFontAssetTable"]:
            raise ValueError("Fallback already linked")
        data["m_FallbackFontAssetTable"].append(reference)
        target.save_typetree(data); changed.add(object_key(target))
    target = confined(out/"files",config["file"])
    report = save_verified(env,top,target,before,changed,meta,res)
    image.save(out/"atlas.png")
    write_json(out/"stage.json",{"schemaVersion":1,"engine":"unity","root":str(root),
        "files":[{"path":config["file"],"originalSha256":config["sha256"],"stagedSha256":report["sha256"],"bytes":report["bytes"]}],
        "reports":[report],"glyphs":len(glyph_manifest["glyphs"]),"existingGlyphsPreserved":True,
        "inGameVerified":False,"addressablesCatalogVerified":False,"installReady":False})
    print(f"Verified TMP fallback with {len(glyph_manifest['glyphs'])} appended glyphs",flush=True)
