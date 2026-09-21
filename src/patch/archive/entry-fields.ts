import { writeMsbBits } from "../../archive/buddha/bits.ts";
import {
  BUDDHA_CONTENT_BITS,
  BUDDHA_ENTRY_SIZE,
  BUDDHA_PAYLOAD_OFFSET_BITS,
  BUDDHA_STORED_SIZE_BITS,
} from "../../archive/buddha/limits.ts";
import { PatchError } from "../errors.ts";

const CONTENT_MAX = (1 << BUDDHA_CONTENT_BITS) - 1;
const PAYLOAD_OFFSET_MAX = (1 << BUDDHA_PAYLOAD_OFFSET_BITS) - 1;
const STORED_MAX = (1 << BUDDHA_STORED_SIZE_BITS) - 1;

export function assertFieldFits(name: string, value: number, max: number): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new PatchError("LIMIT", `${name} ${value} does not fit in 0..${max}`);
  }
}

export function patchEntrySizeFields(
  record: Uint8Array,
  fields: {
    readonly contentSize: number;
    readonly payloadOffset: number;
    readonly storedSize: number;
  },
): Uint8Array {
  if (record.length !== BUDDHA_ENTRY_SIZE) {
    throw new PatchError("BOUNDS", `File index record is ${record.length} bytes, expected ${BUDDHA_ENTRY_SIZE}`);
  }
  assertFieldFits("contentSize", fields.contentSize, CONTENT_MAX);
  assertFieldFits("payloadOffset", fields.payloadOffset, PAYLOAD_OFFSET_MAX);
  assertFieldFits("storedSize", fields.storedSize, STORED_MAX);
  const next = record.slice();
  writeMsbBits(next, fields.contentSize, 0, 0, BUDDHA_CONTENT_BITS);
  writeMsbBits(next, fields.payloadOffset, 8, 0, BUDDHA_PAYLOAD_OFFSET_BITS);
  writeMsbBits(next, fields.storedSize, 11, 5, BUDDHA_STORED_SIZE_BITS);
  return next;
}

export function entrySlotEnd(
  entries: readonly { readonly index: number; readonly payloadOffset: number; readonly storedSize: number }[],
  index: number,
  dataFooterOffset: number,
): number {
  const entry = entries[index];
  if (entry === undefined) {
    throw new PatchError("ENTRY", `No archive entry ${index}`);
  }
  let nextOffset = dataFooterOffset;
  for (const other of entries) {
    if (other.index === entry.index) {
      continue;
    }
    if (other.payloadOffset >= entry.payloadOffset + entry.storedSize && other.payloadOffset < nextOffset) {
      nextOffset = other.payloadOffset;
    }
  }
  return nextOffset;
}
