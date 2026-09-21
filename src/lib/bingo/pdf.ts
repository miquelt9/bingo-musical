import { jsPDF } from "jspdf";
import type { BingoCard, BingoCardOptions, Track } from "../../types/deck";
import {
  BingoCellContentSelection,
  BingoCellContentSizes,
  DEFAULT_CELL_CONTENT,
  getTrackAuthorNumber,
  normalizeCellContent,
  normalizeCellContentSizes,
  usesAuthorPool,
} from "./cellContent";
import { isBlankCell, normalizeGridSize } from "./generateCards";
import { generateQrDataUrl } from "./qr";
import { getTrackSongNumber } from "./songNumbers";
import {
  PdfAppearanceOptions,
  PdfFontFamily,
  ResolvedPdfAppearance,
  RGBColor,
  normalizePdfAppearance,
} from "./pdfAppearance";

export type {
  PdfAppearanceOptions,
  PdfBackgroundFit,
  PdfBackgroundMode,
  PdfBackgroundOptions,
  PdfFontFamily,
  PdfHeaderStyle,
  PdfImageSource,
  PdfThemePreset,
  PdfTileStyle,
} from "./pdfAppearance";

export interface PdfExportOptions extends BingoCardOptions {
  appearance?: PdfAppearanceOptions;
  /** Include a printable master list (number → song) before the cards. */
  includeMasterList?: boolean;
  tracks?: Track[];
  cellContent?: BingoCellContentSelection;
  cellContentSizes?: BingoCellContentSizes;
  shareUrl?: string;
  /** Verification code keyed by generated card id. */
  verificationCodes?: Record<string, string>;
  /**
   * When previewing a single card from a larger batch, pass its batch index so
   * colorful accents match the full export.
   */
  appearanceCardOffset?: number;
}

interface PreparedImage {
  source: string | HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  width: number;
  height: number;
  format?: "JPEG" | "PNG" | "WEBP";
}

interface FittedText {
  lines: string[];
  fontSize: number;
}

interface CardLayout {
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  gap: number;
  footerY: number;
  title: FittedText;
  titleLineHeight: number;
  headerBottom: number;
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 15;
const GRID_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TOP_MARGIN = 12;
const BOTTOM_MARGIN = 12;
const TITLE_MAX_WIDTH = 174;
const DEFAULT_TEXT = { r: 24, g: 24, b: 27 };
const MUTED_TEXT = { r: 82, g: 82, b: 91 };

function setPdfFont(doc: jsPDF, family: PdfFontFamily, style: "normal" | "bold"): void {
  doc.setFont(family, style);
}

function setPdfColor(doc: jsPDF, color: RGBColor): void {
  doc.setTextColor(color.r, color.g, color.b);
}

function mixColor(first: RGBColor, second: RGBColor, secondWeight: number): RGBColor {
  const weight = Math.min(1, Math.max(0, secondWeight));
  return {
    r: Math.round(first.r * (1 - weight) + second.r * weight),
    g: Math.round(first.g * (1 - weight) + second.g * weight),
    b: Math.round(first.b * (1 - weight) + second.b * weight),
  };
}

function getLineHeight(fontSizePt: number, multiplier = 1.12): number {
  return fontSizePt * 0.3528 * multiplier;
}

function splitExplicitLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const wrapped = doc.splitTextToSize(line.trim() || " ", maxWidth) as string[];
      return wrapped.length > 0 ? wrapped : [" "];
    });
}

function truncateToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  const suffix = "…";
  let candidate = text.trim();
  while (candidate.length > 1 && doc.getTextWidth(candidate + suffix) > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return candidate + suffix;
}

function fitText(
  doc: jsPDF,
  text: string,
  family: PdfFontFamily,
  style: "normal" | "bold",
  requestedSize: number,
  maxWidth: number,
  maxLines: number
): FittedText {
  // Keep the configured size fixed. Long text is wrapped to the allowed number
  // of lines and ellipsized instead of shrinking the user's selected size.
  const fontSize = Math.max(0.1, requestedSize);
  setPdfFont(doc, family, style);
  doc.setFontSize(fontSize);
  const lines = splitExplicitLines(doc, text, maxWidth);
  if (lines.length <= maxLines) return { lines, fontSize };

  const visibleLines = lines.slice(0, maxLines);
  visibleLines[maxLines - 1] = truncateToWidth(
    doc,
    visibleLines[maxLines - 1] ?? "",
    maxWidth
  );
  return { lines: visibleLines, fontSize };
}

