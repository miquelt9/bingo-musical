
export type PdfThemePreset = "default" | "christmas" | "colorful";
export type PdfTileStyle = "square" | "rounded" | "circle" | "compactSquare";
export type PdfHeaderStyle = "plain" | "festive";
export type PdfBackgroundMode = "fullPage" | "cardWatermark";
export type PdfBackgroundFit = "cover" | "contain";
export type PdfFontFamily = "helvetica" | "times" | "courier";

export interface PdfBackgroundOptions {
  source: PdfImageSource;
  mode: PdfBackgroundMode;
  fit: PdfBackgroundFit;
  opacity: number;
  positionX?: number;
  positionY?: number;
}

export interface PdfAppearanceOptions {
  themePreset?: PdfThemePreset;
  accentColor?: string;
  headerStyle?: PdfHeaderStyle;
  tileStyle?: PdfTileStyle;
  tileGapMm?: number;
  tileOpacity?: number;
  titleFontFamily?: PdfFontFamily;
  cellFontFamily?: PdfFontFamily;
  titleSizePt?: number;
  background?: PdfBackgroundOptions;
}

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ResolvedPdfBackground {
  source: PdfImageSource;
  mode: PdfBackgroundMode;
  fit: PdfBackgroundFit;
  opacity: number;
  positionX: number;
  positionY: number;
}

export interface ResolvedPdfAppearance {
  themePreset: PdfThemePreset;
  accentColor: RGBColor;
  accentColorHex: string;
  headerStyle: PdfHeaderStyle;
  tileStyle: PdfTileStyle;
  tileGapMm: number;
  tileOpacity: number;
  titleFontFamily: PdfFontFamily;
  cellFontFamily: PdfFontFamily;
  titleSizePt: number;
  background?: ResolvedPdfBackground;
}

export type PdfImageSource = string | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export const DEFAULT_PDF_APPEARANCE: Required<
  Omit<PdfAppearanceOptions, "background" | "accentColor">
> = {
  themePreset: "default",
  headerStyle: "plain",
  tileStyle: "rounded",
  tileGapMm: 2,
  tileOpacity: 1,
  titleFontFamily: "helvetica",
  cellFontFamily: "helvetica",
  titleSizePt: 22,
};

const GOLDEN_ANGLE = 137.508;

export function clampPdfNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function hslToRgb(hue: number, saturation: number, lightness: number): RGBColor {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hueToRgb = (p: number, q: number, t: number): number => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
}

export function parsePdfColor(value: string | undefined): RGBColor | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) return null;
  const hex = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex(color: RGBColor): string {
  return `#${[color.r, color.g, color.b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getCardAccentColor(
  preset: PdfThemePreset,
  cardIndex: number,
  customAccent?: string
): RGBColor {
  const custom = parsePdfColor(customAccent);
  if (custom) return custom;

  if (preset === "christmas") {
    return cardIndex % 2 === 0 ? { r: 185, g: 28, b: 28 } : { r: 22, g: 101, b: 52 };
  }

  if (preset === "colorful") {
    return hslToRgb(215 + cardIndex * GOLDEN_ANGLE, 0.68, 0.42);
  }

  return { r: 37, g: 99, b: 235 };
}

function normalizeBackground(
  background: PdfBackgroundOptions | undefined
): ResolvedPdfBackground | undefined {
  if (!background?.source) return undefined;
  return {
    source: background.source,
    mode: background.mode,
    fit: background.fit,
    opacity: clampPdfNumber(background.opacity, 0, 1, 0.14),
    positionX: clampPdfNumber(background.positionX, 0, 1, 0.5),
    positionY: clampPdfNumber(background.positionY, 0, 1, 0.5),
  };
}

export function normalizePdfAppearance(
  appearance: PdfAppearanceOptions | undefined,
  cardIndex = 0,
  legacyThemeColor?: string
): ResolvedPdfAppearance {
  const source = appearance ?? {};
  const themePreset = source.themePreset ?? DEFAULT_PDF_APPEARANCE.themePreset;
  const accentColor = getCardAccentColor(
    themePreset,
    cardIndex,
    source.accentColor ?? legacyThemeColor
  );

  return {
    themePreset,
    accentColor,
    accentColorHex: rgbToHex(accentColor),
    headerStyle: source.headerStyle ?? (themePreset === "christmas" ? "festive" : "plain"),
    tileStyle: source.tileStyle ?? DEFAULT_PDF_APPEARANCE.tileStyle,
    tileGapMm: source.tileStyle === "compactSquare"
      ? 0
      : clampPdfNumber(source.tileGapMm, 0, 8, DEFAULT_PDF_APPEARANCE.tileGapMm),
    tileOpacity: clampPdfNumber(source.tileOpacity, 0, 1, DEFAULT_PDF_APPEARANCE.tileOpacity),
    titleFontFamily: source.titleFontFamily ?? DEFAULT_PDF_APPEARANCE.titleFontFamily,
    cellFontFamily: source.cellFontFamily ?? DEFAULT_PDF_APPEARANCE.cellFontFamily,
    titleSizePt: clampPdfNumber(source.titleSizePt, 12, 36, DEFAULT_PDF_APPEARANCE.titleSizePt),
    background: normalizeBackground(source.background),
  };
}

export function getPdfTextColor(background: RGBColor): RGBColor {
  const luminance = (0.299 * background.r + 0.587 * background.g + 0.114 * background.b) / 255;
  return luminance > 0.58 ? { r: 24, g: 24, b: 27 } : { r: 255, g: 255, b: 255 };
}

export function pdfColorToCss(color: RGBColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}