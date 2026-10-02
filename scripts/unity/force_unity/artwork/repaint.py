"""Explicit purple/dark-ink document repainting, not a universal artwork remover."""
import json
import re
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
from ..paths import confined, file_hash, write_json


def repaint_document(source, lettering, region, profile):
    if profile.get("mode") != "purple-dark":
        raise ValueError("Unsupported document ink profile")
    for key in ("maxGray","darkContrast","purpleContrast","kernelSize","dilate","radius"):
        if not isinstance(profile.get(key),int) or not 1 <= profile[key] <= 255:
            raise ValueError("Invalid document ink profile setting: " + key)
    image = np.array(source.convert("RGBA"))
    height,width = image.shape[:2]
    x0,y0,x1,y1 = [int(v) for v in region]
    if not 0 <= x0 < x1 <= width or not 0 <= y0 < y1 <= height:
        raise ValueError("Artwork region is outside the texture")
    rgb = image[:,:,:3].astype(np.float32)
    r,g,b = cv2.split(rgb)
    gray = cv2.cvtColor(image[:,:,:3],cv2.COLOR_RGB2GRAY)
    background = cv2.morphologyEx(gray,cv2.MORPH_CLOSE,np.ones((profile["kernelSize"],profile["kernelSize"]),np.uint8))
    contrast = background.astype(np.int16)-gray.astype(np.int16)
    dark_ink = (gray < profile["maxGray"]) & (contrast>profile["darkContrast"])
    purple_ink = (r-g+b-g>60) & (r>g+8) & (b>g*1.4+2) & (b>r*.24) & (np.minimum(r,b)<150)
    ink = (((purple_ink & (contrast>profile["purpleContrast"])) | dark_ink) & (image[:,:,3]>220)).astype(np.uint8)*255
    roi = np.zeros((height,width),np.uint8);roi[y0:y1,x0:x1]=255
    ink = cv2.bitwise_and(cv2.dilate(ink,np.ones((profile["dilate"],profile["dilate"]),np.uint8)),roi)
    if np.count_nonzero(ink)<20:
        raise ValueError("No purple ink detected inside the explicit region")
    clean = cv2.inpaint(image[:,:,:3],ink,profile["radius"],cv2.INPAINT_TELEA)
    result = image.copy();result[:,:,:3]=clean
    label = lettering.convert("RGBA")
    label.thumbnail((x1-x0,y1-y0),Image.Resampling.LANCZOS)
    x=x0+(x1-x0-label.width)//2;y=y0+(y1-y0-label.height)//2
    layer=np.array(label);alpha=layer[:,:,3:4].astype(np.float32)/255
    result[y:y+label.height,x:x+label.width,:3]=np.round(layer[:,:,:3]*alpha+clean[y:y+label.height,x:x+label.width]*(1-alpha)).astype(np.uint8)
    # Keep the source transparency exactly, including edge bleeding used by sprites.
    if not np.array_equal(result[:,:,3],image[:,:,3]) or not np.array_equal(result[roi==0],image[roi==0]):
        raise ValueError("Pixels outside the authorized region or alpha changed")
    return Image.fromarray(result),Image.fromarray(ink),int(np.count_nonzero(ink))


def repaint_plan(plan_path, out):
    plan_path,out = Path(plan_path).resolve(),Path(out).resolve()
    plan=json.loads(plan_path.read_text());out.mkdir(parents=True,exist_ok=False)
    records=[];tiles=[];seen=set()
    if not plan.get("labels"):
        raise ValueError("Artwork plan is empty")
    for row in plan["labels"]:
        if not re.fullmatch(r"[a-z0-9-]+",row["id"]) or row["id"] in seen:
            raise ValueError("Invalid or duplicate artwork label ID")
        seen.add(row["id"])
        source=confined(plan_path.parent,row["source"])
        if file_hash(source)!=row["sourceSha256"]:
            raise ValueError("Artwork source changed since review")
        label=confined(plan_path.parent,row["lettering"])
        if file_hash(label)!=row["letteringSha256"]:
            raise ValueError("Lettering changed since preparation")
        image,mask,count=repaint_document(Image.open(source),Image.open(label),row["region"],plan["inkProfile"])
        destination=out/(row["id"]+".png");image.save(destination);mask.save(out/(row["id"]+"-mask.png"))
        records.append({**row,"output":str(destination),"sha256":file_hash(destination),"erasedPixels":count,
                        "alphaUnchanged":True,"outsideRegionUnchanged":True,"inGameVerified":False})
        image.thumbnail((650,280));tile=Image.new("RGB",(680,310),"#ccc");tile.paste(image,((680-image.width)//2,0),image)
        ImageDraw.Draw(tile).text((10,285),row["id"],fill="black");tiles.append(tile)
    sheet=Image.new("RGB",(1360,310*((len(tiles)+1)//2)),"#ccc")
    for i,tile in enumerate(tiles):sheet.paste(tile,((i%2)*680,(i//2)*310))
    sheet.save(out/"review.jpg",quality=94)
    write_json(out/"repaint.json",{"records":records,"inkProfile":plan["inkProfile"],"inGameVerified":False})