function drawWrappedCentered(
  doc: jsPDF,
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number
): number {
  let y = startY;
  for (const line of lines) {
    doc.text(line, x, y, { align: "center" });
    y += lineHeight;
  }
  return y;
}

function withOpacity(doc: jsPDF, opacity: number, draw: () => void): void {
  doc.saveGraphicsState();
  try {
    doc.setGState(doc.GState({ opacity }));
    draw();
  } finally {
    doc.restoreGraphicsState();
  }
}

function drawShape(
  doc: jsPDF,
  style: PdfAppearanceOptions["tileStyle"] | "square",
  x: number,
  y: number,
  size: number,
  paint: "F" | "S" | "FD" | null
): void {
  switch (style) {
    case "circle":
      doc.circle(x + size / 2, y + size / 2, size / 2, paint);
      return;
    case "rounded":
      doc.roundedRect(x, y, size, size, Math.min(2.2, size * 0.08), Math.min(2.2, size * 0.08), paint);
      return;
    case "square":
    case "compactSquare":
    default:
      doc.rect(x, y, size, size, paint);
  }
}

function drawFestiveHeader(doc: jsPDF, appearance: ResolvedPdfAppearance): void {
  if (appearance.headerStyle !== "festive") return;

  const red = { r: 185, g: 28, b: 28 };
  const green = { r: 22, g: 101, b: 52 };
  const y = 9;
  doc.setLineWidth(0.7);
  doc.setDrawColor(green.r, green.g, green.b);
  doc.line(MARGIN_X + 5, y, PAGE_WIDTH - MARGIN_X - 5, y);

  doc.setFillColor(red.r, red.g, red.b);
  doc.circle(MARGIN_X + 2, y, 1.6, "F");
  doc.setFillColor(green.r, green.g, green.b);
  doc.circle(PAGE_WIDTH - MARGIN_X - 2, y, 1.6, "F");

  doc.setDrawColor(red.r, red.g, red.b);
  doc.line(MARGIN_X + 12, y - 2.5, MARGIN_X + 15, y + 2.5);
  doc.line(PAGE_WIDTH - MARGIN_X - 12, y - 2.5, PAGE_WIDTH - MARGIN_X - 15, y + 2.5);
}

function drawTitle(doc: jsPDF, title: FittedText, appearance: ResolvedPdfAppearance, y: number): number {
  setPdfFont(doc, appearance.titleFontFamily, "bold");
  doc.setFontSize(title.fontSize);
  const titleColor = appearance.themePreset === "default" ? DEFAULT_TEXT : appearance.accentColor;
  setPdfColor(doc, titleColor);
  const lineHeight = getLineHeight(title.fontSize, 1.08);
  drawWrappedCentered(doc, title.lines, PAGE_WIDTH / 2, y, lineHeight);
  return y + title.lines.length * lineHeight;
}

async function prepareImage(source: PreparedImage["source"] | string): Promise<PreparedImage> {
  if (typeof source === "string" && source.startsWith("data:image/") && typeof Image !== "undefined") {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The selected background image could not be loaded."));
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      format: image.src.startsWith("data:image/png") ? "PNG" : "JPEG",
    };
  }

  if (typeof source === "string") {
    return { source, width: PAGE_WIDTH, height: PAGE_HEIGHT, format: source.startsWith("data:image/png") ? "PNG" : "JPEG" };
  }

  const image = source as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  const width = "naturalWidth" in image ? image.naturalWidth || image.width : image.width;
  const height = "naturalHeight" in image ? image.naturalHeight || image.height : image.height;
  return { source: image, width, height };
}

