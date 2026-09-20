# force

A static Arabic translator for games. It works on text stored in game files instead of hooking or injecting into a running game.

## Status

TypeScript CLI with a reusable OpenAI-compatible translation client. The wired provider is Cline Free DeepSeek V4.1 Flash, with thinking disabled. Game extraction, packing, fonts, and installed game edits are out of scope here.

## Requirements

- Bun 1.4.2 or newer

## Setup

```sh
bun install
cp .env.example .env
```

Put a Cline/WorkOS access token in `FORCE_TRANSLATION_API_KEY`. The HTTP model id is `cline-free/deepseek-v4.1-flash`. That is not the Pi model id.

## Workers and retries

Live `translate` splits items into batches of `FORCE_TRANSLATION_BATCH_SIZE` (default 50) and runs `FORCE_TRANSLATION_WORKERS` concurrent workers (default 100). A worker claims one batch, sends one model request, then claims the next. It does not send the whole corpus as one request, and it does not wait for the rest of the pool before taking more work.

Failed batches do not stop other workers. After the pool drains, `translate` throws if any batch failed. Caller cancellation through `AbortSignal` aborts in-flight requests and does not start queued batches.

There is no per-request HTTP timeout. An old `FORCE_TRANSLATION_TIMEOUT_MS` value in `.env` is ignored.

`FORCE_TRANSLATION_MAX_RETRIES` and `FORCE_TRANSLATION_RETRY_BACKOFF_MS` apply to transient HTTP statuses (429, 500, 502, 503, 504, 529) and network failures. Invalid credentials, bad configuration, and cancellation are not retried. When the provider sends `Retry-After`, that delay is used instead of exponential backoff. A retry stays on the same worker, so it counts against the concurrency limit.

## Run

```sh
bun run start
bun run start translate --dry-run --id greet --text "Hello, {name}!" --placeholder "{name}"
bun run start translate --id greet --text "Hello, {name}!" --placeholder "{name}"
```

`translate` without `--dry-run` sends a live request. Offline tests never do that.

## Tests

```sh
bun test
```

## Type check

```sh
bun run typecheck
```

## Layout

`src/cli/` is the entry and argument parser. `src/translation/` is the reusable client, config loader, worker pool, response checks, and the Cline Free adapter.
