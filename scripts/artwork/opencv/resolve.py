import numpy as np
from motion import propagate


def choose_faces(templates, detections):
    winners = {}
    for template in templates:
        group = template.spec.get("exclusiveGroup")
        evidence = detections[template.id]
        if group and "matrix" in evidence:
            score = evidence.get("localInliers", 0)*100 + evidence.get("inliers", 0)
            if group not in winners or score > winners[group][0]:
                winners[group] = (score, template.id)
    for template in templates:
        group = template.spec.get("exclusiveGroup")
        if group in winners and winners[group][1] != template.id:
            detections[template.id] = {"status":"other-face"}


def recover_gaps(templates, rows, grays):
    for step in [1, -1]:
        order = range(len(rows)) if step == 1 else range(len(rows)-1, -1, -1)
        for template in templates:
            previous = None
            streak = 0
            for index in order:
                evidence = rows[index]["labels"][template.id]
                if "matrix" in evidence:
                    previous = index
                    streak = 0
                    continue
                if evidence["status"] in ["other-face", "hidden"]:
                    previous = None
                    continue
                if previous is not None and streak < 12:
                    matrix, recovered = propagate(grays[previous], grays[index], template, np.array(rows[previous]["labels"][template.id]["matrix"]))
                    if matrix is not None:
                        recovered["recoveryDirection"] = "forward" if step == 1 else "backward"
                        rows[index]["labels"][template.id] = recovered
                        previous = index
                        streak += 1
                        continue
                previous = None
