export const RENDER_OPTIONS = `  --font <path>             Path to TTF/OTF font (default: assets/fonts/force.ttf)
  --text <text>             Logical text to render
  --input <file>            Read text from file
  --width <pixels>          Target box width (default: 400)
  --size <pixels>           Font size in pixels (default: 24)
  --height <pixels>         Target box height limit
  --minimum-size <pixels>   Minimum font size for automatic fitting
  --line-gap <pixels>       Line gap between consecutive lines
  --padding <pixels>        Horizontal padding
  --direction <ltr|rtl>     Base paragraph direction (default: rtl)
  --align <left|center|right> Text alignment (default: right for RTL, left for LTR)
  --placeholder <policy>    Placeholder policy: "sample:<text>", "fixed:<width>", or "warn"
  --expand-escapes          Interpret literal \\n as real newlines
  --out <file>              Output SVG, HTML, or JSON file depending on extension
  --svg <file>              Write visual SVG vector preview file
  --html <file>             Write HTML inspection preview file
  --json                    Output structured layout JSON to stdout`;

export const USAGE = `force

A static Arabic translator for games, plus read-only resource discovery and text rendering.

Usage:
  bun run start
  bun run start translate --id <id> --text <text> [--id <id> --text <text> ...]
  bun run start translate --dry-run --id <id> --text <text>
  bun run start translate --input <strings.json> --out <dir> [--resume]
  bun run start translate --input <strings.json> --out <dir> --plan
  bun run start translate --input <strings.json> --out <dir> --dry-run
  bun run start unity --help
  bun run start unity scan --root <unity-game> --out <inventory-dir>
  bun run start unity extract --game pentiment --root <game> --out <corpus-dir>
  bun run start discover scan --game brutal-legend [--root <path>] [--out <file>]
  bun run start discover classify --report <file> [--out <file>]
  bun run start discover summary --report <file>
  bun run start discover show --report <file> --id <resource-id>
  bun run start discover pack list --header <file.~h> [--payload <file.~p>] [--out <file>]
  bun run start discover pack extract --header <file.~h> --entry <name> [--out <dir>] [--raw]
  bun run start discover pack strings [--game brutal-legend] [--root <path>] [--header <file.~h>] [--match <text>] [--out <dir>]
  bun run start render --font <path> --text <string> [options]
  bun run start patch stage --game brutal-legend --scope main-menu|game-text --translations <file> [--translations <file> ...] [--candidates <file>] [--root <path>] [--out <dir>]
  bun run start patch apply --stage <dir> --backup <dir> --confirm
  bun run start patch restore --backup <dir> --confirm

Render options:
${RENDER_OPTIONS}

Translate options:
  --input <file>            Extracted strings JSON. Translates StringTable rows only.
  --out <dir>               Checkpoint and assembled translations directory.
  --resume                  Continue a matching checkpoint in --out.
  --plan                    Print item/batch counts and paths. No API call.
  --target <language>       Target language. Defaults to FORCE_TRANSLATION_TARGET_LANGUAGE or ar.
  --placeholder <token>     Extra placeholder that must be preserved. Repeatable.
  --dry-run                 Print a redacted outbound request and exit.
  -h, --help                Show this help.

File mode writes each successful batch under <out>/batches, recovered items
under <out>/items, blockers to <out>/unresolved.json, status to
<out>/status.json, and the source-order assembly to <out>/translations.json.
--resume retries failed and pending items, including previous unresolved
singletons. It refuses a checkpoint whose source, prompt, or model identity
does not match. A prompt change updates promptHash and does not rewrite saved
batches. Use a new --out, or keep the old prompt. Validators still reject
invalid JSON, missing tokens, and missing or unexpected ids. File mode retries
a bad RESPONSE once, then splits the batch down to one item and repairs that
item three more times. Only those exhausted singletons stay in unresolved.json.
Linked reference rows are not translated. Ctrl-C aborts in-flight requests,
stops dispatch, and keeps already validated batches and items. HTTP 401, 403,
and 402 stop dispatch. There is no credit fallback.

Configure the Cline Free DeepSeek V4.1 Flash client in .env. Copy .env.example.
Live translate runs FORCE_TRANSLATION_WORKERS concurrent workers (default 100).
Each worker claims a batch of FORCE_TRANSLATION_BATCH_SIZE items (default 50),
sends one request, then claims the next batch. Recovery work uses the same
worker cap. A failed batch does not stop other workers. Inline translate still
fails after the pool finishes if any batch failed. File mode recovers RESPONSE
errors until only unresolved singletons remain. Cancel through AbortSignal
aborts in-flight requests and drops queued batches.
There is no per-request HTTP timeout. FORCE_TRANSLATION_TIMEOUT_MS is ignored.
Retries cover transient HTTP and network failures and honor Retry-After.

Discovery:
  discover scan is local and read-only. It does not call Jev or any other paid API.
  discover classify uploads bounded report evidence to TypeSafe Jev and needs FORCE_JEV_API_KEY.
  Jev ranks the evidence you already extracted. It does not prove the game renders a
  string, and it does not unpack unknown archives. Local scan ranking is not a Jev result.
  Jev settings are FORCE_JEV_* only. Do not reuse FORCE_TRANSLATION_API_KEY.
  discover pack list/extract/strings parse Buddha dfpf v5 .~h/.~p locally. They do not call Jev.

Patch:
  patch stage rebuilds StringTable and DefineFont3 GFX packs under a new
  out/experiments directory. --scope main-menu covers the verified menu fields.
  --scope game-text encodes remaining translations, appends shared PUA glyphs,
  and lowers subtitle.gfx. It does not modify the installed game.
  --translations is required and repeatable; earlier files win for duplicate ids.
  --candidates is optional and repeatable for main-menu only, ahead of translations.
  Input paths resolve from the current working directory; every file must parse.
  Stage reports record input paths, SHA-256 hashes, and winning sources.
  patch apply is an explicit opt-in. It refuses a running game, checksum
  mismatch, a font-incomplete stage, or a backup path inside the game folder.
  It copies originals outside the game tree first, then replaces files atomically.
  patch restore copies the verified backup back. Neither apply nor restore
  launches the game.
`;
