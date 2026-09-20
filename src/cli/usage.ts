export const USAGE = `force

A static Arabic translator for games.

Usage:
  bun run start
  bun run start translate --id <id> --text <text> [--id <id> --text <text> ...]
  bun run start translate --dry-run --id <id> --text <text>

Options:
  --target <language>       Target language. Defaults to FORCE_TRANSLATION_TARGET_LANGUAGE or ar.
  --placeholder <token>     Placeholder that must be preserved. Repeatable.
  --dry-run                 Print the redacted outbound request and exit.
  -h, --help                Show this help.

Configure the Cline Free DeepSeek V4.1 Flash client in .env. Copy .env.example.
Live translate runs FORCE_TRANSLATION_WORKERS concurrent workers (default 100).
Each worker claims a batch of FORCE_TRANSLATION_BATCH_SIZE items (default 50),
sends one request, then claims the next batch. A failed batch does not stop
other workers. After the pool finishes, translate fails if any batch failed.
Cancel through AbortSignal aborts in-flight requests and drops queued batches.
There is no per-request HTTP timeout. FORCE_TRANSLATION_TIMEOUT_MS is ignored.
Retries cover transient HTTP and network failures and honor Retry-After.
`;
