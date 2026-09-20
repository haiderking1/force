import { ArchiveError } from "./errors.ts";

export function safeEntryRelativePath(name: string): string {
  const normalized = name.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.length === 0) {
    throw new ArchiveError("TRAVERSAL", "Archive entry name is empty");
  }
  if (normalized.includes("\0")) {
    throw new ArchiveError("TRAVERSAL", "Archive entry name contains a NUL");
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new ArchiveError("TRAVERSAL", `Archive entry name is absolute: ${name}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new ArchiveError("TRAVERSAL", `Archive entry name escapes the extract directory: ${name}`);
  }
  return normalized;
}
