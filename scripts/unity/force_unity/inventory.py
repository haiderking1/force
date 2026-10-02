"""Sequential Unity container inventory, including explicit parsing failures.

MonoBehaviours without embedded type trees remain opaque. We do not guess
IL2CPP layouts or call a missing tree an empty localization component.
"""
import collections
import gc
from pathlib import Path
import UnityPy
from .paths import digest, file_hash, write_json


def candidates(root):
    for path in sorted(Path(root).rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        if path.suffix in {".assets", ".bundle"} or path.name in {
            "globalgamemanagers", "unity default resources", "unity_builtin_extra"
        } or (path.name.startswith("level") and path.name[5:].isdigit()):
            yield path


def inspect_container(path, relative):
    env = UnityPy.load(str(path))
    assets = [{"name": a.name, "version": a.unity_version,
               "embeddedTypeTrees": sum(bool(t.node) for t in a.types)} for a in env.assets]
    if not assets:
        raise ValueError("No serialized assets found")
    objects = []
    for obj in env.objects:
        row = {"asset": obj.assets_file.name, "pathId": str(obj.path_id),
               "type": obj.type.name, "bytes": obj.byte_size,
               "sha256": digest(obj.get_raw_data())}
        try:
            if obj.type.name == "MonoBehaviour":
                data = obj.parse_as_dict()
                row["name"] = data.get("m_Name", "")
                row["script"] = data.get("m_Script")
                row["fields"] = list(data)
                if "m_CharacterTable" in data:
                    row["font"] = {"characters": len(data["m_CharacterTable"]),
                                   "glyphs": len(data.get("m_GlyphTable", [])),
                                   "atlasTextures": data.get("m_AtlasTextures", []),
                                   "faceInfo": data.get("m_FaceInfo"),
                                   "populationMode": data.get("m_AtlasPopulationMode")}
                row["hasTypeTree"] = True
            elif obj.type.name in {"Texture2D", "TextAsset", "Font", "MonoScript", "Sprite", "Material", "VideoClip"}:
                data = obj.read()
                row["name"] = getattr(data, "m_Name", "")
                if obj.type.name == "Texture2D":
                    row.update(width=data.m_Width, height=data.m_Height, format=int(data.m_TextureFormat))
                if obj.type.name == "MonoScript":
                    row.update(className=data.m_ClassName, namespace=data.m_Namespace, assembly=data.m_AssemblyName)
        except Exception as error:
            row["inspectionError"] = f"{type(error).__name__}: {error}"
        objects.append(row)
    return {"path": relative, "sha256": file_hash(path), "bytes": path.stat().st_size,
            "assets": assets, "objects": objects}


def inventory(root, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output == root or output.is_relative_to(root):
        raise ValueError("Inventory output must be outside the installed game")
    output.mkdir(parents=True, exist_ok=False)
    paths = list(candidates(root))
    report = {"schemaVersion": 1, "root": str(root), "containers": [], "failures": [],
              "counts": {}, "inGameVerified": False}
    counts = collections.Counter()
    for index, path in enumerate(paths, 1):
        relative = path.relative_to(root).as_posix()
        try:
            row = inspect_container(path, relative)
            record = f"containers/{index:05d}.json"
            write_json(output / record, row)
            report["containers"].append({"path": relative, "record": record, "sha256": row["sha256"]})
            counts.update(o["type"] for o in row["objects"])
        except Exception as error:
            report["failures"].append({"path": relative, "error": f"{type(error).__name__}: {error}"})
        if index % 50 == 0 or index == len(paths):
            report["counts"] = dict(counts)
            write_json(output / "inventory.json", report)
            print(f"Unity inventory {index}/{len(paths)}, failed {len(report['failures'])}", flush=True)
        gc.collect()
    return report
