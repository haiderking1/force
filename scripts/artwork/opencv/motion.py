"""Bridge feature-matching gaps with forward/backward checked optical flow."""
import cv2
import numpy as np
from prepare import polygon_mask


def propagate(previous, current, template, previous_matrix):
    mask = polygon_mask(template.reference.shape, template.spec["trackingPolygon"])
    mask = cv2.warpPerspective(mask, previous_matrix, (previous.shape[1], previous.shape[0]))
    points = cv2.goodFeaturesToTrack(previous, maxCorners=700, qualityLevel=.008, minDistance=6, mask=mask)
    if points is None or len(points) < 20:
        return None, {"reason": "insufficient flow seeds"}
    options = dict(winSize=(31,31), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, .01))
    moved, good, _ = cv2.calcOpticalFlowPyrLK(previous, current, points, None, **options)
    if moved is None:
        return None, {"reason": "forward flow failed"}
    back, valid, _ = cv2.calcOpticalFlowPyrLK(current, previous, moved, None, **options)
    if back is None:
        return None, {"reason": "backward flow failed"}
    error = np.linalg.norm(back-points, axis=2).ravel()
    keep = (good.ravel()>0) & (valid.ravel()>0) & (error<1.5)
    if keep.sum()<20:
        return None, {"reason": "flow consistency failed"}
    step, inliers = cv2.findHomography(points[keep], moved[keep], cv2.RANSAC, 2.0)
    if step is None or inliers is None or inliers.sum()<20 or inliers.mean()<.5:
        return None, {"reason": "flow consensus failed"}
    matrix = step @ previous_matrix
    matrix /= matrix[2,2]
    if not np.all(np.isfinite(matrix)):
        return None, {"reason": "nonfinite flow matrix"}
    return matrix, {"status":"tracked", "method":"bidirectional-optical-flow", "inliers":int(inliers.sum()), "medianFlowCycleErrorPx":float(np.median(error[keep])), "matrix":matrix.tolist()}
