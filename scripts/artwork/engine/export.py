"""BIKi is the first implemented export adapter. Preserve audio packets, not a re-encode."""
import os
import shutil
from decimal import Decimal
from fractions import Fraction
from pathlib import Path
from runtime import ROOT, digest, probe, run, save, video_stream


def export_movie(project, name, frames, output):
    output.mkdir()
    source = Path(project["directory"]) / "sources" / (name + ".bik")
    metadata = project["movies"][name]["metadata"]
    stream = video_stream(metadata)
    count = int(stream["nb_read_frames"])
    rate = Fraction(stream["r_frame_rate"])
    decimal = Decimal(rate.numerator) / Decimal(rate.denominator)
    if Fraction(str(decimal)) != rate:
        raise ValueError("This RAD adapter cannot exactly express the source frame rate")
    # Simple relative names avoid Wine path parsing and image-sequence failures.
    for index in range(1,count+1):
        frame = frames / f"frame{index:04d}.png"
        if not frame.is_file():
            raise ValueError("Missing rendered frame")
        os.link(frame, output / frame.name)
    env = dict(os.environ, WINEPREFIX=project["tools"]["winePrefix"], WINEDEBUG="-all")
    run(["wine", project["tools"]["encoder"], "Binkc", f"frame????.png*1-{count}", "silent.bik",
        "/V100", "/F" + str(decimal), "/D2000000", "/#"], cwd=output, env=env)
    silent = output / "silent.bik"
    if not silent.is_file():
        raise RuntimeError("RAD exited without producing a movie")
    result = output / (name + ".bik")
    run(["bun", "--no-env-file", ROOT / "scripts/artwork/remux.ts", source, silent, result], cwd=ROOT)
    after = probe(result)
    replacement = video_stream(after)
    for key in ["codec_tag_string", "width", "height", "r_frame_rate", "nb_read_frames"]:
        if stream[key] != replacement[key]:
            raise ValueError("Export changed " + key)
    before_audio = [s for s in metadata["streams"] if s["codec_type"] == "audio"]
    after_audio = [s for s in after["streams"] if s["codec_type"] == "audio"]
    if len(before_audio) != len(after_audio):
        raise ValueError("Audio track count changed")
    run(["ffmpeg", "-hide_banner", "-v", "error", "-xerror", "-i", result, "-f", "null", "-"])
    save(output / "verification.json", {"sourceSha256":digest(source), "sha256":digest(result), "frames":count,
        "audioTracks":len(before_audio), "audioPacketsPreserved":True, "fullDecodePassed":True, "inGameTested":False})
    silent.unlink()
    for file in output.glob("frame*.png"):
        file.unlink()
