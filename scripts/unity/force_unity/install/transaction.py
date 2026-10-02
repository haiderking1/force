"""Reusable multi-file replacement with verified backups and rollback."""
import os
import shutil
import uuid
from pathlib import Path
from ..paths import confined, file_hash, outside


def checked_copy(source, destination, expected):
    destination = Path(destination)
    destination.parent.mkdir(parents=True,exist_ok=True)
    with Path(source).open("rb") as reader, destination.open("xb") as writer:
        shutil.copyfileobj(reader,writer,1024*1024)
        writer.flush(); os.fsync(writer.fileno())
    if file_hash(destination) != expected:
        raise ValueError("Copied file checksum mismatch")


def replace_files(root, source_root, rows, source_key, guard):
    """rows have path plus hashes. Stage all temp files before replacing any."""
    temps, replaced = [],[]
    token = uuid.uuid4().hex
    try:
        for row in rows:
            destination = confined(root,row["path"])
            temporary = destination.with_name(destination.name+".force-"+token)
            temps.append(temporary)
            checked_copy(confined(source_root,row["path"]),temporary,row[source_key])
        guard()
        for row,temp in zip(rows,temps,strict=True):
            destination = confined(root,row["path"])
            os.replace(temp,destination)
            replaced.append(row)
        for row in rows:
            if file_hash(confined(root,row["path"])) != row[source_key]:
                raise ValueError("Installed file verification failed")
    finally:
        for temporary in temps:
            temporary.unlink(missing_ok=True)
