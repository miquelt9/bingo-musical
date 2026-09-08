/** Normalize title+artist for duplicate detection across uploads of the same song. */
export function songIdentityKey(artist: string, title: string): string {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
      .replace(/\b(official|audio|video|lyrics?|live|remix|remaster(?:ed)?|version|hd|4k)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  return `${norm(artist)}::${norm(title)}`;
}
