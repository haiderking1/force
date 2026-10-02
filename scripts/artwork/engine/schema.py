"""Validate project/config identities and all paths used for generated artifacts."""
import math
import re
from pathlib import Path


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", value):
        raise ValueError(f"Invalid artwork identifier: {value!r}")
    return value


def relative(value):
    if not isinstance(value, str):
        raise ValueError("Expected relative path")
    path = Path(value)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError("Unsafe relative path: " + value)
    return path


def points(value, count=None):
    if not isinstance(value, list) or len(value) < 3 or (count and len(value) != count):
        raise ValueError("Invalid polygon")
    for point in value:
        if not isinstance(point, list) or len(point) != 2 or not all(type(n) in (int, float) and math.isfinite(n) for n in point):
            raise ValueError("Invalid polygon coordinates")
    return value


def validate_config(config):
    if not isinstance(config, dict) or not isinstance(config.get("labels"), list) or not config["labels"]:
        raise ValueError("Configuration needs artwork labels")
    relative(config["movieDirectory"])
    if not config.get("processNames") or not all(isinstance(n, str) and n for n in config["processNames"]):
        raise ValueError("Specify game process names for installation safety")
    labels = set()
    for spec in config["labels"]:
        name = identifier(spec["id"])
        if name in labels:
            raise ValueError("Duplicate artwork identity")
        labels.add(name)
        relative(spec["reference"])
        for key in ["trackingPolygon", "erasePolygon"]:
            points(spec[key])
        if "quad" in spec:
            points(spec["quad"], 4)
        elif "curve" not in spec:
            raise ValueError("Lettering needs a quad or curve")
        if not isinstance(spec["text"], str) or not spec["text"] or not re.fullmatch(r"#[0-9a-fA-F]{6}", spec["color"]):
            raise ValueError("Invalid lettering text or color")
        if any(type(spec[k]) is not int or spec[k] <= 0 for k in ["labelWidth", "labelHeight"]):
            raise ValueError("Invalid lettering dimensions")
        if spec["eraseMode"] not in ["above", "below"] or spec["eraseChannel"] not in [0,1,2] or not 0 <= spec["eraseThreshold"] <= 255 or not 0 <= spec["opacity"] <= 1:
            raise ValueError("Invalid artwork mask settings")
    if not isinstance(config.get("movies"), dict) or not config["movies"]:
        raise ValueError("Configuration needs linked movies")
    for name, linked in config["movies"].items():
        identifier(name)
        if not isinstance(linked, list) or not linked or any(label not in labels for label in linked):
            raise ValueError("Movie references unknown artwork")
    return config
