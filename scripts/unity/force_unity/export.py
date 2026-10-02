"""Export specifically selected Unity objects with source provenance."""
import json
from pathlib import Path
from .assets import load, select
from .paths import digest, file_hash, write_json


def export_object(container, asset, path_id, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    env, _ = load(container)
    obj = select(env, asset, path_id)
    kind = obj.type.name
    if kind == "Texture2D":
        data = obj.read()
        data.image.save(out / "texture.png")
        details = {"width": data.m_Width, "height": data.m_Height, "format": int(data.m_TextureFormat)}
    elif kind == "TextAsset":
        data = obj.read()
        (out / "text.txt").write_bytes(data.m_Script.encode("utf-8", "surrogateescape"))
        details = {"name": data.m_Name}
    else:
        write_json(out / "tree.json", obj.parse_as_dict())
        details = {}
    write_json(out / "source.json", {"container": str(Path(container).resolve()),
        "containerSha256": file_hash(container), "asset": asset, "pathId": str(path_id),
        "type": kind, "objectSha256": digest(obj.get_raw_data()), **details})
