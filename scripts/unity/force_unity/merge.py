"""Combine verified file stages; rebuild one catalog from the original game."""
import json
from pathlib import Path
from .addressables import stage_catalog
from .install.transaction import checked_copy, outside
from .paths import confined, file_hash, write_json


def merge_stages(stages, out, catalog=None):
    if not stages:
        raise ValueError("At least one stage is required")
    out = Path(out).resolve()
    manifests = [(Path(stage).resolve(),json.loads((Path(stage)/"stage.json").read_text())) for stage in stages]
    root = Path(manifests[0][1]["root"]).resolve()
    outside(root,out)
    selected, names, sources = {},set(),[]
    for directory,manifest in manifests:
        outside(directory,out);outside(root,directory)
        if manifest.get("schemaVersion") != 1 or manifest.get("engine") != "unity" or Path(manifest["root"]).resolve() != root:
            raise ValueError("Stages must describe the same Unity installation")
        if not manifest.get("files"):
            raise ValueError("Cannot merge an empty stage")
        names.update(manifest.get("processNames",[]))
        sources.append({"path":str(directory),"manifestSha256":file_hash(directory/"stage.json")})
        for row in manifest["files"]:
            live,staged = confined(root,row["path"]),confined(directory/"files",row["path"])
            if file_hash(live) != row["originalSha256"] or file_hash(staged) != row["stagedSha256"]:
                raise ValueError("Cannot merge a stale or modified stage")
            if row["path"] == catalog:
                continue
            if row["path"] in selected:
                previous,_ = selected[row["path"]]
                if previous["originalSha256"] != row["originalSha256"] or previous["stagedSha256"] != row["stagedSha256"]:
                    raise ValueError("Conflicting replacements must be rebuilt together: " + row["path"])
            else:selected[row["path"]]=(row,staged)
    if not selected:
        raise ValueError("Merged stage has no replacement resources")
    out.mkdir(parents=True,exist_ok=False)
    for row,source in selected.values():
        checked_copy(source,confined(out/"files",row["path"]),row["stagedSha256"])
    write_json(out/"stage.json",{"schemaVersion":1,"engine":"unity","root":str(root),"processNames":sorted(names),
        "files":[row for row,_ in selected.values()],"sources":sources,"installReady":False,"inGameVerified":False,
        "addressablesCatalogVerified":False,"blockers":["Combined stage still requires rendering, artwork, and coverage approval"]})
    if catalog is not None:
        stage_catalog(out,catalog)
