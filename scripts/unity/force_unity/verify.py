"""Semantic checks for supported replacements after container reconstruction."""
from PIL import Image
from .assets import load, select
from .paths import confined


def verify_operations(container, operations, input_root):
    env,_ = load(container)
    for operation in operations:
        obj = select(env,operation["asset"],operation["pathId"],operation["type"])
        source = confined(input_root,operation["input"])
        if operation["mode"] == "texture":
            actual = obj.read().image.convert("RGBA")
            expected = Image.open(source).convert("RGBA")
            if actual.size != expected.size or actual.tobytes() != expected.tobytes():
                raise ValueError("Reopened texture differs from approved replacement pixels")
        elif operation["mode"] == "text":
            actual = obj.read().m_Script
            if isinstance(actual,bytes):actual = actual.decode("utf-8")
            if actual != source.read_text(encoding="utf-8"):
                raise ValueError("Reopened TextAsset differs from replacement text")
