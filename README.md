# force

Force is an offline game-localization workbench. It reads installed game files, extracts candidate text, translates it, lays out Arabic, builds game-specific asset stages, and can install an explicitly approved stage with a verified backup. It does not hook into a running game or inject code into it.

The project is still a workbench. A stage can pass structural and round-trip checks without being complete or correct in the game. Check the stage report and perform in-game review before treating it as finished.

## Current scope

| Area | Current state |
| --- | --- |
| Translation | OpenAI-compatible Cline Free, paid Cline, and Cline Pass clients with validation, batching, checkpoints, resume, and failure recovery |
| Discovery | Local resource scanning and Buddha pack inspection, plus optional Jev classification |
| Rendering | Arabic shaping, bidirectional layout, fitting, wrapping, placeholder handling, and SVG, HTML, and JSON previews |
| Brütal Legend | Main-menu and game-text staging, GFX and StringTable rebuilding, PUA font glyphs, subtitle placement, guarded apply, and restore |
| Pentiment and Unity | Unity asset inventory and staging, TMP font work, Addressables updates, and a Pentiment logical-text adapter |
| Artwork and video | Python/OpenCV tracking and compositing, Bink video remuxing, external RAD encoding, guarded movie install, and restore |

Only `brutal-legend` is registered as a discovery game adapter. Pentiment uses the separate `unity` adapter. The two game paths share translation and layout ideas, but their file formats and rendering requirements are different.

The main CLI has commands for `translate`, `discover`, `render`, `patch`, `unity`, and `artwork`. The repository entry point is Bun; the package does not currently install a separate `force` binary.

## Documentation

- [Python media tools](docs/development/python.md) explains the locked Python environment and the artwork launcher.
- [Unity tooling](docs/unity/README.md) documents Unity commands, asset staging, Pentiment, and the current runtime-rendering limits.
- [Pentiment progress](docs/unity/pentiment-progress.md) records the current translation and pilot-stage state.
- [Bink 1 encoding on Linux](docs/video/bink-on-linux.md) records the Wine and RAD Video Tools workflow and its validation evidence.

## Requirements

The TypeScript CLI needs:

- Bun 1.4.2 or newer
- The dependencies installed by `bun install`

Python-backed Unity commands and all artwork commands additionally need:

- `uv`
- Python 3.13, selected by `.python-version`
- The locked dependencies installed by `uv sync --locked`

The artwork and movie workflow also uses external tools:

- FFmpeg and FFprobe
- ImageMagick, with the `magick` command
- librsvg, with the `rsvg-convert` command
- Wine and a separate Wine prefix
- RAD Video Tools for Bink 1 encoding

These external tools are not installed by `uv`. RAD Video Tools also has its own licensing and redistribution terms. See [the Bink notes](docs/video/bink-on-linux.md) before using it.

Game-specific tools also need the relevant installed game files. The development-machine default for Brütal Legend is currently a local Steam path, so pass `--root` unless your path matches it.

## Setup

From the repository root:

```sh
bun install
uv sync --locked
cp .env.example .env
bun run start --help
```

`uv sync` is needed for Unity and artwork commands. It is not needed for the TypeScript-only translation, discovery, rendering, or patch commands.

The examples below use `bun run start`. The equivalent direct entry point is:

```sh
bun --no-env-file src/cli/index.ts --help
```

Use `--no-env-file` when a command should not load local dotenv files. Live translation and Jev classification need their respective credentials.

The examples below assume these roots point at the installed game directories:

```sh
export BRUTAL_LEGEND_ROOT=/path/to/BrutalLegend
export PENTIMENT_ROOT=/path/to/Pentiment
```

## Translation configuration

The example configuration selects Cline Pass and Arabic:

```dotenv
FORCE_TRANSLATION_PROVIDER=cline-pass
FORCE_TRANSLATION_MODEL=cline-pass/deepseek-v4.1-flash
FORCE_TRANSLATION_API_KEY=your-key
FORCE_TRANSLATION_TARGET_LANGUAGE=ar
```

The supported translation providers are:

- `cline-pass`, using a model id beginning with `cline-pass/`
- `cline`, the paid Cline route
- `cline-free`, the default when no provider is selected

