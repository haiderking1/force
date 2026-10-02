import hashlib
import json
from pathlib import Path
from artifacts import stage, valid
from runtime import ROOT, run, save
from project import fingerprint


def selected(project, names):
    result = names or list(project["movies"])
    if len(result) != len(set(result)) or any(n not in project["movies"] for n in result):
        raise ValueError("Unknown or duplicate movie selection")
    return result


def context(project, config):
    directory = Path(project["directory"])
    build = fingerprint(project, config)
    prepared = build / "prepared"
    lettering = build / "lettering"
    stage(lettering, lambda out: run(["bun", "--no-env-file", ROOT / "scripts/artwork/prepare-lettering.ts", directory / "config.json", out], cwd=ROOT))
    stage(prepared, lambda out: run([project["tools"]["python"], ROOT / "scripts/artwork/opencv/prepare_cli.py", directory / "config.json", lettering, out], cwd=ROOT))
    return build, prepared


def clip_directory(project, config, build, name):
    inputs = json.loads((build / "inputs.json").read_text())
    labels = config["movies"][name]
    identity = {"source":inputs["sources"][name], "font":inputs["font"], "implementation":inputs["implementation"],
        "labels":[s for s in config["labels"] if s["id"] in labels],
        "references":{n:inputs["references"][n] for n in labels},
        "corrections":[c for c in inputs["corrections"] if c["movie"] == name]}
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:20]
    result = Path(project["directory"]) / "cache" / name / key
    result.mkdir(parents=True, exist_ok=True)
    return result


def track_movie(project, config, build, prepared, name):
    directory = Path(project["directory"])
    clip = clip_directory(project, config, build, name)
    tracking = clip / "tracking"
    stage(tracking, lambda out: run([project["tools"]["python"], ROOT / "scripts/artwork/opencv/render.py",
        directory / "config.json", prepared, directory / "sources" / (name + ".bik"), out,
        "--track-only", "--corrections", directory / "corrections.json"], cwd=ROOT))
    return clip


def track(project, config, names):
    build, prepared = context(project, config)
    for name in selected(project, names):
        print("Tracking " + name, flush=True)
        track_movie(project, config, build, prepared, name)
    print("Tracking saved; run artwork review for uncertain frames.", flush=True)


def render(project, config, names):
    from export import export_movie
    build, prepared = context(project, config)
    directory = Path(project["directory"])
    for name in selected(project, names):
        print("Building " + name, flush=True)
        clip = track_movie(project, config, build, prepared, name)
        stage(clip / "frames", lambda out: run([project["tools"]["python"], ROOT / "scripts/artwork/opencv/render.py",
            directory / "config.json", prepared, directory / "sources" / (name + ".bik"), out,
            "--tracking", clip / "tracking/tracking.json"], cwd=ROOT))
        stage(clip / "export", lambda out: export_movie(project, name, clip / "frames", out))
        print("Export verified: " + name, flush=True)
