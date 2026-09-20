import type { ArchiveFileType } from "../types.ts";
import { ArchiveError } from "../errors.ts";
import { readCString, readU32Be } from "./bits.ts";
import type { BuddhaHeader } from "./header.ts";
import { BUDDHA_MAX_TYPE_NAME } from "./limits.ts";

export function parseBuddhaFileTypes(bytes: Uint8Array, header: BuddhaHeader): readonly ArchiveFileType[] {
  const types: ArchiveFileType[] = [];
  let position = header.fileTypeOffset;
  for (let index = 0; index < header.fileTypeCount; index += 1) {
    if (position + 4 > bytes.length) {
      throw new ArchiveError("BOUNDS", `File type ${index} name length overruns the header`);
    }
    const nameLength = readU32Be(bytes, position);
    position += 4;
    if (nameLength === 0 || nameLength > BUDDHA_MAX_TYPE_NAME) {
      throw new ArchiveError("BOUNDS", `File type ${index} has invalid name length ${nameLength}`);
    }
    if (position + nameLength + 12 > bytes.length) {
      throw new ArchiveError("BOUNDS", `File type ${index} record overruns the header`);
    }
    const name = readCString(bytes, position, nameLength);
    if (name.length === 0) {
      throw new ArchiveError("BOUNDS", `File type ${index} name is empty`);
    }
    position += nameLength;
    const unknown1 = readU32Be(bytes, position);
    const unknown2 = readU32Be(bytes, position + 4);
    const unknown3 = readU32Be(bytes, position + 8);
    position += 12;
    types.push({ index, name, unknown1, unknown2, unknown3 });
  }
  if (position > header.fileIndexOffset) {
    throw new ArchiveError("BOUNDS", "File type table overlaps the file index");
  }
  return types;
}
