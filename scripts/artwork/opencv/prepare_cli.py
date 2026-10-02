import argparse
import json
from pathlib import Path
from prepare import prepare_label

parser = argparse.ArgumentParser(description="Prepare localized reference artwork; never changes game files")
parser.add_argument("config", type=Path)
parser.add_argument("lettering", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
config = json.loads(args.config.read_text())
args.output.mkdir(parents=True, exist_ok=False)
rows = []
for spec in config["labels"]:
    rows.append(prepare_label(spec, Path(config["referenceDirectory"]), args.lettering, args.output))
    print("Prepared artwork: " + spec["id"], flush=True)
(args.output / "preparation.json").write_text(json.dumps(rows, indent=2))
