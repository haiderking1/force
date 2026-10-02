"""Frame-local lettering on circular stickers; explicit frame scope and saved geometry.

This adapter detects a colored sticker inside a configured search rectangle. It
never treats a missing detection as hidden: hidden frames must be configured.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from movie_io import decode_frames


def locate(frame, roi):
    x0, y0, x1, y1 = roi
    image = frame[y0:y1, x0:x1].astype(np.float32)
    b, g, r = cv2.split(image)
    red = ((r > 70) & (r > g * 1.25 + 12) & (r > b * 1.25 + 12)).astype(np.uint8) * 255
    red = cv2.morphologyEx(red, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(red, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    candidates = [c for c in contours if len(c) >= 5 and cv2.contourArea(c) > 80]
    if not candidates:
        raise ValueError("Sticker not found; an explicit hidden decision or tighter ROI is required")
    contour = max(candidates, key=cv2.contourArea)
    (cx, cy), (a, b), angle = cv2.fitEllipse(contour)
    if max(a, b) > 180 or min(a, b) < 2:
        raise ValueError("Sticker fit outside configured scale")
    return ((cx + x0, cy + y0), (a, b), angle)


def repaint(frame, lettering, ellipse):
    center, axes, angle = ellipse
    mask = np.zeros(frame.shape[:2], np.uint8)
    cv2.ellipse(mask, (center, (axes[0] * .96, axes[1] * .96), angle), 255, -1)
    brightness = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    sample = brightness[mask > 0]
    if sample.size == 0:
        raise ValueError("Sticker outside frame")
    threshold = float(np.percentile(sample, 80)) * .92
    ink = ((mask > 0) & (brightness < threshold)).astype(np.uint8) * 255
    ink = cv2.bitwise_and(cv2.dilate(ink, np.ones((3, 3), np.uint8)), mask)
    clean = cv2.inpaint(frame, ink, 3, cv2.INPAINT_TELEA)
    # Use horizontal/vertical ellipse extents, not its unstable near-circular angle.
    radians = np.deg2rad(angle)
    width = np.sqrt((axes[0] * np.cos(radians)) ** 2 + (axes[1] * np.sin(radians)) ** 2)
    height = np.sqrt((axes[0] * np.sin(radians)) ** 2 + (axes[1] * np.cos(radians)) ** 2)
    lw, lh = width * .66, height * .62
    x, y = center
    quad = np.float32([[x-lw/2,y-lh/2],[x+lw/2,y-lh/2],[x+lw/2,y+lh/2],[x-lw/2,y+lh/2]])
    h, w = lettering.shape[:2]
    matrix = cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]), quad)
    layer = cv2.warpPerspective(lettering, matrix, (frame.shape[1], frame.shape[0]))
    alpha = layer[:, :, 3:4].astype(np.float32) / 255
    # No added blur: already-blurred input should not erase the Arabic replacement.
    result = np.round(layer[:, :, :3] * alpha + clean * (1-alpha)).clip(0,255).astype(np.uint8)
    return result, {"ellipse": ellipse, "quad": quad.tolist(), "erasedPixels": int(np.count_nonzero(ink)),
                    "letteringPixels": int(np.count_nonzero(alpha > .1)), "motionBlurApplied": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    lettering = cv2.imread(config["lettering"], cv2.IMREAD_UNCHANGED)
    if lettering is None or lettering.ndim != 3 or lettering.shape[2] != 4:
        raise ValueError("RGBA lettering is required")
    for movie in config["movies"]:
        out = Path(movie["output"])
        out.mkdir(parents=True, exist_ok=False)
        rows, crops = [], []
        width, height = movie["width"], movie["height"]
        for number, frame in enumerate(decode_frames(movie["source"], width, height), 1):
            if number in movie["hiddenFrames"]:
                result, evidence = frame, {"hidden": True}
            else:
                manual = movie.get("ellipses", {}).get(str(number))
                ellipse = ((tuple(manual[0]), tuple(manual[1]), manual[2]) if manual else
                           locate(frame, movie.get("frameRois", {}).get(str(number), movie["roi"])))
                result, evidence = repaint(frame, lettering, ellipse)
                x, y = ellipse[0]
                x0, y0 = max(0, int(x)-90), max(0, int(y)-90)
                crop = result[y0:min(height,y0+180),x0:min(width,x0+180)]
                crop = cv2.copyMakeBorder(crop, 0, 180-crop.shape[0], 0, 180-crop.shape[1], cv2.BORDER_CONSTANT)
                cv2.putText(crop, str(number), (5,18), cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1)
                crops.append(crop)
            rows.append({"frame": number, **evidence})
            if not cv2.imwrite(str(out / f"frame{number:04d}.png"), result):
                raise OSError("Frame write failed")
        if len(rows) != movie["frames"]:
            raise ValueError("Unexpected movie frame count")
        (out / "decisions.json").write_text(json.dumps(rows, indent=2))
        while len(crops) % 8:
            crops.append(np.zeros((180,180,3),np.uint8))
        if crops:
            cv2.imwrite(str(out.parent / (movie["name"]+"-review.png")),
                        np.vstack([np.hstack(crops[i:i+8]) for i in range(0,len(crops),8)]))
        print(f"{movie['name']}: {len(rows)} frame decisions saved", flush=True)


if __name__ == "__main__":
    main()
