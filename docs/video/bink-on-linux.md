# Bink 1 encoding on Linux through Wine

## Verified result

RAD Video Tools successfully encoded a PNG into Bink 1 under Wine 11.17. FFprobe identified the result as `BIKi`, and FFmpeg decoded it without errors. This is an external Windows encoder running through Wine, not a native Linux encoder or an integrated Force command.

The test used a frame extracted from Brütal Legend’s `Data/UI/FrontEnd/Movies/newgame.bik`. The English New Game lettering is visible in that decoded frame, so changing StringTable text cannot replace it.

| Property | Verified output |
| --- | --- |
| Codec | `binkvideo` |
| Signature | `BIKi` |
| Dimensions | 1280 × 720 |
| Frame rate | `2997/100`, or 29.97 fps |
| Decoded frames | 1 |
| Duration | 0.033367 seconds |
| File size | 66,024 bytes |
| Audio | None in this PNG-based test |

The original movie has the same signature, dimensions and frame rate, but contains 30 frames. The one-frame output is a smoke test, not a replacement movie. It has not been installed or tested in-game. No game files were changed during this experiment.

## Tools and local paths

Required tools are Wine, 7-Zip, FFmpeg and FFprobe, plus the Windows RAD Video Tools distribution from the [official download page](https://www.radgametools.com/bnkdown.htm). Extract the downloaded archive locally first. The commands below start with the resulting `radtools.exe` installer.

The installer is an NSIS archive. Its executables can be extracted without running the installer:

```sh
# Run from the Force repository root.
ROOT="$PWD"
mkdir -p "$ROOT/out/tools/rad-video"
7z x -aos -o"$ROOT/out/tools/rad-video" "$HOME/radtools.exe" \
  radvideo64.exe radvideo32.exe binkplay.exe
```

`-aos` skips existing files. Use a fresh directory when testing another tool version. Do not mix versions or commit vendor executables. The binaries, dedicated Wine prefix and output files live under ignored `out/`.

The Linux Bink download is a player, not the encoder used here. No public native Linux encoder was found in the documentation checked; this does not establish whether RAD offers one privately.

## Reproduce the smoke test

Run in the same shell as the setup above. Use a fresh temporary directory so existing evidence is not overwritten:

```sh
GAME="$HOME/.local/share/Steam/steamapps/common/BrutalLegend"
TEST_DIR="$(mktemp -d "$ROOT/out/tools/rad-video/smoke-XXXXXX")"

ffmpeg -hide_banner -loglevel error -n \
  -i "$GAME/Data/UI/FrontEnd/Movies/newgame.bik" \
  -frames:v 1 "$TEST_DIR/input.png"

cd "$TEST_DIR"
WINEPREFIX="$ROOT/out/tools/rad-video/wine-prefix" WINEDEBUG=-all \
  wine ../radvideo64.exe Binkc input.png output-bink1.bik \
  /V100 /F29.97 /D2000000 /#
```

Run Wine as your normal desktop user, not root. This command uses a separate prefix rather than modifying your default Wine setup. It may show RAD’s compression window. It does not impose an automatic timeout.

Switches used:

- `Binkc` selects the Bink 1 compressor.
- `/V100` explicitly selects Bink 1 output.
- `/F29.97` sets the output frame rate.
- `/D2000000` requests a target data rate of 2,000,000 bytes per second. It is not a guarantee of exact file size or a quality setting tuned for every movie.
- `/#` exits on completion instead of waiting for the Done button.

The input and output are plain filenames relative to the working directory. One earlier invocation delivered a malformed Windows path with its backslashes missing. Using relative names avoided that failure.

## Validate independently

An encoder exit code of zero is not enough. Inspect and fully decode its output:

```sh
ffprobe -v error -count_frames \
  -show_entries stream=codec_name,codec_tag_string,width,height,r_frame_rate,nb_read_frames \
  -show_entries format=size,duration -of json output-bink1.bik

ffmpeg -hide_banner -v error -xerror \
  -i output-bink1.bik -f null -
```

Both commands passed on the recorded output. The successful run still printed Mesa/EGL warnings. Those warnings did not prevent encoding in this test; they are not a reason to ignore a failed exit code or missing output.

## Failed attempts and corrections

| Symptom | Evidence and correction |
| --- | --- |
| Error opening input, with missing path separators | The error dialog displayed a malformed input path. Retried from the test directory with `input.png`. |
| “The quality setting can only be used by Bink 2.” | `/Q0.9` is not valid for this Bink 1 encode. Removed `/Q` and used `/D2000000`. |
| Batch completion would require clicking Done | RAD documents `/#` for automatic exit after compression. Included it in the successful command. |

These were invocation problems, not evidence that Wine could not run the encoder.

## Recorded artifacts

The original successful test remains at `out/tools/rad-video/smoke/`:

- `input.png`: unmodified decoded menu frame.
- `output-bink1.bik`: independently decoded single-frame output.

SHA-256 values recorded after the successful test:

```text
783c15fd5b355457203fa760fc3d768b1354fc78a2c086ef82c3d3b6a9ebf810  radvideo64.exe
b4a6c5b77c1b3e66c0a747937fc29e360139b850cc27e5eefcd7f40b9525fcf0  output-bink1.bik
```

These identify the local test files. They are not vendor signatures or promises that a different version or encode will produce identical bytes.

## Remaining work before a game patch

The encoder test does not translate artwork. A movie patch still needs to remove English lettering, render Arabic with the intended font, and track its perspective and movement across idle, zoom and transition clips. Edits must remain consistent between those clips.

Preserve and verify the original frame count, frame rate, dimensions, audio tracks and timing for each replacement. Check the full decode and inspect edited frames. Matching the Bink signature alone does not prove compatibility with the game’s decoder.

Only install a complete, validated movie after creating verified backups and closing the game. Do not install this one-frame smoke test. The working Arabic dialog patch is separate from these untouched movie assets.

## References

- [RAD Video Tools downloads](https://www.radgametools.com/bnkdown.htm)
- [RAD FAQ: batch processing and command-line tools](https://www.radgametools.com/binkfaq.htm)
- [Bink compression options](https://www.radgametools.com/binkhcwb.htm)

Check RAD’s current terms before redistributing its tools or using its encoder commercially.
