"""Rasterize outlined glyphs into padded signed-distance alpha tiles."""
import io
import math
import subprocess
import cv2
import numpy as np
from PIL import Image


def svg_path(commands):
    result = []
    for command in commands:
        op, a = command["op"], command["a"]
        if op == "close":
            result.append("Z")
            continue
        points = [a]
        if op in ("quad", "cubic"):
            points.append(command["b"])
        if op == "cubic":
            points.append(command["c"])
        letter = {"move":"M", "line":"L", "quad":"Q", "cubic":"C"}[op]
        result.append(letter + " ".join(f"{p['x']} {p['y']}" for p in points))
    return " ".join(result)


def raster_glyph(glyph, upem, point_size, padding):
    if upem <= 0 or point_size <= 0 or padding < 1:
        raise ValueError("Invalid font raster dimensions")
    bounds = glyph["outline"]["bounds"]
    scale = point_size / upem
    if bounds["empty"]:
        return None, {"m_Width":0.0,"m_Height":0.0,"m_HorizontalBearingX":0.0,
                      "m_HorizontalBearingY":0.0,"m_HorizontalAdvance":glyph["advance"]*scale}
    x0,y0 = math.floor(bounds["xMin"]*scale),math.floor(bounds["yMin"]*scale)
    x1,y1 = math.ceil(bounds["xMax"]*scale),math.ceil(bounds["yMax"]*scale)
    width,height = x1-x0,y1-y0
    w,h = width+2*padding,height+2*padding
    if min(width,height) <= 0 or max(w,h) > 1024:
        raise ValueError("Invalid glyph bounds")
    path = svg_path(glyph["outline"]["commands"])
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
           f'<path d="{path}" fill="white" transform="translate({padding-x0},{padding+y1}) scale({scale},{-scale})"/></svg>')
    result = subprocess.run(["rsvg-convert","-w",str(w*4),"-h",str(h*4)],input=svg.encode(),capture_output=True,check=True)
    alpha = np.array(Image.open(io.BytesIO(result.stdout)).getchannel("A"))
    inside = (alpha >= 128).astype(np.uint8)
    if not np.any(inside):
        raise ValueError("Nonempty outline rasterized empty")
    signed = cv2.distanceTransform(inside,cv2.DIST_L2,cv2.DIST_MASK_PRECISE) - cv2.distanceTransform(1-inside,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    sdf = np.clip(127.5 + signed*(127.5/(padding*4)),0,255).astype(np.uint8)
    tile = Image.fromarray(sdf).resize((w,h),Image.Resampling.LANCZOS)
    return tile,{"m_Width":float(width),"m_Height":float(height),"m_HorizontalBearingX":float(x0),
                 "m_HorizontalBearingY":float(y1),"m_HorizontalAdvance":glyph["advance"]*scale}
