"""Apply only localized edits, adapting brightness to the current frame."""
import cv2
import numpy as np


def composite(frame, template, matrix, kernel=None):
    size = (frame.shape[1], frame.shape[0])
    alpha = cv2.warpPerspective(template.alpha, matrix, size).astype(np.float32) / 255
    visible = int(np.count_nonzero(alpha > .1))
    if visible < 6:
        return frame, {"status": "offscreen", "visiblePixels": visible}
    reference = cv2.warpPerspective(template.reference, matrix, size).astype(np.float32)
    proof = cv2.warpPerspective(template.proof, matrix, size).astype(np.float32)
    if kernel is not None:
        reference = cv2.filter2D(reference,-1,kernel)
        proof = cv2.filter2D(proof,-1,kernel)
        alpha = cv2.filter2D(cv2.dilate(alpha,(kernel>0).astype(np.uint8)),-1,kernel)
    # Low-frequency gain preserves changing illumination, while retaining new lettering.
    current_low = cv2.GaussianBlur(frame.astype(np.float32), (31, 31), 0)
    original_low = cv2.GaussianBlur(reference, (31, 31), 0)
    gain = np.clip((current_low+10) / (original_low+10), .3, 2.5)
    corrected = np.clip(proof * gain, 0, 255)
    # Do not draw through hands or unrelated foreground. Compare source appearance
    # before the edit; differences in old versus new letters do not enter this test.
    predicted = reference * gain
    difference = np.max(np.abs(predicted-frame.astype(np.float32)), axis=2)
    occluded = (difference > 65).astype(np.uint8)
    occluded = cv2.medianBlur(occluded, 5)
    occluded = cv2.dilate(occluded, np.ones((3, 3), np.uint8))
    occluded_count = int(np.count_nonzero((occluded > 0) & (alpha > .1)))
    alpha *= 1-occluded
    alpha = alpha[:, :, None]
    result = np.round(corrected*alpha + frame*(1-alpha)).clip(0, 255).astype(np.uint8)
    return result, {"status": "applied", "visiblePixels": visible, "occludedPixels": occluded_count, "occludedFraction": occluded_count/max(1,visible), "motionBlurApplied": kernel is not None}
