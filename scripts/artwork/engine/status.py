import json
from project import fingerprint
from pipeline import selected, clip_directory
from artifacts import valid


def status(project,config,names):
    build = fingerprint(project,config)
    rows = []
    for name in selected(project,names):
        clip = clip_directory(project,config,build,name)
        rows.append({"movie":name,"artwork":config["movies"][name],"tracked":valid(clip / "tracking"),
            "rendered":valid(clip / "frames"),"exported":valid(clip / "export"),"directory":str(clip)})
    print(json.dumps({"build":str(build),"movies":rows},indent=2),flush=True)
