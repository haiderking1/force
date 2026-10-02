import { parseBinki } from "./container.ts";

/** Replace video packets while preserving original audio headers and packets. */
export function replaceBinkiVideo(originalBytes: Uint8Array, encodedBytes: Uint8Array): Uint8Array {
  const original = parseBinki(originalBytes);
  const encoded = parseBinki(encodedBytes);
  if (encoded.audioTracks !== 0) throw new Error("Replacement video must not contain audio");
  const sourceView = new DataView(originalBytes.buffer, originalBytes.byteOffset, originalBytes.byteLength);
  const encodedView = new DataView(encodedBytes.buffer, encodedBytes.byteOffset, encodedBytes.byteLength);
  for (const offset of [8, 16, 20, 24, 28, 32, 36]) {
    if (sourceView.getUint32(offset, true) !== encodedView.getUint32(offset, true)) throw new Error("BIKi video properties differ at header offset " + offset);
  }
  const lengths = original.frames.map((frame, i) => {
    const video = encoded.frames[i];
    if (!video) throw new Error("Missing encoded BIKi frame");
    const length = frame.audio.length + video.video.length;
    if (length % 2 !== 0) throw new Error("BIKi frame is not aligned");
    return length;
  });
  const size = original.dataOffset + lengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isSafeInteger(size) || size > 0xfffffffe) throw new Error("BIKi output exceeds offset range");
  const result = new Uint8Array(size);
  result.set(originalBytes.subarray(0, original.dataOffset));
  const view = new DataView(result.buffer);
  view.setUint32(4, size - 8, true);
  view.setUint32(12, lengths.reduce((max, length) => Math.max(max, length), 0), true);
  let cursor = original.dataOffset;
  for (let i = 0; i < original.frames.length; i++) {
    const source = original.frames[i];
    const replacement = encoded.frames[i];
    if (!source || !replacement) throw new Error("Missing BIKi frame");
    view.setUint32(original.indexOffset + i * 4, cursor + Number(replacement.keyframe), true);
    result.set(source.audio, cursor);
    cursor += source.audio.length;
    result.set(replacement.video, cursor);
    cursor += replacement.video.length;
  }
  view.setUint32(original.indexOffset + original.frames.length * 4, cursor, true);
  parseBinki(result);
  return result;
}
