"""Stage explicit asset replacements without modifying the installed game.

Texture import is deliberately lossless RGBA32 and preserves dimensions and
mipmap count. Compressed source formats remain readable, but this writer does
not claim bit-identical recompression of an edited texture.
"""
import json
from pathlib import Path
from PIL import Image
from .assets import load, metadata, object_key, resources, save_verified, select, snapshot
from .paths import confined, digest, file_hash, write_json
from .verify import verify_operations


def apply_operation(env, operation, input_root):
    obj = select(env, operation["asset"], operation["pathId"], operation["type"])
    if digest(obj.get_raw_data()) != operation["objectSha256"]:
        raise ValueError("Object changed since export")
    input_file = confined(input_root, operation["input"])
    if file_hash(input_file) != operation["inputSha256"]:
        raise ValueError("Replacement input checksum mismatch")
    mode = operation["mode"]
    if mode == "texture" and obj.type.name == "Texture2D":
        data = obj.read()
        image = Image.open(input_file).convert("RGBA")
        if image.size != (data.m_Width, data.m_Height):
            raise ValueError("Artwork replacement must preserve texture dimensions")
        data.set_image(image, target_format=4, mipmap_count=max(1, data.m_MipCount or 1))
        data.save()
    elif mode == "text" and obj.type.name == "TextAsset":
        data = obj.read()
        data.m_Script = input_file.read_text(encoding="utf-8")
        data.save()
    elif mode == "typetree":
        original = obj.parse_as_dict()
        replacement = json.loads(input_file.read_text())
        if not isinstance(replacement, dict) or set(original) != set(replacement):
            raise ValueError("Type-tree replacement must preserve root fields")
        obj.save_typetree(replacement)
    else:
        raise ValueError("Unsupported operation or class")
    return object_key(obj)


def stage_assets(config_path, out):
    config_path, out = Path(config_path).resolve(), Path(out).resolve()
    config = json.loads(config_path.read_text())
    root = Path(config["root"]).resolve()
    if out == root or out.is_relative_to(root):
        raise ValueError("Stage must be outside the installed game")
    if config.get("schemaVersion") != 1 or not config.get("containers"):
        raise ValueError("Expected a nonempty version 1 asset plan")
    out.mkdir(parents=True, exist_ok=False)
    files, reports, seen = [], [], set()
    for container in config["containers"]:
        relative = container["path"]
        source = confined(root, relative)
        if source in seen:
            raise ValueError("Duplicate container in patch plan")
        seen.add(source)
        if file_hash(source) != container["sha256"]:
            raise ValueError("Source container changed since inventory")
        env, top = load(source)
        before, original_metadata, original_resources = snapshot(env), metadata(env), resources(top)
        changed = set()
        if not container["operations"]:
            raise ValueError("Container has no operations")
        for operation in container["operations"]:
            key = (operation["asset"], str(operation["pathId"]))
            if key in changed:
                raise ValueError("Duplicate operation on an object")
            changed.add(apply_operation(env, operation, config_path.parent))
        target = confined(out / "files", relative)
        report = save_verified(env, top, target, before, changed, original_metadata, original_resources)
        verify_operations(target,container["operations"],config_path.parent)
        reports.append({"path": relative, **report, "replacementContentVerified": True})
        files.append({"path": relative, "originalSha256": container["sha256"],
                      "stagedSha256": report["sha256"], "bytes": report["bytes"]})
        print(f"Verified {relative}: {len(changed)} changed objects", flush=True)
    write_json(out / "stage.json", {"schemaVersion": 1, "engine": "unity", "root": str(root),
        "files": files, "reports": reports, "inGameVerified": False,
        "addressablesCatalogVerified": False, "installReady": False})
