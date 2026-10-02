from pathlib import Path
from runtime import probe, digest, save


def scan(root, output):
    rows = []
    for file in sorted(root.resolve().rglob("*.bik")):
        try:
            metadata = probe(file)
            rows.append({"relativePath":str(file.relative_to(root.resolve())),"sha256":digest(file),"bytes":file.stat().st_size,"metadata":metadata})
            print("Indexed " + str(file.relative_to(root.resolve())),flush=True)
        except RuntimeError as error:
            rows.append({"relativePath":str(file.relative_to(root.resolve())),"error":str(error)})
    save(output,{"version":1,"root":str(root.resolve()),"supportedExport":"BIKi","movies":rows})
    print(f"Saved {len(rows)} movie records to {output}",flush=True)