function drawImageCover(
  doc: jsPDF,
  image: PreparedImage,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: "cover" | "contain",
  positionX: number,
  positionY: number,
  alias: string
): void {
  const sourceAspect = image.width > 0 && image.height > 0 ? image.width / image.height : width / height;
  const targetAspect = width / height;
  const scale = fit === "cover"
    ? sourceAspect > targetAspect ? height / image.height : width / image.width
    : sourceAspect > targetAspect ? width / image.width : height / image.height;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x + (width - drawWidth) * positionX;
  const offsetY = y + (height - drawHeight) * positionY;
  const pdfDoc = doc as unknown as { addImage: (...args: unknown[]) => void };
  if (typeof image.source === "string") {
    pdfDoc.addImage(image.source, image.format, offsetX, offsetY, drawWidth, drawHeight, alias, "FAST");
  } else {
    pdfDoc.addImage(image.source, offsetX, offsetY, drawWidth, drawHeight, alias, "FAST");
  }
}

function drawBackground(
  doc: jsPDF,
  appearance: ResolvedPdfAppearance,
  image: PreparedImage | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  clipStyle?: "square" | "rounded"
): void {
  if (!appearance.background || !image) return;
  const background = appearance.background;
  doc.saveGraphicsState();
  try {
    if (clipStyle === "rounded") {
      doc.roundedRect(x, y, width, height, 2.2, 2.2, null);
    } else {
      doc.rect(x, y, width, height, null);
    }
    doc.clip();
    withOpacity(doc, background.opacity, () => {
      drawImageCover(
        doc,
        image,
        x,
        y,
        width,
        height,
        background.fit,
        background.positionX,
        background.positionY,
        "bingo-background"
      );
    });
  } finally {
    doc.restoreGraphicsState();
  }
}

function calculateCardLayout(
  doc: jsPDF,
  eventTitle: string,
  gridSize: number,
  appearance: ResolvedPdfAppearance,
  sizes: BingoCellContentSizes,
  showSongs: boolean,
  showAuthors: boolean,
  showNumbers: boolean,
  hasQr: boolean,
  hasVerificationQr: boolean
): CardLayout {
  const title = fitText(
    doc,
    eventTitle,
    appearance.titleFontFamily,
    "bold",
    appearance.titleSizePt,
    hasVerificationQr ? 138 : TITLE_MAX_WIDTH,
    3
  );
  const titleLineHeight = getLineHeight(title.fontSize, 1.08);
  const headerTop = 17;
  const headerBottom = headerTop + title.lines.length * titleLineHeight + 4;
  const footerReserve = hasQr ? 34 : 18;
  const availableHeight = PAGE_HEIGHT - BOTTOM_MARGIN - footerReserve - headerBottom;
  const gap = appearance.tileStyle === "compactSquare" ? 0 : appearance.tileGapMm;
  const widthBased = (GRID_WIDTH - (gridSize - 1) * gap) / gridSize;
  const heightBased = (availableHeight - (gridSize - 1) * gap) / gridSize;
  const cellSize = Math.max(10, Math.min(widthBased, heightBased));
  const gridWidth = gridSize * cellSize + (gridSize - 1) * gap;
  const gridHeight = gridWidth;
  const gridX = (PAGE_WIDTH - gridWidth) / 2;
  const gridY = headerBottom + 3;

  void sizes;
  void showSongs;
  void showAuthors;
  void showNumbers;

  return {
    gridX,
    gridY,
    gridWidth,
    gridHeight,
    cellSize,
    gap,
    footerY: gridY + gridHeight + 8,
    title,
    titleLineHeight,
    headerBottom,
  };
}

function drawTile(
  doc: jsPDF,
  appearance: ResolvedPdfAppearance,
  x: number,
  y: number,
  size: number,
  blank: boolean
): void {
  const style = appearance.tileStyle ?? "rounded";
  const accent = appearance.accentColor;
  const fill = blank
    ? { r: 24, g: 24, b: 27 }
    : mixColor(accent, { r: 255, g: 255, b: 255 }, appearance.themePreset === "default" ? 0.93 : 0.9);
  doc.setFillColor(fill.r, fill.g, fill.b);
  withOpacity(doc, appearance.tileOpacity, () => {
    drawShape(doc, style, x, y, size, "F");
  });

  if (blank) {
    doc.saveGraphicsState();
    try {
      drawShape(doc, style, x, y, size, null);
      doc.clip();
      doc.setDrawColor(58, 58, 64);
      doc.setLineWidth(0.35);
      const step = Math.max(2.6, size / 9);
      for (let offset = -size; offset < size; offset += step) {
        doc.line(x + offset, y, x + offset + size, y + size);
      }
    } finally {
      doc.restoreGraphicsState();
    }
  }

  doc.setDrawColor(blank ? 9 : accent.r, blank ? 9 : accent.g, blank ? 11 : accent.b);
  doc.setLineWidth(style === "compactSquare" ? 0.28 : 0.45);
  drawShape(doc, style, x, y, size, "S");
}

