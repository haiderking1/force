import { expect, test } from "bun:test";
import { encodeSwfMatrix } from "./matrix.ts";
import { parsePlaceObject2, translatePlaceObject2 } from "./place-object.ts";

test("PlaceObject2 translate rewrites only the MATRIX bytes", () => {
  const matrix = encodeSwfMatrix({
    hasScale: false,
    scaleX: 65536,
    scaleY: 65536,
    hasRotate: false,
    rotate0: 0,
    rotate1: 0,
    translateX: 100,
    translateY: 200,
  });
  const name = new TextEncoder().encode("Subtitle\0");
  const data = new Uint8Array(1 + 2 + 2 + matrix.length + name.length);
  data[0] = 0x26;
  data[1] = 1;
  data[2] = 0;
  data[3] = 8;
  data[4] = 0;
  data.set(matrix, 5);
  data.set(name, 5 + matrix.length);
  const parsed = parsePlaceObject2(data);
  expect(parsed.characterId).toBe(8);
  expect(parsed.name).toBe("Subtitle");
  expect(parsed.matrix?.translateY).toBe(200);
  const moved = parsePlaceObject2(translatePlaceObject2(data, 0, 720));
  expect(moved.characterId).toBe(8);
  expect(moved.name).toBe("Subtitle");
  expect(moved.matrix?.translateX).toBe(100);
  expect(moved.matrix?.translateY).toBe(920);
});
