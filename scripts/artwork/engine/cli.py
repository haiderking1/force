"""CLI-first artwork projects. No implicit installation or automatic deadlines."""
import argparse
import json
import signal
import sys
from pathlib import Path
from runtime import ROOT, save
from project import create, load, locked


def arguments():
    parser = argparse.ArgumentParser(prog="force artwork")
    actions = parser.add_subparsers(dest="action",required=True)
    scan = actions.add_parser("scan",help="Index Bink movies and metadata")
    scan.add_argument("root",type=Path)
    scan.add_argument("--out",type=Path,required=True)
    project = actions.add_parser("project").add_subparsers(dest="project_action",required=True)
    new = project.add_parser("create",help="Snapshot originals, references, font, and linked artwork")
    new.add_argument("config",type=Path)
    new.add_argument("--out",type=Path,required=True)
    new.add_argument("--game-root",type=Path,required=True)
    new.add_argument("--originals",type=Path,help="Pristine backup files root, preferred over installed files")
    new.add_argument("--encoder",type=Path,required=True)
    new.add_argument("--wine-prefix",type=Path,required=True)
    for name in ["track","review","render","status","install"]:
        command = actions.add_parser(name)
        command.add_argument("project",type=Path)
        command.add_argument("--movie",action="append",help="Select a clip; repeat to select several")
        if name == "install":
            command.add_argument("--backup",type=Path,required=True)
            command.add_argument("--confirm",action="store_true")
            command.add_argument("--preview",action="store_true",help="Acknowledge pending visual/in-game QA")
    correction = actions.add_parser("correct",help="Persist a manual keyframe or explicit hidden label")
    correction.add_argument("project",type=Path)
    correction.add_argument("--movie",required=True)
    correction.add_argument("--label",required=True)
    correction.add_argument("--frame",type=int,required=True)
    choice = correction.add_mutually_exclusive_group(required=True)
    choice.add_argument("--quad",help="Destination corners of reference erase-polygon bounding box, TL,TR,BR,BL")
    choice.add_argument("--hidden",action="store_true")
    correction.add_argument("--erase-polygon",help="Exact frame-local English region, x1,y1,x2,y2,...; requires --quad and repaints without automatic occlusion or added blur")
    rollback = actions.add_parser("restore")
    rollback.add_argument("backup",type=Path)
    rollback.add_argument("--confirm",action="store_true")
    return parser.parse_args()


def main():
    args = arguments()
    if args.action == "project":
        create(args)
        return
    if args.action == "scan":
        from scan import scan
        scan(args.root,args.out)
        return
    if args.action == "restore":
        from install import restore
        restore(args.backup,args.confirm)
        return
    project, config = load(args.project)
    with locked(args.project):
        if args.action == "correct":
            from review import correct
            correct(project,config,args)
        elif args.action == "install":
            from install import install
            install(project,config,args)
        elif args.action == "review":
            from review import review
            review(project,config,args.movie)
        elif args.action == "status":
            from status import status
            status(project,config,args.movie)
        else:
            from pipeline import track, render
            (track if args.action == "track" else render)(project,config,args.movie)


def interrupted(signum, frame):
    raise KeyboardInterrupt


if __name__ == "__main__":
    signal.signal(signal.SIGTERM,interrupted)
    try:
        main()
    except KeyboardInterrupt:
        print("Artwork operation cancelled; no completed cache stages discarded.",file=sys.stderr)
        sys.exit(130)
    except (ValueError, RuntimeError, OSError, KeyError) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
