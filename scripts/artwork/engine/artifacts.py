import json
import shutil
from pathlib import Path
from runtime import digest, save


def valid(directory):
    manifest = Path(directory) / "complete.json"
    if not manifest.is_file():
        return False
    expected = json.loads(manifest.read_text())
    return all((Path(directory) / name).is_file() and digest(Path(directory) / name) == checksum for name, checksum in expected.items())


def stage(directory, action):
    directory = Path(directory)
    if valid(directory):
        print("Cached: " + str(directory), flush=True)
        return
    pending = directory.with_name(directory.name + ".pending")
    if pending.exists():
        shutil.rmtree(pending)
    try:
        action(pending)
        checksums = {str(p.relative_to(pending)):digest(p) for p in sorted(pending.rglob("*")) if p.is_file()}
        if not checksums:
            raise RuntimeError("Stage produced no artifacts")
        save(pending / "complete.json", checksums)
        if directory.exists():
            shutil.rmtree(directory)
        pending.rename(directory)
    except BaseException:
        print("Incomplete stage retained at " + str(pending), flush=True)
        raise
