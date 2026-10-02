"""Manual keyframes bind reference rectangle corners to an observed movie quad."""
import cv2
import numpy as np


def apply_corrections(rows, templates, corrections, movie):
    specs = {t.id:t.spec for t in templates}
    for edit in corrections:
        if edit["movie"] != movie:
            continue
        index = edit["frame"]-1
        if index < 0 or index >= len(rows) or edit["label"] not in specs:
            raise ValueError("Correction references an unknown frame or label")
        if edit.get("hidden"):
            rows[index]["labels"][edit["label"]] = {"status":"hidden", "method":"manual"}
            continue
        points = np.array(specs[edit["label"]]["erasePolygon"], np.float32)
        x,y = points.min(axis=0)
        right,bottom = points.max(axis=0)
        source = np.float32([[x,y],[right,y],[right,bottom],[x,bottom]])
        target = np.float32(edit["quad"])
        matrix = cv2.getPerspectiveTransform(source, target)
        if not np.all(np.isfinite(matrix)) or abs(np.linalg.det(matrix)) < 1e-9 or not cv2.isContourConvex(target):
            raise ValueError("Degenerate correction quad")
        evidence = {"status":"tracked", "method":"manual", "matrix":matrix.tolist()}
        if "erasePolygon" in edit:
            polygon = np.asarray(edit["erasePolygon"], dtype=np.float32)
            if polygon.ndim != 2 or polygon.shape[1] != 2 or len(polygon) < 3 or not np.isfinite(polygon).all() or abs(cv2.contourArea(polygon)) < 1:
                raise ValueError("Manual erase polygon must be finite and nondegenerate")
            evidence["erasePolygon"] = polygon.tolist()
        rows[index]["labels"][edit["label"]] = evidence
