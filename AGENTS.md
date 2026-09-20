# Agent rules

## 1. No god files

Organize every implementation into focused modules in appropriate nested directories. Group related responsibilities together and keep the boundaries between them clear.

## 2. Implement requirements fully

Implement what was asked, completely. No half-baked or simplified substitutes.

Never trick the compiler or type checker, and never suppress errors just to make a check pass. This includes casts through `any`, `@ts-ignore`/`@ts-expect-error`, or any equivalent escape hatch.

If the implementation becomes too complex, redesign and rewrite it cleanly. Do not cut required functionality to make the work easier.

Prioritize correctness and completeness over rushing or saving tokens. Do not falsely claim unlimited context or tokens.

## 3. Build reusable components

Do not hardcode the implementation to the first game. Keep game-specific details in explicit configuration or isolated adapters, separate from shared extraction, translation, and writing logic. Build reusable parts without claiming support for formats that are not implemented.

## 4. Read complete files

Read every file in full before editing it, then read the entire file again after editing to verify the result.

When learning the project, read relevant files in full. Never use snippets, partial reads, or search excerpts as a substitute for reading complete files to understand the code.
