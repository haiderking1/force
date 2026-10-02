"""Explicit frame-local erasure and lettering, independent of appearance tracking."""
import cv2
import numpy as np
from prepare import polygon_mask


def repaint(frame, template, matrix, erase_polygon):
    # The operator marks the English in this exact frame. Never silently suppress
    # that correction because a reflection differs from the reference photograph.
    mask = polygon_mask(frame.shape, erase_polygon)
    erased = int(np.count_nonzero(mask))
    if not erased:
        raise ValueError("Manual erase polygon does not intersect the frame")
    size = (frame.shape[1], frame.shape[0])
    layer = cv2.warpPerspective(template.layer, matrix, size)
    alpha = layer[:, :, 3:4].astype(np.float32) / 255 * template.spec["opacity"]
    # The same frame-local region bounds drawing, so a marked foreground edge
    # clips replacement letters instead of allowing them to cover a hand.
    alpha *= mask[:, :, None].astype(np.float32) / 255
    # During clipping the old and new words can leave the screen at different
    # pixels. Erase the visible old ink even when the new lettering is offscreen.
    # Erase the ink inside the marked region, not the entire background patch.
    # Filling the whole polygon pulls nearby white ornaments into dark labels.
    channel = frame[:, :, template.spec["eraseChannel"]]
    values = channel[mask > 0].astype(np.float32)
    background = float(np.median(values))
    # A fixed reference threshold leaves dim English intact in shadow. Estimate
    # ink contrast from this frame instead, including faint motion trails.
    if template.spec["eraseMode"] == "above":
        threshold = background + max(3., .15 * (float(np.percentile(values, 95))-background))
        selected = channel > threshold
    else:
        threshold = background - max(3., .15 * (background-float(np.percentile(values, 5))))
        selected = channel < threshold
    ink = np.where((mask > 0) & selected, 255, 0).astype(np.uint8)
    ink = cv2.bitwise_and(cv2.dilate(ink, np.ones((3, 3), np.uint8)), mask)
    erased = int(np.count_nonzero(ink))
    clean = cv2.inpaint(frame, ink, 3, cv2.INPAINT_TELEA)
    reference = cv2.warpPerspective(template.reference, matrix, size)
    visible = mask > 0
    component = template.spec["eraseChannel"]
    gain = np.clip((float(np.median(frame[:, :, component][visible]))+10) /
        (float(np.median(reference[:, :, component][visible]))+10), .3, 2.5)
    lettering = np.clip(layer[:, :, :3].astype(np.float32) * gain, 0, 255)
    result = np.round(lettering * alpha + clean * (1-alpha)).clip(0, 255).astype(np.uint8)
    return result, {"status":"applied", "compositor":"frame-local-repaint",
        "erasedPixels":erased, "visiblePixels":int(np.count_nonzero(alpha > .1)),
        "motionBlurApplied":False, "requiresVisualReview":True}