All three use the Cline chat-completions API by default. `FORCE_TRANSLATION_BASE_URL` can override the base URL. There is no automatic fallback from one provider or billing route to another. API keys are sent as Bearer credentials after surrounding whitespace is removed.

The main translation settings are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FORCE_TRANSLATION_PROVIDER` | `cline-free` | Selects the local provider adapter |
| `FORCE_TRANSLATION_MODEL` | Provider default | Selects the model id |
| `FORCE_TRANSLATION_API_KEY` | none | Required for live translation |
| `FORCE_TRANSLATION_BASE_URL` | Cline API base URL | Overrides the API base |
| `FORCE_TRANSLATION_TARGET_LANGUAGE` | `ar` | Sets the prompt target language |
| `FORCE_TRANSLATION_WORKERS` | `100` | Concurrent corpus workers |
| `FORCE_TRANSLATION_BATCH_SIZE` | `50` | Items per normal request |
| `FORCE_TRANSLATION_MAX_RETRIES` | `2` | Transport retry count |
| `FORCE_TRANSLATION_RETRY_BACKOFF_MS` | `500` | Transport backoff |
| `FORCE_TRANSLATION_TEMPERATURE` | `0` | Sampling temperature |

The old `FORCE_TRANSLATION_TIMEOUT_MS` setting is not used. Translation requests currently have no per-request timeout.

Jev uses a separate `FORCE_JEV_*` configuration. `discover scan` does not read the Jev key. `discover classify` uploads bounded report evidence to the configured Jev endpoint and needs `FORCE_JEV_API_KEY`.

## Translate extracted text

Inline mode sends one or more id and text pairs:

```sh
bun run start translate --dry-run \
  --id greet \
  --text "Hello, {name}!" \
  --placeholder "{name}"

bun run start translate \
  --id greet \
  --text "Hello, {name}!" \
  --placeholder "{name}"
```

File mode consumes the JSON produced by `discover pack strings`:

```sh
bun run start discover pack strings \
  --game brutal-legend \
  --root "$BRUTAL_LEGEND_ROOT" \
  --out out/archive/brutal-legend

bun run start translate \
  --input out/archive/brutal-legend/strings.json \
  --out out/translations/brutal-legend \
  --plan

bun run start translate \
  --input out/archive/brutal-legend/strings.json \
  --out out/translations/brutal-legend

bun run start translate \
  --input out/archive/brutal-legend/strings.json \
  --out out/translations/brutal-legend \
  --resume
```

`--plan` and `--dry-run` do not call the translation API. File mode expects a JSON array of extracted records. It translates `StringTable` records and ignores linked reference rows. The loader keeps archive provenance when the source record provides it.

A file-mode output directory contains:

- `identity.json`, `sources.json`, and `status.json`
- `batches/` for validated full batches
- `items/` for validated recovered items
- `failures/` for failed work
- `unresolved.json` for singletons that remain unresolved
- `translations.json` for the assembled source-order result

A response that fails validation is retried, split into smaller requests, and eventually reduced to singleton repair attempts. A run is incomplete if any item is missing. Checkpoint resume refuses a source, prompt, provider, model, placeholder, or configuration identity that does not match the saved run.

## Discover resources

`discover scan` is local. It inventories an installed game tree and writes ranked evidence without calling Jev:

```sh
bun run start discover scan \
  --game brutal-legend \
  --root "$BRUTAL_LEGEND_ROOT" \
  --out out/discovery/brutal-legend-scan.json
```

Read an existing report with:

```sh
bun run start discover summary \
  --report out/discovery/brutal-legend-scan.json

bun run start discover show \
  --report out/discovery/brutal-legend-scan.json \
  --id Win/Packs/man_trivial.txt
```

The pack commands inspect Buddha `.~h` and companion `.~p` files:

```sh
bun run start discover pack list \
  --header "$BRUTAL_LEGEND_ROOT/Win/Packs/Man_Trivial.~h" \
  --out out/archive/brutal-legend/listings

bun run start discover pack extract \
  --header "$BRUTAL_LEGEND_ROOT/Win/Packs/Man_Trivial.~h" \
  --entry stringtable/brutallegend \
  --out out/archive/brutal-legend/extracted

