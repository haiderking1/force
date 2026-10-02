"""Local image operations only; game geometry and translations live in JSON."""
from pathlib import Path
import cv2
import numpy as np


def read_image(path, flags=cv2.IMREAD_COLOR):
    image = cv2.imread(str(path), flags)
    if image is None:
        raise ValueError(f"Cannot read image: {path}")
    return image


def polygon_mask(shape, points):
    result = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(result, [np.array(points, np.int32)], 255)
    return result


def prepare_label(spec, reference_dir, lettering_dir, output):
    reference = read_image(reference_dir / spec["reference"])
    region = polygon_mask(reference.shape, spec["erasePolygon"])
    channel = reference[:, :, spec["eraseChannel"]]
    threshold = spec["eraseThreshold"]
    selected = channel < threshold if spec["eraseMode"] == "below" else channel > threshold
    mask = np.where((region > 0) & selected, 255, 0).astype(np.uint8)
    mask = cv2.bitwise_and(cv2.dilate(mask, np.ones((3, 3), np.uint8)), region)
    clean = cv2.inpaint(reference, mask, 3, cv2.INPAINT_TELEA)
    lettering = read_image(lettering_dir / (spec["id"] + "-trimmed.png"), cv2.IMREAD_UNCHANGED)
    if lettering.ndim != 3 or lettering.shape[2] != 4:
        raise ValueError("Lettering must have an alpha channel")
    width, height = spec["labelWidth"], spec["labelHeight"]
    lettering = cv2.resize(lettering, (width, height), interpolation=cv2.INTER_AREA)
    layer = np.zeros((*reference.shape[:2], 4), np.uint8)
    if "curve" in spec:
        curve = spec["curve"]
        for col in range(width):
            x = curve["left"] + col
            baseline = curve["baseline"] + int(curve["coefficient"] * (x - curve["center"]) ** 2)
            if x < 0 or x >= layer.shape[1] or baseline < height or baseline > layer.shape[0]:
                raise ValueError("Curve extends outside reference image")
            layer[baseline-height:baseline, x] = lettering[:, col]
    else:
        src = np.float32([[0, 0], [width-1, 0], [width-1, height-1], [0, height-1]])
        matrix = cv2.getPerspectiveTransform(src, np.float32(spec["quad"]))
        layer = cv2.warpPerspective(lettering, matrix, (reference.shape[1], reference.shape[0]))
    alpha = layer[:, :, 3:4].astype(np.float32) / 255 * spec["opacity"]
    proof = np.round(layer[:, :, :3] * alpha + clean * (1-alpha)).clip(0, 255).astype(np.uint8)
    changed = np.any(proof != reference, axis=2).astype(np.uint8) * 255
    blend = cv2.GaussianBlur(cv2.dilate(changed, np.ones((3, 3), np.uint8)), (5, 5), 0)
    for name, image in [("reference", reference), ("proof", proof), ("alpha", blend), ("erase-mask", mask), ("lettering", layer)]:
        if not cv2.imwrite(str(output / (spec["id"] + "-" + name + ".png")), image):
            raise OSError("Cannot write prepared artwork")
    return {"id": spec["id"], "changedPixels": int(np.count_nonzero(changed))}
