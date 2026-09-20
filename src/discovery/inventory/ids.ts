export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function resourceIdFromRelativePath(relativePath: string): string {
  return normalizeRelativePath(relativePath);
}

export function lowercasePath(relativePath: string): string {
  return normalizeRelativePath(relativePath).toLowerCase();
}
