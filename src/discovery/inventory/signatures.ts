import { bytesToHex } from "../../shared/encoding/hex.ts";
import type { FileSignature, KnownSignatureName, ResourceKind } from "./types.ts";

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

function asciiStartsWith(bytes: Uint8Array, text: string): boolean {
  return startsWith(
    bytes,
    Array.from(text, (char) => char.charCodeAt(0)),
  );
}

export function identifySignature(bytes: Uint8Array): FileSignature {
  if (asciiStartsWith(bytes, "dfpf")) {
    return { name: "dfpf", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 8)) };
  }
  if (asciiStartsWith(bytes, "CFX")) {
    return { name: "cfx", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 8)) };
  }
  if (asciiStartsWith(bytes, "GFX")) {
    return { name: "gfx", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 8)) };
  }
  if (asciiStartsWith(bytes, "CWS")) {
    return { name: "cws", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 8)) };
  }
  if (asciiStartsWith(bytes, "FWS")) {
    return { name: "fws", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 8)) };
  }
  if (asciiStartsWith(bytes, "ZWS")) {
    return { name: "zws", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 8)) };
  }
  if (asciiStartsWith(bytes, "BIK") || asciiStartsWith(bytes, "KB2")) {
    return { name: "bik", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 4)) };
  }
  if (asciiStartsWith(bytes, "FSB")) {
    return { name: "fsb", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 4)) };
  }
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00, 0x00]) || startsWith(bytes, [0x4f, 0x54, 0x54, 0x4f])) {
    return { name: bytes[0] === 0x4f ? "otf" : "ttf", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 4)) };
  }
  if (startsWith(bytes, [0x4d, 0x5a])) {
    return { name: "pe", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 2)) };
  }
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) {
    return { name: "elf", offset: 0, bytesHex: bytesToHex(bytes.slice(0, 4)) };
  }
  if (looksLikeTextHead(bytes)) {
    return { name: "text", offset: 0, bytesHex: bytesToHex(bytes.slice(0, Math.min(8, bytes.length))) };
  }
  return {
    name: "unknown",
    offset: 0,
    bytesHex: bytesToHex(bytes.slice(0, Math.min(8, bytes.length))),
  };
}

export function looksLikeTextHead(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return true;
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return true;
  }
  let printable = 0;
  const limit = Math.min(bytes.length, 256);
  for (let index = 0; index < limit; index += 1) {
    const value = bytes[index];
    if (value === undefined) {
      break;
    }
    if (value === 0) {
      return false;
    }
    if (value === 0x09 || value === 0x0a || value === 0x0d || (value >= 0x20 && value <= 0x7e)) {
      printable += 1;
    }
  }
  return printable / limit >= 0.85;
}

export function kindFromPathAndSignature(
  relativePath: string,
  signature: KnownSignatureName,
): ResourceKind {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".~h") || signature === "dfpf") {
    return "pack-header";
  }
  if (lower.endsWith(".~p")) {
    return "pack-payload";
  }
  if (signature === "cfx" || signature === "gfx" || signature === "cws" || signature === "fws" || signature === "zws") {
    return "scaleform";
  }
  if (signature === "ttf" || signature === "otf" || lower.endsWith(".ttf") || lower.endsWith(".otf")) {
    return "font";
  }
  if (signature === "bik" || lower.endsWith(".bik")) {
    return "video";
  }
  if (signature === "fsb" || lower.endsWith(".fsb") || lower.endsWith(".fev")) {
    return "audio";
  }
  if (signature === "pe" || signature === "elf" || lower.endsWith(".exe") || lower.endsWith(".dll")) {
    return "executable";
  }
  if (
    signature === "text" ||
    lower.endsWith(".txt") ||
    lower.endsWith(".cfg") ||
    lower.endsWith(".lua") ||
    lower.endsWith(".json") ||
    lower.endsWith(".xml") ||
    lower.endsWith(".ini")
  ) {
    return "text";
  }
  return "other";
}
