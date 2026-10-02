"""Recognize desktop Unity player layouts without guessing localization formats."""
from pathlib import Path
import UnityPy


def detect(root):
    root = Path(root).resolve(strict=True)
    candidates = [root] if (root/"globalgamemanagers").is_file() else sorted(p for p in root.glob("*_Data") if p.is_dir())
    players=[]
    for data in candidates:
        global_file=data/"globalgamemanagers"
        if not global_file.is_file():continue
        env=UnityPy.load(str(global_file))
        versions=sorted({a.unity_version for a in env.assets})
        il2cpp = (root/"GameAssembly.dll").is_file() or (root/"GameAssembly.so").is_file() or (data/"il2cpp_data").is_dir()
        players.append({"data":str(data),"versions":versions,"scriptingBackend":"il2cpp" if il2cpp else "mono" if (data/"Managed").is_dir() else "unknown",
            "addressablesCatalogs":[p.relative_to(root).as_posix() for p in data.glob("StreamingAssets/aa/catalog*.json")],
            "localizationAdapter":"not inferred from engine detection"})
    return {"engine":"unity" if players else "unrecognized","root":str(root),"players":players,"inGameVerified":False}
