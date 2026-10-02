"""CLI review shows every frame, plus a queue of automatic tracking warnings."""
import json
from pathlib import Path
import cv2
import numpy as np
from runtime import save, run, video_stream
from project import fingerprint
from pipeline import selected, clip_directory
from schema import points


def review(project, config, names):
    build = fingerprint(project, config)
    destination = build / "review"
    destination.mkdir(exist_ok=True)
    queue = []
    specs = {s["id"]:s for s in config["labels"]}
    for name in selected(project, names):
        clip = clip_directory(project, config, build, name)
        tracking = clip / "frames/tracking.json"
        if not tracking.is_file():
            tracking = clip / "tracking/tracking.json"
        if not tracking.is_file():
            queue.append({"movie":name,"reason":"not-tracked"})
            continue
        rows = json.loads(tracking.read_text())
        # A successful tracker can still leave English behind. Inspect every
        # rendered frame rather than sampling only tracker-reported problems.
        candidates = set(range(1,len(rows)+1))
        for row in rows:
            for label, evidence in row["labels"].items():
                status = evidence["status"]
                reasons = []
                if status in ["unmatched", "rejected"]:
                    reasons.append("unresolved-visibility")
                if evidence.get("method") == "bidirectional-optical-flow":
                    reasons.append("recovered-tracking")
                if evidence.get("occludedFraction",0) > .35:
                    reasons.append("heavily-occluded")
                if reasons:
                    queue.append({"movie":name,"frame":row["frame"],"label":label,"reasons":reasons,"evidence":evidence})
                    candidates.add(row["frame"])
        tiles = []
        for number in sorted(candidates):
            rendered = clip / "frames" / f"frame{number:04d}.png"
            if rendered.is_file():
                image = cv2.imread(str(rendered))
            else:
                source = Path(project["directory"]) / "sources" / (name+".bik")
                temporary = destination / (name + "-sample.png")
                run(["ffmpeg", "-v", "error", "-y", "-i", source, "-vf", f"select='eq(n,{number-1})'", "-frames:v", "1", temporary])
                image = cv2.imread(str(temporary))
                temporary.unlink()
            if image is None:
                raise ValueError("Review frame could not be read")
            row = rows[number-1]
            for label, evidence in row["labels"].items():
                if "matrix" in evidence:
                    polygon = np.float32(specs[label]["erasePolygon"]).reshape(-1,1,2)
                    quad = cv2.perspectiveTransform(polygon, np.array(evidence["matrix"]))
                    if np.isfinite(quad).all() and np.max(np.abs(quad)) < 100000:
                        cv2.polylines(image,[quad.astype(np.int32)],True,(0,220,0),2)
            tile = cv2.resize(image,(480,270))
            tile = cv2.copyMakeBorder(tile,0,38,0,0,cv2.BORDER_CONSTANT)
            text = name + " #" + str(number) + " " + " ".join(k+":"+v["status"] for k,v in row["labels"].items())
            cv2.putText(tile,text[:83],(4,290),cv2.FONT_HERSHEY_SIMPLEX,.33,(255,255,255),1,cv2.LINE_AA)
            tiles.append(tile)
        pages = []
        for index in range(0,len(tiles),12):
            group = tiles[index:index+12]
            while len(group)%3:
                group.append(np.zeros_like(group[0]))
            sheet = np.vstack([np.hstack(group[i:i+3]) for i in range(0,len(group),3)])
            file = destination / f"{name}-{index//12+1:02d}.jpg"
            if not cv2.imwrite(str(file),sheet):
                raise OSError("Cannot write review sheet")
            pages.append(str(file))
        print(f"Review {name}: {len(pages)} page(s)",flush=True)
    save(destination / "queue.json",queue)
    print(f"Review queue: {destination / 'queue.json'} ({len(queue)} entries; unmatched is not proof of invisibility)",flush=True)


def correct(project, config, args):
    if args.movie not in project["movies"] or args.label not in config["movies"][args.movie]:
        raise ValueError("Correction references unknown artwork")
    count = int(video_stream(project["movies"][args.movie]["metadata"])["nb_read_frames"])
    if not 1 <= args.frame <= count:
        raise ValueError("Correction frame is outside movie")
    edit = {"movie":args.movie,"label":args.label,"frame":args.frame}
    if args.hidden:
        if args.erase_polygon:
            raise ValueError("A hidden label cannot have an erase polygon")
        edit["hidden"] = True
    else:
        numbers = [float(n) for n in args.quad.split(",")]
        if len(numbers) != 8:
            raise ValueError("Quad must contain x1,y1,x2,y2,x3,y3,x4,y4")
        quad = points([numbers[i:i+2] for i in range(0,8,2)],4)
        if not cv2.isContourConvex(np.float32(quad)) or abs(cv2.contourArea(np.float32(quad))) < 1:
            raise ValueError("Quad must be convex and nondegenerate")
        edit["quad"] = quad
        if args.erase_polygon:
            values = [float(n) for n in args.erase_polygon.split(",")]
            if len(values) < 6 or len(values) % 2:
                raise ValueError("Erase polygon needs at least three coordinate pairs")
            polygon = points([values[i:i+2] for i in range(0,len(values),2)])
            if abs(cv2.contourArea(np.float32(polygon))) < 1:
                raise ValueError("Erase polygon must be nondegenerate")
            edit["erasePolygon"] = polygon
    file = Path(project["directory"]) / "corrections.json"
    edits = json.loads(file.read_text())
    edits = [e for e in edits if (e["movie"],e["label"],e["frame"]) != (args.movie,args.label,args.frame)]
    save(file,edits+[edit])
    print("Saved correction; track/render will rebuild the affected clip.",flush=True)
