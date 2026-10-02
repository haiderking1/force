"""Addressables JSON catalog v1 entry/extra-data patching.

Only AssetBundleRequestOptions JSON objects are edited. Cache hashes are new
128-bit content keys, not claims to reproduce Unity's build-system Hash128.
Nonzero source CRCs must match the source bundle before any catalog is staged.
"""
import base64
import copy
import hashlib
import json
import struct
import zlib
from pathlib import Path
from UnityPy.files import BundleFile
from .assets import load
from .paths import confined, file_hash, write_json


def bundle_crc(path):
    _, top = load(path)
    if not isinstance(top, BundleFile):
        raise ValueError("CRC requires a UnityFS bundle")
    crc = 0
    # UnityPy's writer concatenates directory members without gaps. For source
    # files with a stored CRC, equality below proves this layout matches them.
    for member in top.files.values():
        data = member.reader.bytes if hasattr(member, "reader") else member.bytes
        crc = zlib.crc32(data, crc)
    return crc


def decode_options(extra, offset):
    start = offset
    if offset < 0 or offset >= len(extra) or extra[offset] != 7:
        raise ValueError("Expected Addressables serialized JSON object")
    offset += 1
    names = []
    for _ in range(2):
        length = extra[offset]
        offset += 1
        names.append(extra[offset:offset+length].decode("ascii"))
        offset += length
    if names[1] != "UnityEngine.ResourceManagement.ResourceProviders.AssetBundleRequestOptions":
        raise ValueError("Unsupported Addressables extra-data type")
    size = struct.unpack_from("<i", extra, offset)[0]
    if size < 0 or offset+4+size > len(extra):
        raise ValueError("Addressables JSON bounds are invalid")
    return json.loads(extra[offset+4:offset+4+size].decode("utf-16-le")), offset, offset+4+size, start


def patch_catalog(catalog, replacements):
    """replacements maps exact internal IDs to oldCrc/crc/hash/size records."""
    result = copy.deepcopy(catalog)
    entries = bytearray(base64.b64decode(catalog["m_EntryDataString"], validate=True))
    extra = base64.b64decode(catalog["m_ExtraDataString"], validate=True)
    count = struct.unpack_from("<i", entries)[0]
    if count < 0 or len(entries) != 4 + count*28:
        raise ValueError("Unsupported Addressables entry layout")
    edits, matched = {}, set()
    for i in range(count):
        internal, _, _, _, offset, _, _ = struct.unpack_from("<7i", entries, 4+i*28)
        identifier = catalog["m_InternalIds"][internal]
        replacement = replacements.get(identifier)
        if replacement is None:
            continue
        options, length_offset, end, start = decode_options(extra, offset)
        if options["m_Crc"] not in (0, replacement["oldCrc"]):
            raise ValueError("Original catalog CRC does not match source bundle")
        options.update(m_Crc=replacement["crc"], m_Hash=replacement["hash"], m_BundleSize=replacement["size"])
        encoded = json.dumps(options, separators=(",", ":")).encode("utf-16-le")
        value = extra[start:length_offset] + struct.pack("<i", len(encoded)) + encoded
        if start in edits and edits[start] != (end, value):
            raise ValueError("Conflicting shared Addressables options")
        edits[start] = (end, value)
        matched.add(identifier)
    if matched != set(replacements):
        raise ValueError("Some edited bundles are missing from the catalog")
    output, cursor, shifts = bytearray(), 0, []
    for start, (end, value) in sorted(edits.items()):
        if start < cursor:
            raise ValueError("Overlapping catalog objects")
        output.extend(extra[cursor:start]); output.extend(value)
        shifts.append((start, end, len(value)-(end-start)))
        cursor = end
    output.extend(extra[cursor:])
    for i in range(count):
        address = 4+i*28+16
        offset = struct.unpack_from("<i", entries, address)[0]
        if offset < 0:
            continue
        if any(start < offset < end for start,end,_ in shifts):
            raise ValueError("Catalog pointer enters an edited object's interior")
        shift = sum(delta for _,end,delta in shifts if end <= offset)
        struct.pack_into("<i", entries, address, offset+shift)
    result["m_EntryDataString"] = base64.b64encode(entries).decode("ascii")
    result["m_ExtraDataString"] = base64.b64encode(output).decode("ascii")
    # Resolve the rebuilt pointers and validate the requested options again.
    for i in range(count):
        internal, _, _, _, offset, _, _ = struct.unpack_from("<7i", entries, 4+i*28)
        identifier = result["m_InternalIds"][internal]
        if identifier in replacements:
            options, *_ = decode_options(output, offset)
            expected = replacements[identifier]
            if (options["m_Crc"], options["m_Hash"], options["m_BundleSize"]) != (expected["crc"], expected["hash"], expected["size"]):
                raise ValueError("Catalog verification failed")
    return result


def stage_catalog(stage_dir, relative):
    stage_dir = Path(stage_dir)
    manifest = json.loads((stage_dir/"stage.json").read_text())
    root = Path(manifest["root"])
    source = confined(root, relative)
    catalog = json.loads(source.read_text())
    replacements = {}
    for row in manifest["files"]:
        if not row["path"].endswith(".bundle"):
            continue
        original, staged = confined(root,row["path"]), confined(stage_dir/"files",row["path"])
        if file_hash(original) != row["originalSha256"] or file_hash(staged) != row["stagedSha256"]:
            raise ValueError("Stale stage or original bundle")
        matches = [x for x in catalog["m_InternalIds"] if x.replace("\\", "/").endswith("/"+original.name)]
        if len(matches) != 1:
            raise ValueError("Bundle catalog location is not unique")
        with staged.open("rb") as stream:
            cache_hash = hashlib.file_digest(stream, "md5").hexdigest()
        replacements[matches[0]] = {"oldCrc":bundle_crc(original), "crc":bundle_crc(staged),
                                   "hash":cache_hash, "size":staged.stat().st_size}
    if not replacements:
        raise ValueError("No bundled files to verify against catalog")
    result = patch_catalog(catalog, replacements)
    target = confined(stage_dir/"files",relative)
    if target.exists():
        raise ValueError("Catalog already staged")
    write_json(target,result)
    manifest["files"].append({"path":relative,"originalSha256":file_hash(source),
                               "stagedSha256":file_hash(target),"bytes":target.stat().st_size})
    manifest["addressablesCatalogVerified"] = True
    write_json(stage_dir/"stage.json",manifest)
