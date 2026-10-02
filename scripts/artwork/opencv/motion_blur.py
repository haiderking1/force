"""Estimate a local shutter blur from neighboring tracked surface positions."""
import cv2
import numpy as np


def motion_kernel(rows, index, template):
    before, after = max(0,index-1), min(len(rows)-1,index+1)
    a = rows[before]["labels"][template.id]
    b = rows[after]["labels"][template.id]
    if before == after or "matrix" not in a or "matrix" not in b:
        return None
    center = np.float32(template.spec["erasePolygon"]).mean(axis=0).reshape(1,1,2)
    first = cv2.perspectiveTransform(center,np.array(a["matrix"]))[0,0]
    last = cv2.perspectiveTransform(center,np.array(b["matrix"]))[0,0]
    vector = (last-first)/(after-before)*template.spec.get("shutterFraction",.55)
    length = float(np.linalg.norm(vector))
    if not np.isfinite(length) or length < 2:
        return None
    vector *= min(1,60/length)
    radius = int(np.ceil(np.max(np.abs(vector))/2))+1
    kernel = np.zeros((radius*2+1,radius*2+1),np.uint8)
    start = tuple(np.rint(radius-vector/2).astype(int))
    end = tuple(np.rint(radius+vector/2).astype(int))
    cv2.line(kernel,start,end,255,1,cv2.LINE_AA)
    return kernel.astype(np.float32)/kernel.sum()
