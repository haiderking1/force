"""Fail-closed process-name checks on Windows and Linux, without command lines."""
import csv
import io
import platform
import subprocess
from pathlib import Path


def assert_closed(names):
    if not names or any(not isinstance(n,str) or not n.strip() for n in names):
        raise ValueError("Explicit game process names are required")
    wanted = {n.casefold() for n in names}
    system = platform.system()
    if system == "Windows":
        completed = subprocess.run(["tasklist","/FO","CSV","/NH"],capture_output=True,text=True,check=True)
        running = [row[0] for row in csv.reader(io.StringIO(completed.stdout)) if row]
        if not running:
            raise RuntimeError("Could not enumerate Windows processes")
    elif system == "Linux":
        running = []
        for entry in Path("/proc").iterdir():
            if not entry.name.isdigit():
                continue
            try:
                running.append((entry/"comm").read_text().strip())
            except (FileNotFoundError,ProcessLookupError):
                continue
        wanted |= {n[:15] for n in wanted}
    else:
        raise RuntimeError("Guarded installation currently supports Windows and Linux only")
    hits = sorted({name for name in running if name.casefold() in wanted})
    if hits:
        raise RuntimeError("Refusing to modify files while game is running: " + ", ".join(hits))
