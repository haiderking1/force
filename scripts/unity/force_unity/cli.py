"""Local Unity asset commands. No implicit translation, installation or uploads."""
import argparse
import json
from .detect import detect
from .merge import merge_stages
from .inventory import inventory
from .export import export_object
from .review import texture_review
from .stage import stage_assets
from .text import extract_text_candidates
from .addressables import stage_catalog
from .fonts.stage import stage_font
from .install.commands import apply, restore


def main():
    parser = argparse.ArgumentParser(prog="force unity")
    sub = parser.add_subparsers(dest="command", required=True)
    detection = sub.add_parser("detect", help="Recognize Unity player layout and version")
    detection.add_argument("--root", required=True)
    merge = sub.add_parser("merge", help="Combine verified stages and rebuild a shared catalog")
    merge.add_argument("--stage", action="append", required=True)
    merge.add_argument("--catalog")
    merge.add_argument("--out", required=True)
    scan = sub.add_parser("scan", help="Inventory serialized files and UnityFS bundles")
    scan.add_argument("--root", required=True)
    scan.add_argument("--out", required=True)
    export = sub.add_parser("export", help="Export one precisely located object")
    export.add_argument("--container", required=True)
    export.add_argument("--asset", required=True)
    export.add_argument("--path-id", required=True)
    export.add_argument("--out", required=True)
    review = sub.add_parser("review", help="Export texture candidates and contact sheets")
    review.add_argument("--inventory", required=True)
    review.add_argument("--pattern", required=True)
    review.add_argument("--out", required=True)
    stage = sub.add_parser("stage-assets", help="Rebuild and verify an explicit asset edit plan")
    stage.add_argument("--config", required=True)
    stage.add_argument("--out", required=True)
    text = sub.add_parser("extract-assets", help="Extract embedded text candidates without translating binary assets")
    text.add_argument("--inventory", required=True)
    text.add_argument("--out", required=True)
    font = sub.add_parser("stage-font", help="Append outlined PUA glyphs to a TMP fallback atlas")
    font.add_argument("--config", required=True)
    font.add_argument("--glyphs", required=True)
    font.add_argument("--out", required=True)
    catalog = sub.add_parser("stage-catalog", help="Update verified bundle CRCs and Addressables offsets")
    catalog.add_argument("--stage", required=True)
    catalog.add_argument("--catalog", required=True)
    install = sub.add_parser("apply", help="Install an explicitly approved stage with a fresh backup")
    install.add_argument("--stage", required=True)
    install.add_argument("--backup", required=True)
    install.add_argument("--confirm", action="store_true")
    rollback = sub.add_parser("restore", help="Restore checksum-verified originals")
    rollback.add_argument("--backup", required=True)
    rollback.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    if args.command == "detect":
        result = detect(args.root)
        print(json.dumps(result,indent=2))
        return 0 if result["players"] else 1
    if args.command == "merge":
        merge_stages(args.stage,args.out,args.catalog)
    elif args.command == "scan":
        result = inventory(args.root, args.out)
        return 1 if result["failures"] else 0
    if args.command == "export":
        export_object(args.container, args.asset, args.path_id, args.out)
    elif args.command == "review":
        texture_review(args.inventory, args.out, args.pattern)
    elif args.command == "stage-assets":
        stage_assets(args.config, args.out)
    elif args.command == "extract-assets":
        extract_text_candidates(args.inventory, args.out)
    elif args.command == "stage-font":
        stage_font(args.config, args.glyphs, args.out)
    elif args.command == "stage-catalog":
        stage_catalog(args.stage, args.catalog)
    elif args.command == "apply":
        apply(args.stage, args.backup, args.confirm)
    elif args.command == "restore":
        restore(args.backup, args.confirm)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
