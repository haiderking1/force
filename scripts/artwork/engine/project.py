import contextlib
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path
from runtime import ROOT, digest, save, probe, video_stream
from schema import validate_config


def load(directory):
    directory = Path(directory).resolve()
    project = json.loads((directory / "project.json").read_text())
    if project.get("version") != 1:
        raise ValueError("Unsupported artwork project version")
    project["directory"] = str(directory)
    # Child tools use this locked environment, not an old saved venv path.
    # Do not resolve this executable: resolving a venv symlink bypasses the venv.
    project["tools"]["python"] = sys.executable
    config = validate_config(json.loads((directory / "config.json").read_text()))
    return project, config


def create(args):
    config = validate_config(json.loads(args.config.read_text()))
    directory = args.out.resolve()
    root = args.game_root.resolve(strict=True)
    if directory == root or root in directory.parents:
        raise ValueError("Project must be outside the game directory")
    directory.mkdir(parents=True, exist_ok=False)
    refs = directory / "references"
    refs.mkdir()
    original_refs = Path(config["referenceDirectory"]).resolve()
    for spec in config["labels"]:
        destination = refs / spec["reference"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original_refs / spec["reference"], destination)
    font = directory / "font.ttf"
    shutil.copy2(Path(config["font"]).resolve(), font)
    config["font"] = str(font)
    config["referenceDirectory"] = str(refs)
    save(directory / "config.json", config)
    sources = directory / "sources"
    sources.mkdir()
    movies = {}
    for name in config["movies"]:
        relative = Path(config["movieDirectory"]) / (name + ".bik")
        installed = root / relative
        source = args.originals / relative if args.originals and (args.originals / relative).is_file() else installed
        output = sources / (name + ".bik")
        shutil.copy2(source, output)
        source_hash = digest(source)
        if digest(output) != source_hash:
            raise OSError("Source snapshot checksum mismatch")
        metadata = probe(output)
        if video_stream(metadata).get("codec_tag_string") != "BIKi":
            raise ValueError("Only BIKi export is currently implemented")
        movies[name] = {"sourceSha256": source_hash, "installedAtCreateSha256": digest(installed), "relativePath": str(relative), "metadata": metadata}
        print(f"Snapshot {name}", flush=True)
    project = {"version":1, "gameRoot":str(root), "movies":movies,
        "tools":{"encoder":str(args.encoder.resolve()), "winePrefix":str(args.wine_prefix.resolve())}}
    save(directory / "project.json", project)
    save(directory / "corrections.json", [])
    print(f"Created artwork project: {directory}", flush=True)


@contextlib.contextmanager
def locked(directory):
    lock = Path(directory) / ".lock"
    try:
        lock.mkdir()
    except FileExistsError:
        raise RuntimeError(f"Project is locked: {lock}. Check its owner before removing a stale lock.")
    save(lock / "owner.json", {"pid":os.getpid()})
    try:
        yield
    finally:
        shutil.rmtree(lock)


def fingerprint(project, config):
    directory = Path(project["directory"])
    inputs = {"config":config, "corrections":json.loads((directory / "corrections.json").read_text()), "font":digest(config["font"])}
    inputs["references"] = {s["id"]:digest(Path(config["referenceDirectory"]) / s["reference"]) for s in config["labels"]}
    inputs["implementation"] = {str(p.relative_to(ROOT)):digest(p) for base in [ROOT / "scripts/artwork", ROOT / "src/video/bink"] for p in sorted(base.rglob("*")) if p.suffix in [".py", ".ts"]}
    for name in ["pyproject.toml", "uv.lock"]:
        inputs["implementation"][name] = digest(ROOT / name)
    inputs["sources"] = {}
    for name, spec in project["movies"].items():
        actual = digest(directory / "sources" / (name + ".bik"))
        if actual != spec["sourceSha256"]:
            raise ValueError("Immutable source changed: " + name)
        inputs["sources"][name] = actual
    key = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()[:20]
    build = directory / "builds" / key
    build.mkdir(parents=True, exist_ok=True)
    save(build / "inputs.json", inputs)
    return build