function drawFestiveCellDecoration(doc: jsPDF, appearance: ResolvedPdfAppearance, layout: CardLayout): void {
  if (appearance.headerStyle !== "festive") return;
  doc.setDrawColor(185, 28, 28);
  doc.setLineWidth(0.35);
  doc.line(layout.gridX, layout.gridY - 1.5, layout.gridX + layout.gridWidth / 2 - 4, layout.gridY - 1.5);
  doc.setDrawColor(22, 101, 52);
  doc.line(layout.gridX + layout.gridWidth / 2 + 4, layout.gridY - 1.5, layout.gridX + layout.gridWidth, layout.gridY - 1.5);
}

async function drawShareFooter(
  doc: jsPDF,
  shareUrl: string | undefined,
  marginX: number,
  pageWidth: number,
  footerY: number,
  qrCache: Map<string, string>
): Promise<void> {
  if (!shareUrl) return;
  let qrDataUrl = qrCache.get(shareUrl);
  if (!qrDataUrl) {
    qrDataUrl = await generateQrDataUrl(shareUrl, 180);
    qrCache.set(shareUrl, qrDataUrl);
  }

  const qrSize = 18;
  const qrX = pageWidth - marginX - qrSize;
  const qrY = footerY - 4;
  setPdfFont(doc, "helvetica", "bold");
  doc.setFontSize(6.5);
  setPdfColor(doc, DEFAULT_TEXT);
  doc.text("OPEN THIS DECK ONLINE", qrX - 2, qrY - 1, { align: "right" });
  try {
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  } catch {
    // Continue without QR if image embedding fails.
  }
}

async function drawCardVerification(
  doc: jsPDF,
  code: string | undefined,
  qrCache: Map<string, string>
): Promise<void> {
  if (!code) return;
  let qrDataUrl = qrCache.get(`verify:${code}`);
  if (!qrDataUrl) {
    qrDataUrl = await generateQrDataUrl(code, 220);
    qrCache.set(`verify:${code}`, qrDataUrl);
  }

  const qrSize = 20;
  const qrX = PAGE_WIDTH - MARGIN_X - qrSize;
  const qrY = 12;
  try {
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    setPdfFont(doc, "helvetica", "bold");
    doc.setFontSize(6.5);
    setPdfColor(doc, DEFAULT_TEXT);
    doc.text("VERIFY CARD", qrX + qrSize / 2, qrY + qrSize + 3, { align: "center" });
    setPdfFont(doc, "courier", "normal");
    doc.setFontSize(4.3);
    setPdfColor(doc, MUTED_TEXT);
    const codeLines = doc.splitTextToSize(code, qrSize + 4) as string[];
    codeLines.slice(0, 3).forEach((line, index) => {
      doc.text(line, qrX + qrSize / 2, qrY + qrSize + 5.5 + index * 2.3, { align: "center" });
    });
  } catch {
    // Continue without QR if image embedding fails.
  }
}

function drawCardInstructions(doc: jsPDF): void {
  setPdfFont(doc, "helvetica", "normal");
  doc.setFontSize(6.5);
  setPdfColor(doc, MUTED_TEXT);
  doc.text("LINE: Complete every filled cell in one horizontal row.", MARGIN_X, PAGE_HEIGHT - 9);
  doc.text("BINGO: Complete every filled cell on the card. Only one line prize is awarded; after that, claim Bingo.", MARGIN_X, PAGE_HEIGHT - 5.5);
}

