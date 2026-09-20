import { ArchiveError } from "../../archive/errors.ts";
import type { BuddhaTextField, BuddhaTextResource, BuddhaTextValue } from "./types.ts";

class ByteReader {
  readonly bytes: Uint8Array;
  offset: number;

  constructor(bytes: Uint8Array, offset: number) {
    this.bytes = bytes;
    this.offset = offset;
  }

  remaining(): number {
    return this.bytes.length - this.offset;
  }

  peek(): number | undefined {
    return this.bytes[this.offset];
  }

  skipSpaces(): void {
    while (this.offset < this.bytes.length) {
      const value = this.bytes[this.offset];
      if (value !== 0x09 && value !== 0x0a && value !== 0x0d && value !== 0x20) {
        break;
      }
      this.offset += 1;
    }
  }

  expectByte(expected: number, label: string): void {
    const value = this.bytes[this.offset];
    if (value !== expected) {
      throw new ArchiveError(
        "RESOURCE",
        `Expected ${label} at ${this.offset}, got ${value === undefined ? "EOF" : value}`,
      );
    }
    this.offset += 1;
  }
}

function isIdentStart(value: number): boolean {
  return (value >= 0x41 && value <= 0x5a) || (value >= 0x61 && value <= 0x7a) || value === 0x5f || value === 0x24;
}

function isIdentPart(value: number): boolean {
  return isIdentStart(value) || (value >= 0x30 && value <= 0x39);
}

function isValueDelimiter(value: number): boolean {
  return value === 0x3b || value === 0x2c || value === 0x7d || value === 0x5d;
}

function readIdent(reader: ByteReader, label: string): { readonly text: string; readonly offset: number } {
  reader.skipSpaces();
  const start = reader.offset;
  const first = reader.peek();
  if (first === undefined || !isIdentStart(first)) {
    throw new ArchiveError("RESOURCE", `Expected ${label} identifier at ${start}`);
  }
  reader.offset += 1;
  while (reader.offset < reader.bytes.length) {
    const value = reader.peek();
    if (value === undefined || !isIdentPart(value)) {
      break;
    }
    reader.offset += 1;
  }
  return { text: new TextDecoder("ascii").decode(reader.bytes.subarray(start, reader.offset)), offset: start };
}

function readQuoted(reader: ByteReader): BuddhaTextValue {
  const start = reader.offset;
  reader.expectByte(0x22, "quoted string");
  const contentStart = reader.offset;
  while (reader.offset < reader.bytes.length) {
    const value = reader.bytes[reader.offset];
    if (value === 0x22) {
      const text = new TextDecoder("utf-8").decode(reader.bytes.subarray(contentStart, reader.offset));
      reader.offset += 1;
      return { kind: "string", value: text, quoted: true, byteOffset: start };
    }
    if (value === 0x5c && reader.offset + 1 < reader.bytes.length) {
      reader.offset += 2;
      continue;
    }
    reader.offset += 1;
  }
  throw new ArchiveError("RESOURCE", `Unterminated quoted string at ${start}`);
}

function readUnquoted(reader: ByteReader): BuddhaTextValue {
  const start = reader.offset;
  while (reader.offset < reader.bytes.length) {
    const value = reader.peek();
    if (value === undefined || isValueDelimiter(value) || value === 0x7b || value === 0x5b) {
      break;
    }
    reader.offset += 1;
  }
  const text = new TextDecoder("utf-8").decode(reader.bytes.subarray(start, reader.offset)).trimEnd();
  return { kind: "string", value: text, quoted: false, byteOffset: start };
}

function readArray(reader: ByteReader): BuddhaTextValue {
  reader.expectByte(0x5b, "[");
  const items: BuddhaTextValue[] = [];
  while (true) {
    reader.skipSpaces();
    if (reader.peek() === 0x5d) {
      reader.offset += 1;
      break;
    }
    items.push(readValue(reader));
    reader.skipSpaces();
    if (reader.peek() === 0x2c) {
      reader.offset += 1;
      continue;
    }
    if (reader.peek() === 0x5d) {
      reader.offset += 1;
      break;
    }
    throw new ArchiveError("RESOURCE", `Expected comma or ] in array at ${reader.offset}`);
  }
  return { kind: "array", items };
}

