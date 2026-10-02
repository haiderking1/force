"""Feature-based planar tracking with explicit rejection diagnostics."""
import cv2
import numpy as np
from prepare import polygon_mask, read_image


class Template:
    def __init__(self, spec, prepared, sift):
        self.spec = spec
        self.id = spec["id"]
        self.reference = read_image(prepared / (self.id + "-reference.png"))
        self.proof = read_image(prepared / (self.id + "-proof.png"))
        self.alpha = read_image(prepared / (self.id + "-alpha.png"), cv2.IMREAD_GRAYSCALE)
        self.layer = read_image(prepared / (self.id + "-lettering.png"), cv2.IMREAD_UNCHANGED)
        mask = polygon_mask(self.reference.shape, spec["trackingPolygon"])
        self.keys, self.descriptors = sift.detectAndCompute(cv2.cvtColor(self.reference, cv2.COLOR_BGR2GRAY), mask)
        if self.descriptors is None:
            raise ValueError("No reference features: " + self.id)

    def locate(self, keys, descriptors):
        if descriptors is None:
            return None, {"status": "unmatched", "reason": "no frame features"}
        pairs = cv2.BFMatcher().knnMatch(self.descriptors, descriptors, k=2)
        good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < .68 * pair[1].distance]
        if len(good) < 10:
            return None, {"status": "unmatched", "matches": len(good)}
        src = np.float32([self.keys[m.queryIdx].pt for m in good])
        dst = np.float32([keys[m.trainIdx].pt for m in good])
        matrix, inliers = cv2.findHomography(src, dst, cv2.RANSAC, 2.0)
        if matrix is None or inliers is None:
            return None, {"status": "rejected", "reason": "no homography"}
        keep = inliers[:, 0] > 0
        count = int(keep.sum())
        if count < 10 or count < len(good) * .35:
            return None, {"status": "rejected", "reason": "weak consensus", "inliers": count}
        projected = cv2.perspectiveTransform(src.reshape(-1, 1, 2), matrix).reshape(-1, 2)
        error = float(np.median(np.linalg.norm(projected-dst, axis=1)[keep]))
        polygon = np.float32(self.spec["erasePolygon"]).reshape(-1, 1, 2)
        mapped = cv2.perspectiveTransform(polygon, matrix)
        scale = abs(cv2.contourArea(mapped) / cv2.contourArea(polygon))
        if not np.all(np.isfinite(matrix)) or error > 1.0 or scale < .005 or scale > 100:
            return None, {"status": "rejected", "reason": "implausible geometry", "error": error, "areaScale": scale}
        # Record labels share similar rings. Require matches inside their distinct word.
        local = 0
        if self.spec.get("minimumWordMatches", 0):
            local = sum(1 for point in src[keep] if cv2.pointPolygonTest(polygon, tuple(map(float, point)), False) >= 0)
            if local < self.spec["minimumWordMatches"]:
                return None, {"status": "rejected", "reason": "ambiguous record face", "localInliers": local}
        return matrix, {"status": "tracked", "localInliers": local, "inliers": count, "medianErrorPx": error, "areaScale": scale, "matrix": matrix.tolist()}