function drawMasterListPages(
  doc: jsPDF,
  tracks: Track[],
  eventTitle: string,
  shareUrl: string | undefined,
  qrCache: Map<string, string>,
  appearance: ResolvedPdfAppearance
): Promise<void> {
  const marginTop = 18;
  const rowHeight = 7;
  const headerHeight = 28;
  const footerReserve = shareUrl ? 28 : 14;
  const usableHeight = PAGE_HEIGHT - marginTop - headerHeight - footerReserve;
  const rowsPerPage = Math.max(1, Math.floor(usableHeight / rowHeight));
  const pages: Track[][] = [];
  for (let i = 0; i < tracks.length; i += rowsPerPage) pages.push(tracks.slice(i, i + rowsPerPage));
  if (pages.length === 0) pages.push([]);

  return (async () => {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      if (pageIndex > 0) doc.addPage("a4", "portrait");
      let cursorY = marginTop;
      const masterTitle = fitText(
        doc,
        eventTitle,
        appearance.titleFontFamily,
        "bold",
        appearance.titleSizePt,
        170,
        2
      );
      setPdfFont(doc, appearance.titleFontFamily, "bold");
      doc.setFontSize(masterTitle.fontSize);
      setPdfColor(doc, DEFAULT_TEXT);
      const masterTitleLineHeight = getLineHeight(masterTitle.fontSize, 1.08);
      drawWrappedCentered(doc, masterTitle.lines, PAGE_WIDTH / 2, cursorY, masterTitleLineHeight);
      cursorY += masterTitle.lines.length * masterTitleLineHeight + 2;
      setPdfFont(doc, appearance.cellFontFamily, "normal");
      doc.setFontSize(10);
      setPdfColor(doc, MUTED_TEXT);
      doc.text(
        `Master song list · numbers match deck order${pages.length > 1 ? ` · page ${pageIndex + 1}/${pages.length}` : ""}`,
        PAGE_WIDTH / 2,
        cursorY,
        { align: "center" }
      );
      cursorY += 10;
      doc.setDrawColor(24, 24, 27);
      doc.setLineWidth(0.6);
      doc.line(MARGIN_X, cursorY, PAGE_WIDTH - MARGIN_X, cursorY);
      cursorY += 5;
      setPdfFont(doc, appearance.cellFontFamily, "bold");
      doc.setFontSize(9);
      setPdfColor(doc, DEFAULT_TEXT);
      doc.text("#", MARGIN_X, cursorY);
      doc.text("Song", MARGIN_X + 14, cursorY);
      doc.text("Artist", MARGIN_X + 105, cursorY);
      cursorY += 3;
      doc.setLineWidth(0.3);
      doc.line(MARGIN_X, cursorY, PAGE_WIDTH - MARGIN_X, cursorY);
      cursorY += 5;

      for (const track of pages[pageIndex] ?? []) {
        const number = getTrackSongNumber(tracks, track.id);
        setPdfFont(doc, appearance.cellFontFamily, "bold");
        doc.setFontSize(11);
        setPdfColor(doc, DEFAULT_TEXT);
        doc.text(String(number), MARGIN_X, cursorY);
        setPdfFont(doc, appearance.cellFontFamily, "bold");
        doc.setFontSize(9);
        doc.text((doc.splitTextToSize(track.title, 85) as string[])[0] ?? "", MARGIN_X + 14, cursorY);
        setPdfFont(doc, appearance.cellFontFamily, "normal");
        doc.setFontSize(9);
        setPdfColor(doc, MUTED_TEXT);
        doc.text((doc.splitTextToSize(track.artist, 70) as string[])[0] ?? "", MARGIN_X + 105, cursorY);
        cursorY += rowHeight;
      }
      if (shareUrl) {
        await drawShareFooter(doc, shareUrl, MARGIN_X, PAGE_WIDTH, PAGE_HEIGHT - 24, qrCache);
      }
    }
  })();
}

