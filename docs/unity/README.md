# Unity tooling

`force unity` runs local asset operations through pinned UnityPy 1.24.2. Translation uses the existing resumable translation command and its configured provider. Asset commands do not upload game resources.

## Implemented scope

- Detect desktop Unity player layouts and read serialized Unity versions.
- Inventory serialized assets and bundles with object locators and SHA-256 hashes. Unreadable objects and containers remain explicit failures.
- Export textures, TextAssets, and readable type trees. Extract embedded text candidates without treating binary TextAssets as prose.
- Rebuild unencrypted UnityFS bundles and serialized files. Reopen them and check changed object bytes, untouched objects, external references, and streamed resources.
- Replace textures with lossless RGBA32 while preserving dimensions and mip count. Reopened base-level pixels must exactly match the replacement image. This is not compressed-texture recompression and can increase storage and GPU memory use.
- Append outlined PUA glyphs to a single-atlas Alpha8 TMP fallback font. Keep existing character indices, glyph rectangles, and alpha pixels. Explicitly selected font assets receive fallback references.
- Update JSON Addressables bundle options, CRCs, cache keys, sizes, and shifted extra-data offsets. Nonzero source CRCs must match the original bundle.
- Merge file stages, reject conflicting replacements, and rebuild one shared catalog. Independently patched catalogs must not overwrite each other.
- Apply and restore approved stages on Windows or Linux with confirmation, process checks, hash checks, fresh backups, and rollback. Windows execution has not been tested here.

This does not implement encrypted bundles, guessed IL2CPP component layouts, arbitrary proprietary TextAsset formats, multi-atlas font editing, or a universal Arabic runtime renderer. Localization tables found in MonoBehaviours are candidates, not automatically supported translation formats.

## Commands

Run `bun --no-env-file src/cli/index.ts unity --help` for arguments. Examples below assume the compiled CLI is named `force`.

```sh
force unity detect --root GAME
force unity scan --root GAME --out INVENTORY
force unity extract-assets --inventory INVENTORY --out CANDIDATES
force unity review --inventory INVENTORY --pattern 'note|sign|book' --out REVIEW
force unity export --container FILE --asset SERIALIZED_NAME --path-id ID --out EXPORT
force unity stage-assets --config PLAN.json --out STAGE
force unity stage-font --config FONT.json --glyphs GLYPHS.json --out FONT_STAGE
force unity merge --stage STAGE --stage FONT_STAGE --catalog DATA/StreamingAssets/aa/catalog.json --out COMBINED
```

Outputs must use fresh directories. Inventory, review, extraction, and staging must remain outside the game. A name-filtered texture sheet is not an exhaustive artwork audit.

An asset plan has `schemaVersion: 1`, an explicit `root`, and `containers`. Each container identifies its game-relative `path`, original `sha256`, and `operations`. An operation identifies `asset`, string `pathId`, `type`, `objectSha256`, `mode`, plan-relative `input`, and `inputSha256`. Supported modes are `texture`, `text`, and `typetree`. Type-tree replacement requires the original root fields and does not establish semantic correctness for custom components.

A font plan identifies `root`, bundle `file`, original `sha256`, serialized `asset`, `fallbackPathId`, explicit `targetFonts`, and `atlasSize`. Generate static glyph requests with `scripts/unity/plan-static-text.ts`. Each request needs measured `widthEm`, `maxLines`, and explicitly supported `pairedTags`. Unknown controls and runtime placeholders fail closed. The default PUA range starts at E800; collisions still fail.

## Pentiment adapter

```sh
force unity extract --game pentiment --root GAME --out CORPUS
force translate --input CORPUS/strings.json --out TRANSLATIONS
force unity stage-text --game pentiment --root GAME --corpus CORPUS \
  --translations TRANSLATIONS/translations.json --out TEXT_STAGE
```

The adapter handles the English JSON string-table bundle. It preserves table names, UObjectName, IDs, order, empty entries, and the existing Hash field. It requires a complete translation set with matching source text and protected tokens. Source-guarded corrections keep reviewed puzzle clues and monastery terminology consistent. Corrections have a separate report; translation checkpoints remain unchanged.

Text staging currently writes logical Arabic Unicode. It does not turn that text into a working Pentiment patch. The IL2CPP game uses custom stroked and printed text controllers, variable substitution, and writing effects. A static TMP atlas demonstration is not a replacement for those runtime behaviors.

Every generated stage starts with `installReady: false`. Do not flip that flag merely because serialization tests pass. Resolve rendering, layout, artwork, and coverage findings first. Installation also requires explicit game process names. Approval is a manual review gate, not a cryptographic certificate.

## Checks

Use explicit Bun test paths, not broad project discovery. Python tests are isolated under `scripts/unity/tests`.

```sh
PYTHONPATH=scripts/unity uv run --locked --no-env-file python -m unittest discover -s scripts/unity/tests -v
bun --no-env-file test ./src/unity/text/encode.test.ts \
  ./src/unity/games/pentiment/string-tables.test.ts \
  ./src/unity/games/pentiment/stage.test.ts \
  ./src/unity/games/pentiment/corrections.test.ts
```

On Linux, wrap sizeable commands with `systemd-run --user --scope --quiet -p MemoryMax=2G -p MemorySwapMax=0 --`. Tests fit within a 1G cap. No unrestricted full-project typecheck is needed for this work.
