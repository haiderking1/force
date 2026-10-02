"""Only explicit movie paths are installed; every replacement has a verified backup."""
import json
import os
import shutil
from pathlib import Path
from artifacts import valid
from runtime import digest, save
from project import fingerprint
from pipeline import clip_directory, selected
from schema import relative


def game_closed(names):
    wanted = {n.lower() for n in names}
    hits = []
    for directory in Path("/proc").iterdir():
        if not directory.name.isdigit():
            continue
        try:
            name = (directory / "comm").read_text().strip()
        except FileNotFoundError:
            continue
        except PermissionError:
            raise RuntimeError("Cannot check running processes; refusing game writes")
        if name.lower() in wanted:
            hits.append(f"{name} pid {directory.name}")
    if hits:
        raise RuntimeError("Close the game before installation: " + ", ".join(hits))


def game_path(root, name):
    target = (root / relative(name)).resolve()
    if root not in target.parents:
        raise ValueError("Movie path escapes the game directory")
    return target


def replace_verified(source, target, expected):
    temporary = target.with_name(target.name + ".force-artwork-tmp")
    if temporary.exists():
        raise RuntimeError("A previous install temporary file exists: " + str(temporary))
    try:
        shutil.copy2(source, temporary)
        if digest(temporary) != expected:
            raise OSError("Copied movie failed checksum validation")
        with temporary.open("rb") as file:
            os.fsync(file.fileno())
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def install(project, config, args):
    if not args.confirm or not args.preview:
        raise ValueError("Unvalidated in-game artwork requires --confirm --preview")
    root = Path(project["gameRoot"]).resolve(strict=True)
    backup = args.backup.resolve()
    if backup == root or root in backup.parents:
        raise ValueError("Backups must be outside the game directory")
    game_closed(config["processNames"])
    build = fingerprint(project, config)
    journal = Path(project["directory"]) / "installed.json"
    previous = json.loads(journal.read_text()) if journal.is_file() else {}
    rows = []
    for name in selected(project,args.movie):
        spec = project["movies"][name]
        exported = clip_directory(project, config, build, name) / "export"
        if not valid(exported):
            raise ValueError("Missing or modified export: " + name)
        target = game_path(root, spec["relativePath"])
        current = digest(target)
        expected = previous.get(name, spec["installedAtCreateSha256"])
        if current != expected:
            raise ValueError("Installed movie changed outside this project: " + name)
        source = exported / (name + ".bik")
        rows.append({"movie":name,"relativePath":spec["relativePath"],"beforeSha256":current,
            "installedSha256":digest(source),"source":str(source)})
    backup.mkdir(parents=True,exist_ok=False)
    manifest = {"version":1,"gameRoot":str(root),"processNames":config["processNames"],
        "project":project["directory"],"preview":True,"inGameTested":False,"files":rows}
    for row in rows:
        destination = backup / "files" / row["relativePath"]
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(game_path(root,row["relativePath"]),destination)
        if digest(destination) != row["beforeSha256"]:
            raise OSError("Backup checksum mismatch")
    save(backup / "manifest.json",manifest)
    game_closed(config["processNames"])
    for row in rows:
        if digest(game_path(root,row["relativePath"])) != row["beforeSha256"]:
            raise ValueError("Movie changed during backup")
    changed = []
    try:
        for row in rows:
            replace_verified(Path(row["source"]),game_path(root,row["relativePath"]),row["installedSha256"])
            changed.append(row)
        for row in rows:
            if digest(game_path(root,row["relativePath"])) != row["installedSha256"]:
                raise OSError("Installed movie verification failed")
    except BaseException:
        for row in reversed(changed):
            replace_verified(backup / "files" / row["relativePath"],game_path(root,row["relativePath"]),row["beforeSha256"])
        raise
    previous.update({row["movie"]:row["installedSha256"] for row in rows})
    save(journal,previous)
    save(build / "installed.json",manifest)
    print(f"Installed {len(rows)} movie previews. Backup: {backup}",flush=True)


def restore(backup, confirm):
    if not confirm:
        raise ValueError("Restore requires --confirm")
    backup = backup.resolve()
    manifest = json.loads((backup / "manifest.json").read_text())
    if manifest.get("version") != 1:
        raise ValueError("Unsupported artwork backup version")
    root = Path(manifest["gameRoot"]).resolve(strict=True)
    game_closed(manifest["processNames"])
    for row in manifest["files"]:
        original = backup / "files" / relative(row["relativePath"])
        if digest(original) != row["beforeSha256"]:
            raise ValueError("Backup was modified")
        if digest(game_path(root,row["relativePath"])) not in [row["beforeSha256"],row["installedSha256"]]:
            raise ValueError("Installed movie has unrelated changes")
    game_closed(manifest["processNames"])
    for row in manifest["files"]:
        replace_verified(backup / "files" / row["relativePath"],game_path(root,row["relativePath"]),row["beforeSha256"])
    journal = Path(manifest["project"]) / "installed.json"
    previous = json.loads(journal.read_text()) if journal.is_file() else {}
    previous.update({r["movie"]:r["beforeSha256"] for r in manifest["files"]})
    save(journal,previous)
    print("Restored backed-up movies and verified their checksums.",flush=True)