export async function generateBingoPdf(
  cards: BingoCard[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const eventTitle = options.customTitle?.trim() || options.deckName || "Musical Bingo";
  const cellContent = normalizeCellContent(options.cellContent ?? DEFAULT_CELL_CONTENT);
  const sizes = normalizeCellContentSizes(options.cellContentSizes);
  const showNumbers = cellContent.numbers;
  const showSongs = cellContent.songs;
  const showAuthors = cellContent.authors;
  const authorPool = usesAuthorPool(cellContent);
  const numberOnly = showNumbers && !showSongs && !showAuthors;
  const tracks = options.tracks ?? [];
  const shareUrl = options.shareUrl?.trim() || undefined;
  const exportAppearance = normalizePdfAppearance(options.appearance);
  const qrCache = new Map<string, string>();
  const includeMasterList = Boolean(options.includeMasterList && tracks.length > 0);
  const preparedBackground = options.appearance?.background
    ? await prepareImage(options.appearance.background.source)
    : undefined;
  let cardsStarted = false;

  if (includeMasterList) {
    await drawMasterListPages(
      doc,
      tracks,
      eventTitle,
      undefined,
      qrCache,
      exportAppearance
    );
    cardsStarted = true;
  }

  const appearanceOffset = Math.max(0, options.appearanceCardOffset ?? 0);

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    if (cardsStarted || cardIndex > 0) doc.addPage("a4", "portrait");
    cardsStarted = true;

    const card = cards[cardIndex];
    const gridSize = normalizeGridSize(card.gridSize || options.gridSize || 5);
    const appearance = normalizePdfAppearance(options.appearance, appearanceOffset + cardIndex);
    const layout = calculateCardLayout(
      doc,
      eventTitle,
      gridSize,
      appearance,
      sizes,
      showSongs,
      showAuthors,
      showNumbers,
      Boolean(shareUrl),
      Boolean(options.verificationCodes?.[card.id])
    );

    if (appearance.background?.mode === "fullPage") {
      drawBackground(doc, appearance, preparedBackground, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    }

    drawFestiveHeader(doc, appearance);
    drawTitle(doc, layout.title, appearance, TOP_MARGIN + 8);
    await drawCardVerification(doc, options.verificationCodes?.[card.id], qrCache);

    if (appearance.background?.mode === "cardWatermark") {
      drawBackground(
        doc,
        appearance,
        preparedBackground,
        layout.gridX,
        layout.gridY,
        layout.gridWidth,
        layout.gridHeight,
        appearance.tileStyle === "rounded" ? "rounded" : "square"
      );
    }

    drawFestiveCellDecoration(doc, appearance, layout);

    // Cover the watermark in tile gaps according to the tile opacity. At 100%,
    // the complete grid surface is opaque, not just the individual tiles.
    const gridBackdrop = appearance.themePreset === "default"
      ? { r: 244, g: 244, b: 245 }
      : mixColor(appearance.accentColor, { r: 255, g: 255, b: 255 }, 0.88);
    doc.setFillColor(gridBackdrop.r, gridBackdrop.g, gridBackdrop.b);
    withOpacity(doc, appearance.tileOpacity, () => {
      drawShape(doc, appearance.tileStyle, layout.gridX, layout.gridY, layout.gridWidth, "F");
    });

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const cellIdx = row * gridSize + col;
        const cell = card.grid[cellIdx];
        const cellX = layout.gridX + col * (layout.cellSize + layout.gap);
        const cellY = layout.gridY + row * (layout.cellSize + layout.gap);
        const blank = !cell || isBlankCell(cell);
        drawTile(doc, appearance, cellX, cellY, layout.cellSize, blank);
        if (blank || !cell.track) continue;

        const track = cell.track;
        const cellNumber = authorPool
          ? getTrackAuthorNumber(tracks, track.id)
          : getTrackSongNumber(tracks, track.id);
        const padding = appearance.tileStyle === "circle" ? layout.cellSize * 0.18 : 2.5;
        const textWidth = Math.max(8, layout.cellSize - padding * 2);
        const titleFont = Math.max(6, 8.5 * layout.cellSize / 36) * sizes.songs / 100;
        const artistFont = Math.max(5.5, 7.5 * layout.cellSize / 36) * sizes.authors / 100;
        const authorOnlyFont = Math.max(7, 10 * layout.cellSize / 36) * sizes.authors / 100;
        const numberFont = (numberOnly ? Math.max(18, 28 * layout.cellSize / 36) : Math.max(10, 16 * layout.cellSize / 36)) * sizes.numbers / 100;
        const title = showSongs
          ? fitText(
              doc,
              track.title,
              appearance.cellFontFamily,
              "bold",
              titleFont,
              textWidth,
              appearance.tileStyle === "circle" ? 2 : 3
            )
          : { lines: [], fontSize: titleFont };
        const artist = showAuthors
          ? fitText(
              doc,
              track.artist,
              appearance.cellFontFamily,
              showSongs ? "normal" : "bold",
              showSongs ? artistFont : authorOnlyFont,
              textWidth,
              appearance.tileStyle === "circle" ? 2 : 3
            )
          : { lines: [], fontSize: artistFont };
        const numberLineHeight = getLineHeight(numberFont, 1);
        const titleLineHeight = getLineHeight(title.fontSize, 1.03);
        const artistLineHeight = getLineHeight(artist.fontSize, 1.02);
        const numberGap = Math.max(0.8, Math.min(2.5, ((sizes.numbers + (showSongs ? sizes.songs : sizes.authors)) / 100) * 1.2));
        const songAuthorGap = Math.max(0.5, Math.min(2, ((sizes.songs + sizes.authors) / 100) * 0.5));
        let contentHeight = 0;
        if (showNumbers && cellNumber != null) contentHeight += numberLineHeight;
        if (showSongs) contentHeight += title.lines.length * titleLineHeight;
        if (showAuthors) contentHeight += artist.lines.length * artistLineHeight;
        if ((showSongs || showAuthors) && showNumbers) contentHeight += numberGap;
        if (showSongs && showAuthors) contentHeight += songAuthorGap;
        let textY = cellY + (layout.cellSize - contentHeight) / 2;

        if (showNumbers && cellNumber != null) {
          textY += numberLineHeight * 0.82;
          setPdfFont(doc, appearance.cellFontFamily, "bold");
          doc.setFontSize(numberFont);
          setPdfColor(doc, DEFAULT_TEXT);
          doc.text(String(cellNumber), cellX + layout.cellSize / 2, textY, { align: "center" });
          textY += numberLineHeight * 0.25 + ((showSongs || showAuthors) ? numberGap : 0);
        }
        if (showSongs) {
          textY += titleLineHeight;
          setPdfFont(doc, appearance.cellFontFamily, "bold");
          doc.setFontSize(title.fontSize);
          setPdfColor(doc, DEFAULT_TEXT);
          textY = drawWrappedCentered(doc, title.lines, cellX + layout.cellSize / 2, textY, titleLineHeight);
        }
        if (showAuthors) {
          if (showSongs) textY += songAuthorGap;
          else textY += artistLineHeight;
          setPdfFont(doc, appearance.cellFontFamily, showSongs ? "normal" : "bold");
          doc.setFontSize(artist.fontSize);
          setPdfColor(doc, showSongs ? { r: 100, g: 116, b: 139 } : DEFAULT_TEXT);
          drawWrappedCentered(doc, artist.lines, cellX + layout.cellSize / 2, textY, artistLineHeight);
        }
      }
    }

    if (shareUrl) {
      await drawShareFooter(doc, shareUrl, MARGIN_X, PAGE_WIDTH, PAGE_HEIGHT - 27, qrCache);
    }
    drawCardInstructions(doc);
    onProgress?.(cardIndex + 1, cards.length);
  }

  return doc.output("blob");
}

