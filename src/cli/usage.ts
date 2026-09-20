export const USAGE = `force

A static Arabic translator for games, plus read-only resource discovery.

Usage:
  bun run start
  bun run start translate --id <id> --text <text> [--id <id> --text <text> ...]
  bun run start translate --dry-run --id <id> --text <text>
  bun run start translate --input <strings.json> --out <dir> [--resume]
  bun run start translate --input <strings.json> --out <dir> --plan
  bun run start translate --input <strings.json> --out <dir> --dry-run
  bun run start discover scan --game brutal-legend [--root <path>] [--out <file>]
  bun run start discover classify --report <file> [--out <file>]
  bun run start discover summary --report <file>
  bun run start discover show --report <file> --id <resource-id>
  bun run start discover pack list --header <file.~h> [--payload <file.~p>] [--out <file>]
  bun run start discover pack extract --header <file.~h> --entry <name> [--out <dir>] [--raw]
  bun run start discover pack strings [--game brutal-legend] [--root <path>] [--header <file.~h>] [--match <text>] [--out <dir>]

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
`;