# Python media tools

Force keeps translation, font rendering, and pack patching in TypeScript. Python handles the artwork project, tracking, compositing, review, and movie-export workflow. The main entry point remains the Bun CLI.

## Setup

Install uv, then run from the repository root:

```sh
uv sync --locked
bun --no-env-file src/cli/index.ts artwork --help
```

`pyproject.toml` and `uv.lock` pin NumPy and headless OpenCV. `.python-version` selects Python 3.13. uv creates the ignored `.venv` directory; no global pip installation is needed.

`force artwork` invokes `uv run --project <repository> --locked --no-env-file python ...`. uv uses the lockfile without updating it. The launcher preserves the caller’s working directory, so relative project and output paths still work. It does not load dotenv files.

For direct Python work:

```sh
uv run --locked --no-env-file python scripts/artwork/engine/cli.py --help
uv run --locked --no-env-file python -c "import cv2, numpy; print(cv2.__version__, numpy.__version__)"
```

FFmpeg/ffprobe, ImageMagick, librsvg, Bun, and the Wine/RAD encoder remain external tools. uv does not install these or change RAD licensing requirements.

## Runtime and saved projects

Python child processes use the active interpreter through `sys.executable`. Do not resolve its symlink to the base Python installation; doing so can bypass the virtual environment.

Saved projects keep their encoder and Wine-prefix paths, but no longer pin a Python executable. Loading an older version-1 project ignores its saved Python path and uses the active environment. The former `FORCE_ARTWORK_PYTHON` override and project-create `--python` option are removed.

Project/config JSON, tracking evidence, correction keyframes, and export manifests remain the boundary between the tools. Dependency-lock changes invalidate artwork caches alongside implementation changes. Commands do not set automatic execution deadlines.

## Dependency changes

```sh
uv add PACKAGE
uv sync --locked
```

Review and commit both `pyproject.toml` and `uv.lock` when a dependency changes. Keep game-specific geometry in configuration, not shared processing modules.

## Validation scope

Environment imports, CLI startup, Python syntax, and old/new project interpreter selection can be checked without rendering a batch or running the full TypeScript compiler. These checks do not establish visual quality, tracking accuracy, or in-game movie compatibility. Installation is a separate explicit command with backups.
