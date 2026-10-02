"""Texture review sheets, retaining per-image locators and explicit failures."""
import gc
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw
from .assets import load, select
from .paths import confined, file_hash, write_json, outside


def texture_review(inventory_dir, out, pattern):
    inventory_dir, out = Path(inventory_dir), Path(out)
    inventory = json.loads((inventory_dir / "inventory.json").read_text())
    root = Path(inventory["root"])
    outside(root,out)
    out.mkdir(parents=True, exist_ok=False)
    (out / "images").mkdir()
    matcher = re.compile(pattern, re.IGNORECASE)
    records, failures, tiles = [], [], []
    sheet_index = 0
    def flush():
        nonlocal sheet_index
        if not tiles:
            return
        sheet_index += 1
        sheet = Image.new("RGB", (1440, 220 * ((len(tiles)+5)//6)), "#cccccc")
        for i, tile in enumerate(tiles):
            sheet.paste(tile, ((i%6)*240, (i//6)*220))
        sheet.save(out / f"sheet-{sheet_index:03d}.jpg", quality=92)
        tiles.clear()
    for container in inventory["containers"]:
        row = json.loads(confined(inventory_dir, container["record"]).read_text())
        targets = [o for o in row["objects"] if o["type"] == "Texture2D" and
                   o.get("width", 0) > 0 and o.get("height", 0) > 0 and matcher.search(o.get("name", ""))]
        if not targets:
            continue
        source = confined(root, container["path"])
        if file_hash(source) != container["sha256"]:
            raise ValueError("Inventory is stale")
        env, _ = load(source)
        for target in targets:
            try:
                obj = select(env, target["asset"], target["pathId"], "Texture2D")
                image = obj.read().image.convert("RGBA")
                number = len(records) + 1
                filename = f"images/{number:05d}.png"
                image.save(out / filename)
                records.append({"number": number, "file": container["path"], "containerSha256": container["sha256"],
                                "image": filename, **target, "review": "pending"})
                image.thumbnail((236,180))
                tile = Image.new("RGB", (240,220), "#cccccc")
                tile.paste(image, ((240-image.width)//2, (180-image.height)//2), image)
                draw = ImageDraw.Draw(tile)
                draw.text((4,182), f"{number}: {target['name'][:35]}", fill="black")
                draw.text((4,198), f"{target['width']} x {target['height']}", fill="black")
                tiles.append(tile)
                if len(tiles) == 30:
                    flush()
            except Exception as error:
                failures.append({"file": container["path"], "object": target["pathId"], "error": str(error)})
        del env
        gc.collect()
    flush()
    write_json(out / "review.json", {"pattern": pattern, "records": records, "failures": failures,
        "coverage": "name-filtered candidates, not exhaustive visible artwork coverage"})
    print(f"Exported {len(records)} textures, {len(failures)} failures", flush=True)