function pdfDownloadBasename(options: PdfExportOptions, cardCount: number): string {
  const cleanTitle = (options.customTitle || options.deckName || "musical-bingo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${cleanTitle || "musical-bingo"}-cards-${cardCount}`;
}

export async function downloadBingoPdf(
  cards: BingoCard[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const blob = await generateBingoPdf(cards, options, onProgress);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${pdfDownloadBasename(options, cards.length)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open a PDF in a hidden iframe and invoke the browser print dialog.
 * Used so Print and Download share the same layout.
 */
export async function printBingoPdf(
  cards: BingoCard[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const blob = await generateBingoPdf(cards, options, onProgress);
  const url = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Print bingo cards");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 1500);
      resolve();
    };

    iframe.onload = () => {
      try {
        const frameWindow = iframe.contentWindow;
        if (!frameWindow) {
          reject(new Error("Could not open the print preview."));
          finish();
          return;
        }
        const cleanup = () => {
          frameWindow.removeEventListener("afterprint", cleanup);
          finish();
        };
        frameWindow.addEventListener("afterprint", cleanup);
        frameWindow.focus();
        frameWindow.print();
        // Some browsers never fire afterprint for PDF frames.
        window.setTimeout(cleanup, 60_000);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Print failed."));
        finish();
      }
    };

    iframe.onerror = () => {
      reject(new Error("Could not load the printable PDF."));
      finish();
    };

    document.body.appendChild(iframe);
    iframe.src = url;
  });
}