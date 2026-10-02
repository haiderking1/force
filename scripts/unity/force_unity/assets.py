"""Explicit object selection and verified UnityFS/serialized-file rebuilding."""
from pathlib import Path
import UnityPy
from UnityPy.files import BundleFile, SerializedFile
from UnityPy.streams import EndianBinaryReader
from .paths import digest


def load(path):
    env = UnityPy.load(str(path))
    if len(env.files) != 1:
        raise ValueError("Expected one top-level container")
    top = next(iter(env.files.values()))
    if not isinstance(top, (BundleFile, SerializedFile)):
        raise ValueError("Unsupported container type")
    if isinstance(top, BundleFile) and (top.signature != "UnityFS" or top.decryptor is not None):
        raise ValueError("Writing supports unencrypted UnityFS bundles only")
    return env, top


def object_key(obj):
    return (obj.assets_file.name, str(obj.path_id))


def select(env, asset, path_id, expected_type=None):
    found = [o for o in env.objects if object_key(o) == (asset, str(path_id))]
    if len(found) != 1:
        raise ValueError(f"Object locator is not unique: {asset}/{path_id}")
    obj = found[0]
    if expected_type is not None and obj.type.name != expected_type:
        raise ValueError("Object class does not match requested operation")
    return obj


def snapshot(env):
    rows = {}
    for obj in env.objects:
        key = object_key(obj)
        if key in rows:
            raise ValueError("Duplicate serialized object locator")
        rows[key] = (obj.type.name, digest(obj.get_raw_data()))
    return rows


def metadata(env):
    return {a.name: {"version": a.unity_version, "externals": [e.path for e in a.externals],
                     "types": [(t.class_id, t.script_type_index) for t in a.types]}
            for a in env.assets}


def resources(top):
    result = {}
    for name, node in top.files.items():
        if isinstance(node, EndianBinaryReader):
            result[name] = digest(node.bytes)
    return result


def save_verified(env, top, output, before, changed, original_metadata, original_resources):
    expected = dict(before)
    for key in changed:
        obj = select(env, *key)
        if not obj.data:
            raise ValueError("Selected object was not serialized")
        expected[key] = (obj.type.name, digest(obj.data))
    data = top.save(packer="lz4") if isinstance(top, BundleFile) else top.save()
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as stream:
        stream.write(data)
    reopened, rebuilt = load(output)
    if snapshot(reopened) != expected:
        raise ValueError("Rebuilt object bytes differ from expected changes or untouched originals")
    if metadata(reopened) != original_metadata or resources(rebuilt) != original_resources:
        raise ValueError("Asset metadata or streamed resources changed unexpectedly")
    return {"sha256": digest(data), "bytes": len(data), "changedObjects": len(changed),
            "unchangedObjects": len(before) - len(changed), "roundTripVerified": True}