bun run start discover pack strings \
  --game brutal-legend \
  --root "$BRUTAL_LEGEND_ROOT" \
  --out out/archive/brutal-legend
```

Pack commands also accept `--payload` for an explicit companion file, `--raw` for raw extraction, and `--match` to filter strings.

The archive reader supports the PC Buddha dfpf v5.0 and v5.1 layout. It reads stored and zlib-compressed entries. Other compression flags, other dfpf versions, BLPT console data, and PCK or PKG formats are not silently treated as compatible.

The text-resource decoder recognizes `StringTable`, `VidSubtitles`, `Story`, `SystemLineCodes`, and `JournalEntries`. `StringTable` is the main source of resolved display text. The other resource types expose timing, references, or line-code relationships.

Local discovery recognizes several file signatures, including text, GFX, Bink, audio, font, and executable formats. It does not decode every recognized format. Bink, FSB, LZMA-compressed SWF, binary dialog sets, and movie references remain discovery evidence or unsupported cases.

`discover classify` is the network-backed step:

```sh
bun run start discover classify \
  --report out/discovery/brutal-legend-scan.json \
  --out out/discovery/brutal-legend-classified.json
```

Jev returns independent evidence classifications for UI text, dialogue or subtitles, reference material, debug text, and insufficient evidence. It does not prove that a game renders a string and it does not unpack unknown archives. Review what is sent before using a remote classification run.

## Render and inspect Arabic text

The renderer uses the Force TTF, HarfBuzz shaping, bidirectional runs, wrapping, automatic fitting, and placeholder policies. It defaults to RTL and right alignment:

```sh
bun run start render \
  --font assets/fonts/force.ttf \
  --text "阿拉伯ية" \
  --width 560 \
  --size 24 \
  --direction rtl \
  --svg out/render/arabic.svg
```

Use `--json` for a layout result on stdout. `--out` writes JSON unless the filename ends in `.svg` or `.html`. `--svg` and `--html` write those preview formats explicitly. `--input` reads logical text from a file.

The layout result contains the chosen font size, lines, glyph positions, visual runs, dimensions, direction, and diagnostics. This is an offline inspection and staging tool, not a runtime renderer injected into a game.

`scripts/demonstration.ts` runs several rendering examples and writes SVG, HTML, and JSON artifacts under `out/demonstration`.

## Brütal Legend stages

The patch command builds files outside the installed game first:

```sh
bun run start patch stage \
  --game brutal-legend \
  --scope main-menu \
  --root "$BRUTAL_LEGEND_ROOT" \
  --out out/experiments/brutal-legend-main-menu-arabic-v3

bun run start patch stage \
  --game brutal-legend \
  --scope game-text \
  --root "$BRUTAL_LEGEND_ROOT" \
  --out out/experiments/brutal-legend-game-text-v1
```

`main-menu` verifies a fixed set of Brütal Legend menu and dialog fields, shapes their Arabic text, appends PUA glyphs to the selected GFX fonts, adjusts the selected text alignment, and rebuilds the StringTable and GFX packs.

`game-text` works from eligible translated rows in the main and DLC StringTables. It classifies timed, spoken, and UI rows, lays out the text, appends generated PUA glyphs, preserves operative ASCII tokens, lowers the subtitle sprite, and rebuilds the affected packs. It also writes coverage, previews, checksums, reports, and an install manifest.

The current `game-text` scope is not full visual coverage. It does not replace title-frame artwork, loose assets, movies, or every other text source. It leaves movie, timing, artwork, and FrontEnd GFX files untouched in the current stage. The stage report records these invariants and sets `inGameVerified` to false until a human verifies the result.

Install or restore a stage only with explicit confirmation:

```sh
bun run start patch apply \
  --stage out/experiments/brutal-legend-game-text-v1 \
  --backup out/backups/brutal-legend-game-text-v1 \
  --confirm

bun run start patch restore \
  --backup out/backups/brutal-legend-game-text-v1 \
  --confirm
