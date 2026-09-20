export function payloadPathFromHeader(headerPath: string): string {
  if (headerPath.toLowerCase().endsWith(".~h")) {
    return `${headerPath.slice(0, -3)}.~p`;
  }
  return `${headerPath}.~p`;
}

export function packStemFromHeader(headerPath: string): string {
  const slash = Math.max(headerPath.lastIndexOf("/"), headerPath.lastIndexOf("\\"));
  const name = slash === -1 ? headerPath : headerPath.slice(slash + 1);
  return name.toLowerCase().endsWith(".~h") ? name.slice(0, -3) : name;
}
