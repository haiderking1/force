import { expect, test } from "bun:test";
import { parseBinki } from "./container.ts";
import { replaceBinkiVideo } from "./remux.ts";

function fixture(audio: boolean, value = 11): Uint8Array {
  const tracks = Number(audio);
  const start = 44 + tracks * 12 + 12;
  const frameSize = audio ? 12 : 4;
  const bytes = new Uint8Array(start + frameSize * 2);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("BIKi"));
  for (const [offset, n] of [[4,bytes.length-8],[8,2],[12,frameSize],[16,2],[20,1280],[24,720],[28,2997],[32,100],[40,tracks]]) {
    if (offset === undefined || n === undefined) throw new Error("Invalid fixture");
    view.setUint32(offset,n,true);
  }
  if (audio) {
    view.setUint32(44, 4096, true);
    view.setUint16(48, 48000, true);
    view.setUint16(50, 0x3000, true);
    view.setUint32(52, 7, true);
  }
  const index = 44 + tracks * 12;
  view.setUint32(index,start+1,true);
  view.setUint32(index+4,start+frameSize,true);
  view.setUint32(index+8,bytes.length,true);
  for (let i=0;i<2;i++) {
    const pos=start+i*frameSize;
    if (audio) {
      view.setUint32(pos,4,true);
      view.setUint32(pos+4,123+i,true);
    }
    bytes.fill(value+i,pos+(audio?8:0),pos+frameSize);
  }
  return bytes;
}

test("BIKi remux preserves original audio metadata and frame audio bytes", () => {
  const source=fixture(true);
  const video=fixture(false,90);
  const output=replaceBinkiVideo(source,video);
  const parsed=parseBinki(output);
  expect(parsed.audioTracks).toBe(1);
  expect(output.subarray(44,56)).toEqual(source.subarray(44,56));
  for(let i=0;i<2;i++) {
    expect(parsed.frames[i]?.audio).toEqual(parseBinki(source).frames[i]?.audio);
    expect(parsed.frames[i]?.video).toEqual(parseBinki(video).frames[i]?.video);
  }
  expect(parsed.frames.map(f=>f.keyframe)).toEqual([true,false]);
});

test("BIKi silent identity remux is byte exact", () => {
  const source=fixture(false);
  expect(replaceBinkiVideo(source,source)).toEqual(source);
});

test("BIKi remux rejects different frame rates and preexisting replacement audio", () => {
  const source=fixture(true), video=fixture(false);
  new DataView(video.buffer).setUint32(28,30,true);
  expect(()=>replaceBinkiVideo(source,video)).toThrow("properties differ");
  expect(()=>replaceBinkiVideo(source,source)).toThrow("must not contain audio");
});

test("BIKi parsing rejects truncated indexes, audio overruns, and unsupported revisions", () => {
  const truncated=fixture(false);
  new DataView(truncated.buffer).setUint32(8,1000,true);
  new DataView(truncated.buffer).setUint32(16,1000,true);
  expect(()=>parseBinki(truncated)).toThrow("Truncated");
  const badAudio=fixture(true);
  new DataView(badAudio.buffer).setUint32(parseBinki(badAudio).dataOffset,99999,true);
  expect(()=>parseBinki(badAudio)).toThrow("boundary");
  const unsupported=fixture(false);unsupported[3]=107;
  expect(()=>parseBinki(unsupported)).toThrow("Only BIKi");
});