```

The installer checks the staged manifest, original file hashes, running Brütal Legend processes, backup location, staged copy hashes, and final installed hashes. It creates a verified backup before replacement and attempts rollback on a replacement failure. These are safeguards, not proof that a stage is visually correct.

## Unity and Pentiment

The Unity wrapper is a local asset workbench. Most Python-backed commands run through the locked `uv` environment. The other exposed actions are `stage-assets`, `stage-font`, `stage-catalog`, `merge`, `apply`, and `restore`.

```sh
bun run start unity detect --root "$PENTIMENT_ROOT"
bun run start unity scan --root "$PENTIMENT_ROOT" --out out/unity/pentiment/inventory
bun run start unity export \
  --container "$PENTIMENT_ROOT/Pentiment_Data/StreamingAssets/localized/enus/text/text_enus.stringtablebundle" \
  --asset text_enus \
  --path-id PATH_ID \
  --out out/unity/pentiment/export
bun run start unity review \
  --inventory out/unity/pentiment/inventory \
  --pattern 'note|sign|book' \
  --out out/unity/pentiment/review
bun run start unity extract-assets \
  --inventory out/unity/pentiment/inventory \
  --out out/unity/pentiment/candidates
```

Explicit plans can rebuild unencrypted UnityFS bundles and supported serialized files, replace lossless RGBA32 textures, replace TextAssets, or replace a type tree with the same root fields. The writer reopens rebuilt containers and checks changed objects, untouched objects, external references, metadata, and streamed resources.

The font stage appends outlined PUA glyphs to one Alpha8 TMP fallback atlas and links only explicitly selected font assets. The Addressables stage updates supported JSON catalog entries, bundle CRCs, cache keys, sizes, and shifted extra-data pointers.

The Pentiment adapter has a narrower text workflow:

```sh
bun run start unity extract \
  --game pentiment \
  --root "$PENTIMENT_ROOT" \
  --out out/unity/pentiment/text-v1

bun run start translate \
  --input out/unity/pentiment/text-v1/strings.json \
  --out out/translations/pentiment-v1

bun run start unity stage-text \
  --game pentiment \
  --root "$PENTIMENT_ROOT" \
  --corpus out/unity/pentiment/text-v1 \
  --translations out/translations/pentiment-v1/translations.json \
  --out out/experiments/pentiment-logical-text-v2
```

That stage preserves the Pentiment table structure and writes logical Arabic. It does not implement Pentiment's custom stroked and printed text controllers, writing effects, variable substitution, or full runtime Arabic layout. Static PUA strings and a font pilot are not the same as a working localization.

Unity `apply` and `restore` also require `--confirm`, a versioned manifest, explicit process names, matching hashes, a closed game, and backups outside the game. Generated stages normally remain `installReady: false` and `inGameVerified: false` until reviewed. Do not change those flags merely to bypass a blocker.

See [docs/unity/README.md](docs/unity/README.md) for plan schemas and the supported asset boundaries.

## Artwork and Bink video

The `artwork` command is a Python/OpenCV pipeline for movie artwork, not a game runtime patcher. The typical flow is:

```sh
bun run start artwork scan "$BRUTAL_LEGEND_ROOT" \
  --out out/artwork/movie-index.json

bun run start artwork project create artwork.json \
  --out out/artwork/brutal-legend \
  --game-root "$BRUTAL_LEGEND_ROOT" \
  --encoder /path/to/radvideo64.exe \
  --wine-prefix out/tools/rad-video/wine-prefix

bun run start artwork track out/artwork/brutal-legend
bun run start artwork review out/artwork/brutal-legend
bun run start artwork render out/artwork/brutal-legend
```

Use `correct` to record manual tracking or visibility corrections, then rebuild the affected clip. `status` reports project state. Installation requires both `--confirm` and `--preview`:

```sh
bun run start artwork install out/artwork/brutal-legend \
  --backup out/backups/brutal-legend-artwork \
  --confirm \
  --preview

bun run start artwork restore \
  out/backups/brutal-legend-artwork \
  --confirm
