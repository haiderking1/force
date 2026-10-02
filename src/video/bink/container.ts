export type BinkFrame = { readonly keyframe: boolean; readonly audio: Uint8Array; readonly video: Uint8Array };
export type BinkContainer = {
  readonly bytes: Uint8Array;
  readonly indexOffset: number;
  readonly dataOffset: number;
  readonly audioTracks: number;
  readonly frames: readonly BinkFrame[];
};

/** BIKi only. Frame/audio lengths are bounded before creating any views. */
export function parseBinki(bytes: Uint8Array): BinkContainer {
  if (bytes.length < 44 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "BIKi") throw new Error("Only BIKi containers are supported");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset: number): number => view.getUint32(offset, true);
  if (u32(4) + 8 !== bytes.length) throw new Error("BIKi file size mismatch");
  const count = u32(8);
  if (count === 0 || count !== u32(16)) throw new Error("Invalid BIKi frame counts");
  if (!u32(20) || !u32(24) || !u32(28) || !u32(32)) throw new Error("Invalid BIKi dimensions or frame rate");
  const audioTracks = u32(40);
  if (audioTracks > 256) throw new Error("Too many BIKi audio tracks");
  const indexOffset = 44 + audioTracks * 12;
  const indexEnd = indexOffset + (count + 1) * 4;
  if (indexEnd > bytes.length) throw new Error("Truncated BIKi index");
  const dataOffset = u32(indexOffset) - (u32(indexOffset) % 2);
  if (dataOffset < indexEnd || dataOffset >= bytes.length) throw new Error("Invalid BIKi data start");
  if (u32(indexOffset + count * 4) !== bytes.length) throw new Error("Invalid BIKi final offset");
  const frames: BinkFrame[] = [];
  for (let i = 0; i < count; i++) {
    const entry = u32(indexOffset + i * 4);
    const next = u32(indexOffset + (i + 1) * 4);
    const start = entry - entry % 2;
    const end = next - next % 2;
    if (start < dataOffset || end <= start || end > bytes.length || end - start > u32(12)) throw new Error("Invalid BIKi frame bounds");
    let cursor = start;
    for (let track = 0; track < audioTracks; track++) {
      if (cursor + 4 > end) throw new Error("Truncated BIKi audio length");
      const length = u32(cursor);
      if (length !== 0 && length < 4) throw new Error("Invalid BIKi audio packet");
      cursor += 4 + length;
      if (cursor > end) throw new Error("BIKi audio packet crosses frame boundary");
    }
    if (cursor >= end) throw new Error("Missing BIKi video packet");
    frames.push({ keyframe: entry % 2 === 1, audio: bytes.subarray(start, cursor), video: bytes.subarray(cursor, end) });
  }
  return { bytes, indexOffset, dataOffset, audioTracks, frames };
}
