"""Confined paths and content fingerprints shared by Unity operations."""
import hashlib
import json
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def confined(root, relative):
    if not str(relative) or "\\" in str(relative) or ":" in str(relative):
        raise ValueError("Expected a portable relative path")
    relative = Path(relative)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Expected confined relative path: {relative}")
    target = (Path(root) / relative).resolve()
    if not target.is_relative_to(Path(root).resolve()):
        raise ValueError("Path escapes root through a symlink")
    return target


def outside(root, other):
    root,other = Path(root).resolve(),Path(other).resolve()
    if root == other or other.is_relative_to(root) or root.is_relative_to(other):
        raise ValueError("Game and artifact directories must not overlap")


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\n")
    temporary.replace(path)
