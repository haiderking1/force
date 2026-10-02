"""Extract text candidates; binary TextAssets remain binary, never prose."""
import gc
import json
from pathlib import Path
from .assets import load, object_key
from .paths import confined, file_hash, write_json, outside


def inspect_text(source, container, wanted, out, serial):
    env,_ = load(source)
    objects = {object_key(o):o for o in env.objects}
    rows,failures = [],[]
    for index,key in enumerate(sorted(wanted)):
        obj = objects[key]
        locator = {"file":container["path"],"containerSha256":container["sha256"],
                   "asset":key[0],"pathId":key[1],"type":obj.type.name}
        try:
            tree = obj.parse_as_dict()
            if obj.type.name == "TextAsset":
                script = tree["m_Script"]
                data = script.encode("utf-8","surrogateescape") if isinstance(script,str) else bytes(script)
                try:
                    decoded = data.decode("utf-8")
                    textual = "\0" not in decoded
                except UnicodeDecodeError:
                    textual = False
                extension = "txt" if textual else "bin"
                filename = f"text-assets/{serial:05d}-{index:05d}.{extension}"
                destination = out/filename; destination.parent.mkdir(exist_ok=True)
                destination.write_bytes(data)
                rows.append({**locator,"field":"m_Script","name":tree.get("m_Name",""),
                             "content":filename,"bytes":len(data),
                             "classification":"unreviewed UTF-8 TextAsset" if textual else "binary TextAsset"})
                continue
            game_object = tree.get("m_GameObject",{})
            go = objects.get((key[0],str(game_object.get("m_PathID")))) if game_object.get("m_FileID")==0 else None
            go_tree = go.parse_as_dict() if go else {}
            rects = []
            for pair in go_tree.get("m_Component",[]):
                ref = pair.get("component",{})
                component = objects.get((key[0],str(ref.get("m_PathID")))) if ref.get("m_FileID")==0 else None
                if component is not None and component.type.name == "RectTransform":
                    rects.append(component.parse_as_dict())
            for field in ("m_text","m_Text"):
                if field in tree and isinstance(tree[field],str):
                    rows.append({**locator,"field":field,"name":go_tree.get("m_Name",""),"text":tree[field],
                        "font":tree.get("m_fontAsset"),"fontSize":tree.get("m_fontSize"),
                        "autoSize":tree.get("m_enableAutoSizing"),"rtl":tree.get("m_isRightToLeft"),
                        "rectTransforms":rects,"classification":"unreviewed component text"})
            if "m_TableData" in tree:
                rows.append({**locator,"field":"m_TableData","data":tree["m_TableData"],
                             "classification":"unreviewed localization table"})
        except Exception as error:
            failures.append({**locator,"error":str(error)})
    return rows,failures


def extract_text_candidates(inventory_dir, out):
    inventory_dir,out = Path(inventory_dir),Path(out)
    inventory = json.loads((inventory_dir/"inventory.json").read_text())
    outside(inventory["root"],out)
    out.mkdir(parents=True,exist_ok=False)
    rows,failures = [],[]
    for serial,container in enumerate(inventory["containers"]):
        index = json.loads(confined(inventory_dir,container["record"]).read_text())
        wanted = {(o["asset"],o["pathId"]) for o in index["objects"] if o["type"] == "TextAsset" or
                  (o["type"] == "MonoBehaviour" and set(o.get("fields",[])) & {"m_text","m_Text","m_TableData"})}
        if not wanted:
            continue
        source = confined(inventory["root"],container["path"])
        if file_hash(source) != container["sha256"]:
            raise ValueError("Inventory is stale")
        extracted,errors = inspect_text(source,container,wanted,out,serial)
        rows.extend(extracted);failures.extend(errors)
        gc.collect()
    write_json(out/"candidates.json",{"schemaVersion":1,"records":rows,"failures":failures,
        "coverage":"TextAssets and recognized text fields with readable type trees; not an installable translation corpus"})
    print(f"Extracted {len(rows)} text candidates; {len(failures)} errors",flush=True)