```

The Bink adapter is intentionally narrow. It parses BIKi containers, replaces video packets with a silent encoded movie, preserves the original audio packet bytes, and checks dimensions, frame rate, frame count, and audio-track count. The artwork export path then fully decodes the result with FFmpeg. A successful structural export is not proof that the game will display the movie correctly. Review every frame and test the replacement in game.

The encoder and media tools are external. A missing tracking matrix can leave a source frame unchanged, so review the generated queue before installation. See [the artwork Python notes](docs/development/python.md) and [the Bink notes](docs/video/bink-on-linux.md).

## Safety and limitations

- Staging, discovery, rendering, translation, and most export commands write outside the installed game.
- `patch apply`, `unity apply`, and `artwork install` are the explicit paths that can modify installed files. They require confirmation and create backups.
- Close the game before any install or restore. The process checks are exact-name checks, not a general game-launch lock.
- Use fresh output directories. Several stages and Unity exports refuse to overwrite existing artifacts.
- Do not treat a stage manifest's `readyToApply` or `installReady` flag as visual approval. Review the reports, coverage, previews, and runtime behavior.
- Brütal Legend support is tied to inspected pack names, GFX structures, font families, and line codes. It is not a universal patch format.
- Pentiment logical text is not runtime-ready Arabic. Custom text controllers and effects still need implementation and in-game testing.
- Unity writing is limited to unencrypted UnityFS and supported serialized-file shapes. Encrypted bundles, guessed IL2CPP layouts, arbitrary proprietary TextAssets, and universal Arabic runtime rendering are not supported.
- `discover classify` sends evidence to an external service. `discover scan` and pack operations are local.
- Generated output under `out` is ignored by Git. Do not treat generated files as source-controlled game data.

## Tests and checks

The broad test command can discover large generated trees. In a workspace with an ignored `out` directory, use a bounded pattern and lower concurrency:

```sh
bun test --no-env-file \
  --path-ignore-patterns='out/**' \
  --max-concurrency=1
```

Focused Bun tests are useful while changing one subsystem:

```sh
bun test --no-env-file src/cli/run.test.ts
bun test --no-env-file src/rendering/engine.test.ts
bun test --no-env-file src/patch/install/stage-gate.test.ts
```

Some production tests inspect a real game installation. Set `FORCE_TEST_ORIGINAL_GAME_ROOT` to a pristine copy or backup when the current installed files have already been patched. A production test failure caused by a modified game tree is not the same as a parser failure.

The Unity Python tests are separate:

```sh
PYTHONPATH=scripts/unity \
  uv run --locked --no-env-file \
  python -m unittest discover -s scripts/unity/tests -v
```

The package typecheck command is:

```sh
bun --no-env-file run typecheck
```

The root `tsconfig.json` does not currently exclude generated `out` content. In a workspace containing the RAD Wine prefix, TypeScript can follow a symlink under `out/tools` and scan unrelated system files. Use a scoped compiler check for the files you changed, or make the generated tree unavailable before running the broad command. Do not interpret an out-of-memory result as a type error.

Tests cover parsers, round trips, safety gates, and synthetic fixtures. They do not prove visual quality, Wine or RAD compatibility, or full-game behavior. Those checks belong in the review and in-game validation steps above.

## Layout

- `src/cli/` is the Bun entry point, argument parsing, and command dispatch.
- `src/translation/` contains provider adapters, prompts, token validation, HTTP transport, worker pools, checkpoints, and recovery.
- `src/archive/` contains the Buddha dfpf v5 reader and pack replacement primitives.
- `src/resources/` decodes StringTable and related Buddha text resources.
- `src/discovery/` contains inventory, evidence extraction, reports, Jev classification, and the Brütal Legend adapter.
- `src/rendering/` contains font shaping, Unicode and bidi handling, layout, fitting, and previews.
- `src/patch/` contains GFX, StringTable, PUA font, Brütal Legend stage, checksum, backup, and install logic.
- `src/unity/` contains the TypeScript Pentiment adapter and the Unity command wrapper.
- `src/artwork/` is the Bun-to-Python artwork launcher.
- `src/video/` contains the BIKi parser and audio-preserving remuxer.
- `scripts/` contains Unity, artwork, subtitle, and demonstration helpers.
- `docs/` contains subsystem notes, validation evidence, and current limitations.
- `assets/fonts/` contains the default Force font used by rendering and staged PUA workflows.
