export type BingoCellContentMode = "numbers" | "songs" | "both";

export const CELL_CONTENT_MODES: readonly BingoCellContentMode[] = [
  "numbers",
  "songs",
  "both",
] as const;

export function isBingoCellContentMode(value: unknown): value is BingoCellContentMode {
  return value === "numbers" || value === "songs" || value === "both";
}

export function cellContentLabel(mode: BingoCellContentMode): string {
  switch (mode) {
    case "numbers":
      return "Numbers only";
    case "songs":
      return "Songs only";
    case "both":
      return "Numbers + songs";
  }
}
