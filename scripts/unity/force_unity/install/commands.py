"""Guarded install/restore entrypoints for verified file stages."""
import json
import uuid
from pathlib import Path
from ..paths import confined, file_hash, write_json
from .processes import assert_closed
from .transaction import checked_copy, outside, replace_files


def validate_rows(root, source_root, rows, current_key, source_key):
    if not isinstance(rows,list) or not rows:
        raise ValueError("Manifest must contain files")
    destinations = set()
    for row in rows:
        destination = confined(root,row["path"])
        if destination in destinations:
            raise ValueError("Duplicate destination")
        destinations.add(destination)
        if not destination.is_file() or file_hash(destination) != row[current_key]:
            raise ValueError("Installed file changed since staging/installation: " + row["path"])
        if file_hash(confined(source_root,row["path"])) != row[source_key]:
            raise ValueError("Replacement or backup checksum mismatch: " + row["path"])


def apply(stage_dir, backup_dir, confirm=False):
    if not confirm:
        raise ValueError("apply requires --confirm")
    stage_dir,backup_dir = Path(stage_dir).resolve(),Path(backup_dir).resolve()
    manifest = json.loads((stage_dir/"stage.json").read_text())
    if manifest.get("schemaVersion") != 1 or manifest.get("installReady") is not True:
        raise ValueError("Stage is not approved for installation; review its rendering and coverage blockers")
    root = Path(manifest["root"]).resolve()
    outside(root,backup_dir); outside(root,stage_dir); outside(stage_dir,backup_dir)
    names = manifest.get("processNames",[])
    assert_closed(names)
    rows = manifest["files"]
    validate_rows(root,stage_dir/"files",rows,"originalSha256","stagedSha256")
    backup_dir.mkdir(parents=True,exist_ok=False)
    for row in rows:
        checked_copy(confined(root,row["path"]),confined(backup_dir/"files",row["path"]),row["originalSha256"])
    backup = {"schemaVersion":1,"root":str(root),"processNames":names,"files":rows,"state":"backed-up"}
    write_json(backup_dir/"backup.json",backup)
    # Recheck the live sources after backup, before preparing replacements.
    validate_rows(root,stage_dir/"files",rows,"originalSha256","stagedSha256")
    try:
        replace_files(root,stage_dir/"files",rows,"stagedSha256",lambda:assert_closed(names))
    except Exception:
        replace_files(root,backup_dir/"files",rows,"originalSha256",lambda:assert_closed(names))
        backup["state"]="rolled-back"; write_json(backup_dir/"backup.json",backup)
        raise
    backup["state"]="installed"; write_json(backup_dir/"backup.json",backup)
    return backup


def restore(backup_dir, confirm=False):
    if not confirm:
        raise ValueError("restore requires --confirm")
    backup_dir = Path(backup_dir).resolve()
    backup = json.loads((backup_dir/"backup.json").read_text())
    if backup.get("schemaVersion") != 1 or backup.get("state") != "installed":
        raise ValueError("Backup is not a completed installation")
    root = Path(backup["root"]).resolve(); outside(root,backup_dir)
    names,rows = backup["processNames"],backup["files"]
    assert_closed(names)
    validate_rows(root,backup_dir/"files",rows,"stagedSha256","originalSha256")
    recovery = backup_dir / ("restore-recovery-" + uuid.uuid4().hex)
    recovery.mkdir()
    for row in rows:
        checked_copy(confined(root,row["path"]),confined(recovery,row["path"]),row["stagedSha256"])
    try:
        replace_files(root,backup_dir/"files",rows,"originalSha256",lambda:assert_closed(names))
    except Exception:
        replace_files(root,recovery,rows,"stagedSha256",lambda:assert_closed(names))
        raise
    backup["state"]="restored"; write_json(backup_dir/"backup.json",backup)
    return backup
