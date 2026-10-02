"""External tools have no automatic deadlines; cancellation stops their process groups."""
import hashlib
import json
import os
import signal
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def digest(file):
    with Path(file).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def save(file, value):
    file = Path(file)
    file.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".force-", dir=file.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def run(argv, *, cwd=None, env=None, capture=False):
    child = subprocess.Popen([str(a) for a in argv], cwd=cwd, env=env,
        stdout=subprocess.PIPE if capture else None, start_new_session=True)
    try:
        output, _ = child.communicate()
        if child.returncode:
            raise RuntimeError(f"{argv[0]} exited {child.returncode}")
        return output.decode() if capture else None
    except BaseException:
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        child.wait()
        raise


def probe(file):
    return json.loads(run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], capture=True))


def video_stream(metadata):
    streams = [s for s in metadata["streams"] if s["codec_type"] == "video"]
    if len(streams) != 1:
        raise ValueError("Exactly one video stream is required")
    return streams[0]