function readFields(reader: ByteReader): readonly BuddhaTextField[] {
  reader.skipSpaces();
  reader.expectByte(0x7b, "{");
  const fields: BuddhaTextField[] = [];
  while (true) {
    reader.skipSpaces();
    if (reader.peek() === 0x7d) {
      reader.offset += 1;
      break;
    }
    if (reader.peek() === 0x3b || reader.peek() === 0x2c) {
      reader.offset += 1;
      continue;
    }
    const key = readIdent(reader, "field");
    reader.skipSpaces();
    reader.expectByte(0x3d, "=");
    fields.push({ key: key.text, keyOffset: key.offset, value: readValue(reader) });
    reader.skipSpaces();
    if (reader.peek() === 0x3b) {
      reader.offset += 1;
    }
  }
  return fields;
}

function readValue(reader: ByteReader): BuddhaTextValue {
  reader.skipSpaces();
  const first = reader.peek();
  if (first === undefined || isValueDelimiter(first)) {
    return { kind: "empty" };
  }
  if (first === 0x22) {
    return readQuoted(reader);
  }
  if (first === 0x40) {
    const start = reader.offset;
    reader.offset += 1;
    const begin = reader.offset;
    while (reader.offset < reader.bytes.length) {
      const value = reader.peek();
      if (value === undefined || isValueDelimiter(value)) {
        break;
      }
      reader.offset += 1;
    }
    return {
      kind: "reference",
      value: new TextDecoder("utf-8").decode(reader.bytes.subarray(begin, reader.offset)),
      byteOffset: start,
    };
  }
  if (first === 0x5b) {
    return readArray(reader);
  }
  if (first === 0x7b) {
    return { kind: "object", typeName: "", fields: readFields(reader) };
  }
  if (isIdentStart(first)) {
    const start = reader.offset;
    const typeName = readIdent(reader, "type");
    reader.skipSpaces();
    if (reader.peek() === 0x7b) {
      return { kind: "object", typeName: typeName.text, fields: readFields(reader) };
    }
    const next = reader.peek();
    if (next === undefined || isValueDelimiter(next)) {
      return { kind: "string", value: typeName.text, quoted: false, byteOffset: typeName.offset };
    }
    reader.offset = start;
    return readUnquoted(reader);
  }
  return readUnquoted(reader);
}

export function parseBuddhaTextResource(bytes: Uint8Array): BuddhaTextResource {
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined || bytes.length < 5) {
    throw new ArchiveError("RESOURCE", "Buddha text resource is shorter than the size prefix plus a type name");
  }
  const declaredSize = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
  if (declaredSize !== bytes.length - 4) {
    throw new ArchiveError(
      "RESOURCE",
      `Buddha text size prefix ${declaredSize} does not match remaining ${bytes.length - 4} bytes`,
    );
  }
  const reader = new ByteReader(bytes, 4);
  reader.skipSpaces();
  const versionByte = reader.peek();
  if (versionByte === undefined || versionByte < 0x30 || versionByte > 0x39) {
    throw new ArchiveError("RESOURCE", "Buddha text resource does not start with a version digit");
  }
  const version = String.fromCharCode(versionByte);
  reader.offset += 1;
  const typeName = readIdent(reader, "resource type");
  const fields = readFields(reader);
  reader.skipSpaces();
  while (reader.peek() === 0x00) {
    reader.offset += 1;
  }
  reader.skipSpaces();
  if (reader.remaining() !== 0) {
    throw new ArchiveError("RESOURCE", `Trailing bytes after ${typeName.text} at ${reader.offset}`);
  }
  return {
    declaredSize,
    version,
    typeName: typeName.text,
    fields,
    bodyByteOffset: 4,
  };
}

export function fieldMap(fields: readonly BuddhaTextField[]): Map<string, BuddhaTextValue> {
  return new Map(fields.map((field) => [field.key, field.value]));
}

export function stringField(fields: readonly BuddhaTextField[], key: string): string | undefined {
  const value = fieldMap(fields).get(key);
  if (value?.kind === "string") {
    return value.value;
  }
  if (value?.kind === "empty") {
    return "";
  }
  return undefined;
}
