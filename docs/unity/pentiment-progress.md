# Pentiment progress

The translation pass completed all 35,996 English table entries across 403 tables. No failed or pending translation items remain. This includes empty entries and strings intentionally preserved as identifiers or Latin text. The reviewed logical-text stage adds 37 source-guarded corrections without changing translation checkpoints.

Pentiment is Unity 2021.3.45f2 with IL2CPP. The inventory contains 1,762 readable containers, 8,895 Texture2D objects, and 17 TMP font assets. Opaque component failures remain listed in `out/unity/pentiment/progress.json`. Embedded extraction found 1,730 component-text candidates, 282 UTF-8 TextAssets, and 239 binary TextAssets. Those candidates are not an approved second translation corpus.

## Saved artifacts

- Translation checkpoint and assembled output: `out/translations/pentiment-v1`.
- Original English table and extracted corpus: `out/unity/pentiment/text-v1`.
- Corrected logical Arabic tables: `out/experiments/pentiment-logical-text-v2`.
- Static font pilot: `out/experiments/pentiment-font-pilot-v2`. It adds 65 PUA glyphs starting at E800 and six explicit fallback links. `text-preview.png` reconstructs 16 samples from the rebuilt atlas. It is not an in-game screenshot.
- Artwork source review: `out/unity/pentiment/artwork-review-v1`. The 91 candidates came from a name filter, not exhaustive visual discovery.
- Twelve Arabic note drafts: `out/unity/pentiment/notes-repaint-v3`, with explicit regions, source hashes, lettering hashes, masks, and preserved source alpha.
- Verified note containers: `out/experiments/pentiment-notes-v1`. Twelve texture edits span 11 bundles. Reopened texture pixels match the replacement PNGs exactly. Untouched objects and streamed resources retain their hashes.
- Combined offline review stage: `out/experiments/pentiment-review-bundle-v1`. Fourteen files combine the logical table, note bundles, font pilot, and one rebuilt Addressables catalog. Combining these artifacts does not make them a working localization.
- Coverage, hashes, test counts, and unresolved findings: `out/unity/pentiment/progress.json`.

The original review stages remain `installReady: false` and `inGameVerified: false`. The inventory hash check and `out/unity/pentiment/progress.json` describe the pre-installation snapshot.

On 2026-09-22 the user requested installation of the experimental preview. `pentiment-user-preview-v1` installed 14 files, but the user reported blank menu labels. Logical Arabic did not match the pilot's PUA glyphs. That entire installation was restored from `out/backups/pentiment-user-preview-v1`; that backup now has state `restored`.

The replacement `out/experiments/pentiment-menu-fix-v1` installs 10 explicitly shaped menu entries with 42 matching PUA glyphs and a rebuilt catalog. Its three files were installed with verified fresh originals at `out/backups/pentiment-menu-fix-v1`. The remaining table entries are original English, and the artwork drafts are no longer installed. After launching the game, the user confirmed: "yea it showed arabic correctly". This confirms menu rendering, not full-game coverage or dialogue effects. Evidence is saved in the stage's `runtime-verification.json`. Keep English selected.

To restore, close Pentiment and run:

```sh
bun --no-env-file src/cli/index.ts unity restore --backup out/backups/pentiment-menu-fix-v1 --confirm
```

## Runtime experiment removed

An out-of-scope BepInEx experiment was removed at the user's request. Its installed loader files were hash-checked before removal, generated BepInEx files were moved outside the game, and the Pentiment-specific Wine `winhttp` override was deleted. The three-file static menu patch and its rollback backups were preserved. Runtime installer code is not part of this project.

## Unfinished work

1. Investigate static asset solutions for the game's custom stroked and printed text, writing order, substitutions, mixed-direction text, and measured wrapping. Runtime hooks and injection are outside the project's scope. The existing PUA menu patch does not solve full-game rendering; unsupported cases must remain explicit blockers.
2. Investigate opaque components and review extracted embedded text before asserting text or subtitle coverage.
3. Review all remaining artwork categories. The Lorenz note drafts also need better blood-texture restoration; the current inpainting visibly smooths areas behind the lettering.
4. Complete linguistic review. The first review found puzzle-breaking mistranslations of Matins and Chapter, two malformed mixed-script words, and a bonfire clue. Those reviewed instances are corrected, but that is not proof the rest is clean.
5. Perform in-game validation only through a deliberate, verified pilot with a fresh backup and the game closed during file replacement. Do not approve the combined stage merely to bypass its blockers.

## Checks completed

- 41 focused Bun tests, including translation checkpoint regression tests.
- 12 Python tests, including rollback, restore, hash mismatch rejection, catalog offset reconstruction, atlas preservation, stage conflicts, and artwork mask boundaries.
- Scoped TypeScript checking of the Unity CLI, static encoder, and preparation scripts under a 2G cap.
- Python compilation and scoped whitespace checks.
- Real-game bundle, catalog, font, and texture round-trip checks.

The user confirmed correct Arabic menu rendering for the menu fix. Full-game visual validation, a full-project typecheck, and Windows execution testing remain outstanding. Brütal Legend's existing installation and deferred work were left alone.
