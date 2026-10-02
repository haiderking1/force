"""Separate persisted tracking from rendering; neither operation changes game files."""
import argparse
import json
import subprocess
from pathlib import Path
import cv2
import numpy as np
from tracking import Template
from composite import composite
from frame_repaint import repaint
from motion_blur import motion_kernel
from movie_io import decode_frames
from resolve import choose_faces, recover_gaps
from corrections import apply_corrections


def detect(args, config, templates, sift, video):
    width, height, count = video["width"], video["height"], int(video["nb_read_frames"])
    gray_path = args.output / "tracking-gray.npy"
    grays = np.lib.format.open_memmap(gray_path, mode="w+", dtype=np.uint8, shape=(count,height,width))
    rows = []
    try:
        for index, original in enumerate(decode_frames(args.movie, width, height)):
            if index >= count:
                raise ValueError("Too many decoded frames")
            gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
            grays[index] = gray
            keys, descriptors = sift.detectAndCompute(gray, None)
            decisions = {t.id: t.locate(keys, descriptors)[1] for t in templates}
            choose_faces(templates, decisions)
            rows.append({"frame":index+1,"labels":decisions})
            if index % 15 == 0:
                print(f"{args.movie.name}: tracking {index+1}/{count}", flush=True)
        if len(rows) != count:
            raise ValueError("Decoded frame count mismatch")
        if args.corrections:
            apply_corrections(rows, templates, json.loads(args.corrections.read_text()), args.movie.stem)
        recover_gaps(templates, rows, grays)
        if args.corrections:
            apply_corrections(rows, templates, json.loads(args.corrections.read_text()), args.movie.stem)
        return rows
    finally:
        del grays
        gray_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("prepared", type=Path)
    parser.add_argument("movie", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--track-only", action="store_true")
    parser.add_argument("--tracking", type=Path)
    parser.add_argument("--corrections", type=Path)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    allowed = config["movies"].get(args.movie.stem)
    if allowed is None:
        raise ValueError("Movie has no configured artwork scope")
    metadata = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(args.movie)]))
    video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    width, height, count = video["width"], video["height"], int(video["nb_read_frames"])
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / "source.json").write_text(json.dumps(metadata, indent=2))
    sift = cv2.SIFT_create(nfeatures=6000)
    templates = [Template(s, args.prepared, sift) for s in config["labels"] if s["id"] in allowed]
    rows = json.loads(args.tracking.read_text()) if args.tracking else detect(args, config, templates, sift, video)
    if len(rows) != count or any(r["frame"] != i+1 or set(r["labels"]) != set(allowed) for i,r in enumerate(rows)):
        raise ValueError("Tracking does not match the movie scope or frame count")
    if not args.track_only:
        rendered = 0
        for index, original in enumerate(decode_frames(args.movie, width, height)):
            result = original.copy()
            for template in templates:
                evidence = rows[index]["labels"][template.id]
                if "matrix" in evidence:
                    matrix = np.array(evidence["matrix"])
                    if "erasePolygon" in evidence:
                        result, applied = repaint(result, template, matrix, evidence["erasePolygon"])
                    else:
                        result, applied = composite(result, template, matrix, motion_kernel(rows, index, template))
                    evidence.update(applied)
            if not cv2.imwrite(str(args.output / f"frame{index+1:04d}.png"), result):
                raise OSError("Could not write artwork frame")
            rendered += 1
            if rendered % 30 == 0:
                print(f"{args.movie.name}: rendering {rendered}/{count}", flush=True)
        if rendered != count:
            raise ValueError("Render frame count mismatch")
    (args.output / "tracking.json").write_text(json.dumps(rows, indent=2))
    statuses = sorted({d["status"] for r in rows for d in r["labels"].values()})
    summary = {t.id: {s: sum(r["labels"][t.id]["status"] == s for r in rows) for s in statuses} for t in templates}
    (args.output / "summary.json").write_text(json.dumps({"frames":count,"labels":summary,"requiresVisualReview":True}, indent=2))
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
