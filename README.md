# force

A static Arabic translator for games. It works on text stored in game files instead of hooking or injecting into a running game.

## Status

TypeScript CLI with a reusable OpenAI-compatible translation client and a separate read-only resource discovery pass. The example setup selects Cline Pass DeepSeek V4.1 Flash. Free and paid Cline providers remain available. All three disable thinking. Game packing and installed game edits are out of scope. Discovery inventories an installed game tree and can list or extract Buddha dfpf v5 `.~h`/`.~p` entries without writing back to the game.

## Requirements

- Bun 1.4.2 or newer

## Setup

```sh
bun install
cp .env.example .env
```

Put your Cline API key in `FORCE_TRANSLATION_API_KEY`. Force sends it unchanged as a Bearer credential, without adding an OAuth prefix. See [Cline authentication](https://docs.cline.bot/api/authentication). The example setup explicitly selects the subscription provider and its HTTP model id:

```dotenv
FORCE_TRANSLATION_PROVIDER=cline-pass
FORCE_TRANSLATION_MODEL=cline-pass/deepseek-v4.1-flash
```

An unset or empty model with `cline-pass` defaults to `cline-pass/deepseek-v4.1-flash`. Other overrides must start with `cline-pass/` and name a model. Stale free or paid model overrides are rejected before sending a request. There is no billing fallback. [Official Cline Pass documentation](https://raw.githubusercontent.com/cline/cline/main/docs/getting-started/clinepass.mdx) describes using subscription models outside Cline with the same API key and `cline-pass/` model slug.

For paid Cline, change both settings in your environment:

```dotenv
FORCE_TRANSLATION_PROVIDER=cline
FORCE_TRANSLATION_MODEL=deepseek/deepseek-v4.1-flash
```

With `cline` selected, an unset or empty model defaults to `deepseek/deepseek-v4.1-flash`. Remove or replace an existing free model override when switching. All three providers use `https://api.cline.bot/api/v1/chat/completions`. Paid Cline and Cline Pass send only the official JSON content type and Bearer authentication headers, without Desktop headers. The provider name controls local routing and is not sent in the JSON body. Omitting the provider keeps `cline-free` and its `cline-free/deepseek-v4.1-flash` default. To select free explicitly, set both `FORCE_TRANSLATION_PROVIDER=cline-free` and `FORCE_TRANSLATION_MODEL=cline-free/deepseek-v4.1-flash`.

## Workers and retries

Live `translate` splits items into batches of `FORCE_TRANSLATION_BATCH_SIZE` (default 50) and runs `FORCE_TRANSLATION_WORKERS` concurrent workers (default 100). A worker claims one batch, sends one model request, then claims the next. It does not send the whole corpus as one request, and it does not wait for the rest of the pool before taking more work.

Failed batches do not stop other workers. Inline `translate` still throws after the pool drains if any batch failed. File mode keeps going: a nonfatal model RESPONSE error retries that batch once, then splits it in half and repeats until a single item remains. A singleton gets three more repair attempts, then it is written to `unresolved.json` and left for a human. Sibling items that already validated are saved immediately and are not thrown away if the other half fails or the run is cancelled. HTTP transport retries stay on `FORCE_TRANSLATION_MAX_RETRIES` and are not reused as recovery attempts. HTTP 401, 403, and 402 stop dispatch. There is no credit fallback.

There is no per-request HTTP timeout. An old `FORCE_TRANSLATION_TIMEOUT_MS` value in `.env` is ignored.

`FORCE_TRANSLATION_MAX_RETRIES` and `FORCE_TRANSLATION_RETRY_BACKOFF_MS` apply to transient HTTP statuses (429, 500, 502, 503, 504, 529) and network failures. Invalid credentials, quota failures, bad configuration, and cancellation are not retried. When the provider sends `Retry-After`, that delay is used instead of exponential backoff. A retry stays on the same worker, so it counts against the concurrency limit. Recovery subjobs share that same worker cap. The queue refills as workers free up. It does not start a nested pool.

## Run

```sh
bun run start
bun run start translate --dry-run --id greet --text "Hello, {name}!" --placeholder "{name}"
bun run start translate --id greet --text "Hello, {name}!" --placeholder "{name}"
```

File mode translates every StringTable id from an extracted `strings.json`. Linked
reference rows are ignored. A validated full batch is still written under
`--out/batches`. Recovered items from a split batch go under `--out/items` so a
crash keeps the successful half. `--resume` reuses both. It refuses a
mismatched source, prompt, or model identity and does not rewrite old batch
files.

```sh
bun --no-env-file run start translate --input out/archive/brutal-legend/strings.json --out out/translations/brutal-legend --plan
bun run start translate --input out/archive/brutal-legend/strings.json --out out/translations/brutal-legend
bun run start translate --input out/archive/brutal-legend/strings.json --out out/translations/brutal-legend --resume
```

`--plan` and `--dry-run` do not call the API. `--plan` prints item and batch
counts plus checkpoint paths. Live file mode needs `FORCE_TRANSLATION_API_KEY`.
Progress is `out/translations/brutal-legend/status.json`. Assembled source-order
output is `out/translations/brutal-legend/translations.json`. Exhausted
singletons are `out/translations/brutal-legend/unresolved.json`.

The request prompt includes an output contract and per-item required token
counts. Validators still reject invalid JSON, missing or unexpected ids, and
token-count mismatches. File mode then splits that failed request and saves the
children that pass. The unresolved list is only the singletons that still fail
after the repair bound. A run is not complete while any item is missing.

Checkpoint identity hashes the system prompt. Changing the prompt does not
rewrite or rebrand saved batches. `--resume` refuses a mismatched identity.
Start a new `--out`, or keep the old prompt, if you need those files.

`translate` without `--dry-run` or `--plan` sends a live request. Offline tests never do that.

## Discovery

```sh
bun run start discover scan --game brutal-legend --root "$HOME/.local/share/Steam/steamapps/common/BrutalLegend"
bun run start discover summary --report out/discovery/brutal-legend-scan.json
bun run start discover show --report out/discovery/brutal-legend-scan.json --id Win/Packs/man_trivial.txt
bun run start discover classify --report out/discovery/brutal-legend-scan.json
bun run start discover pack list --header "$HOME/.local/share/Steam/steamapps/common/BrutalLegend/Win/Packs/Man_Trivial.~h"
bun run start discover pack extract --header "$HOME/.local/share/Steam/steamapps/common/BrutalLegend/Win/Packs/Man_Trivial.~h" --entry stringtable/brutallegend
bun run start discover pack strings --game brutal-legend --out out/archive/brutal-legend
```

`discover scan` is local and writes `out/discovery/<game>-scan.json`. It does not call Jev. Ranked scan output is local evidence, not a Jev result.

`discover pack` reads `.~h`/`.~p` pairs and writes listings or extracted records under `out/archive/`. It does not edit game files.

`discover classify` sends bounded report evidence to `POST https://api.typesafe.ai/v1/systemone` and needs `FORCE_JEV_API_KEY`. Jev answers independent Noul questions about UI text, dialogue, reference-only material, debug text, and insufficient evidence. It does not prove the game renders a string and it does not unpack unknown archives.

Jev concurrency defaults to 4 and is capped at 16. Translation still defaults to 100 workers.

## Tests

```sh
bun test --no-env-file
```

## Type check

```sh
bun --no-env-file run typecheck
```

## Layout

`src/cli/` is the entry and argument parser. `src/translation/` is the reusable client, config loader, worker pool, response checks, and the subscription, paid, and free Cline adapters with shared transport. `src/archive/` is the reusable archive interfaces and the Buddha dfpf v5 adapter. `src/resources/` decodes StringTable and related Buddha text resources. `src/discovery/` is inventory, evidence extraction, report ranking, the Jev adapter, and the Brütal Legend game adapter.
