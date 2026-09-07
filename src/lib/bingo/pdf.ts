import { jsPDF } from "jspdf";
import { BingoCard, BingoCardOptions, Track } from "../../types/deck";
import { BingoCellContentMode } from "./cellContent";
import { bingoColumnLetters, isBlankCell, normalizeGridSize } from "./generateCards";
import { generateQrDataUrl } from "./qr";
import { getTrackSongNumber } from "./songNumbers";

export interface PdfExportOptions extends BingoCardOptions {
  themeColor?: string;
  includeQrOrFooter?: boolean;
  /** Include a printable master list (number → song) before the cards. */
  includeMasterList?: boolean;
  tracks?: Track[];
  cellContent?: BingoCellContentMode;
  shareUrl?: string;
}

function drawWrappedCentered(
  doc: jsPDF,
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number
) {
  let y = startY;
  for (const line of lines) {
    doc.text(line, x, y, { align: "center" });
    y += lineHeight;
  }
  return y;
}

async function drawShareFooter(
  doc: jsPDF,
  shareUrl: string | undefined,
  marginX: number,
  pageWidth: number,
  footerY: number,
  qrCache: Map<string, string>
) {
  if (!shareUrl) return;

  let qrDataUrl = qrCache.get(shareUrl);
  if (!qrDataUrl) {
    qrDataUrl = await generateQrDataUrl(shareUrl, 180);
    qrCache.set(shareUrl, qrDataUrl);
  }

  const qrSize = 18;
  const qrX = pageWidth - marginX - qrSize;
  const qrY = footerY - 4;

  try {
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  } catch {
    // Continue without QR if image embed fails.
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(82, 82, 91);
  const linkLines = doc.splitTextToSize(`Scan or open: ${shareUrl}`, pageWidth - marginX * 2 - qrSize - 6);
  doc.text(linkLines, marginX, footerY + 2);
}

function drawMasterListPages(
  doc: jsPDF,
  tracks: Track[],
  eventTitle: string,
  shareUrl: string | undefined,
  qrCache: Map<string, string>
): Promise<void> {
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 15;
  const marginTop = 18;
  const rowHeight = 7;
  const headerHeight = 28;
  const footerReserve = shareUrl ? 28 : 14;
  const usableHeight = pageHeight - marginTop - headerHeight - footerReserve;
  const rowsPerPage = Math.max(1, Math.floor(usableHeight / rowHeight));

  const pages: Track[][] = [];
  for (let i = 0; i < tracks.length; i += rowsPerPage) {
    pages.push(tracks.slice(i, i + rowsPerPage));
  }
  if (pages.length === 0) pages.push([]);

  return (async () => {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      if (pageIndex > 0) {
        doc.addPage("a4", "portrait");
      }

      let cursorY = marginTop;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(24, 24, 27);
      doc.text(eventTitle, pageWidth / 2, cursorY, { align: "center", maxWidth: 170 });
      cursorY += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(113, 113, 122);
      doc.text(
        `Master song list · numbers match deck order${pages.length > 1 ? ` · page ${pageIndex + 1}/${pages.length}` : ""}`,
        pageWidth / 2,
        cursorY,
        { align: "center" }
      );
      cursorY += 10;

      doc.setDrawColor(24, 24, 27);
      doc.setLineWidth(0.6);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      cursorY += 5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(24, 24, 27);
      doc.text("#", marginX, cursorY);
      doc.text("Song", marginX + 14, cursorY);
      doc.text("Artist", marginX + 105, cursorY);
      cursorY += 3;
      doc.setLineWidth(0.3);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      cursorY += 5;

      const pageTracks = pages[pageIndex];
      const startNumber = pageIndex * rowsPerPage + 1;

      for (let i = 0; i < pageTracks.length; i++) {
        const track = pageTracks[i];
        const number = startNumber + i;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(24, 24, 27);
        doc.text(String(number), marginX, cursorY);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const title = doc.splitTextToSize(track.title, 85)[0] ?? "";
        doc.text(title, marginX + 14, cursorY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(82, 82, 91);
        const artist = doc.splitTextToSize(track.artist, 70)[0] ?? "";
        doc.text(artist, marginX + 105, cursorY);

        cursorY += rowHeight;
      }

      if (shareUrl && pageIndex === pages.length - 1) {
        await drawShareFooter(doc, shareUrl, marginX, pageWidth, pageHeight - 24, qrCache);
      }
    }
  })();
}

export async function generateBingoPdf(
  cards: BingoCard[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const marginX = 15;
  const gridWidth = pageWidth - marginX * 2;
  const eventTitle = options.customTitle?.trim() || options.deckName || "Musical Bingo";
  const cellContent: BingoCellContentMode = options.cellContent ?? "songs";
  const showNumbers = cellContent === "numbers" || cellContent === "both";
  const showSongs = cellContent === "songs" || cellContent === "both";
  const tracks = options.tracks ?? [];
  const shareUrl = options.shareUrl?.trim() || undefined;
  const qrCache = new Map<string, string>();
  const includeMasterList = Boolean(options.includeMasterList && tracks.length > 0);

  let cardsStarted = false;

  if (includeMasterList) {
    await drawMasterListPages(doc, tracks, eventTitle, shareUrl, qrCache);
    cardsStarted = true;
  }

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    if (cardsStarted || cardIndex > 0) {
      doc.addPage("a4", "portrait");
    }
    cardsStarted = true;

    const card = cards[cardIndex];
    const gridSize = normalizeGridSize(card.gridSize || options.gridSize || 5);
    const cellSize = gridWidth / gridSize;
    const headerLetters = bingoColumnLetters(gridSize);
    const scale = cellSize / 36;
    const titleFont = Math.max(6, 8.5 * scale);
    const artistFont = Math.max(5.5, 7.5 * scale);
    const numberFont =
      cellContent === "numbers"
        ? Math.max(18, 28 * scale)
        : Math.max(10, 16 * scale);
    const headerRowHeight = Math.max(8, 12 * Math.min(1.2, scale));
    let cursorY = 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(24, 24, 27);
    doc.text(eventTitle, pageWidth / 2, cursorY, { align: "center", maxWidth: 170 });
    cursorY += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(113, 113, 122);
    doc.text(
      `Card #${card.cardNumber} • ${gridSize}×${gridSize} • Listen carefully & mark the matched songs`,
      pageWidth / 2,
      cursorY,
      { align: "center" }
    );
    cursorY += 8;

    for (let c = 0; c < gridSize; c++) {
      const cellX = marginX + c * cellSize;

      doc.setFillColor(24, 24, 27);
      doc.roundedRect(cellX, cursorY, cellSize, headerRowHeight, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(Math.max(11, 18 * Math.min(1, scale)));
      doc.setTextColor(255, 255, 255);
      doc.text(headerLetters[c], cellX + cellSize / 2, cursorY + headerRowHeight * 0.72, {
        align: "center",
      });
    }
    cursorY += headerRowHeight + 2;

    const cellHeight = cellSize;
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const cellIdx = row * gridSize + col;
        const cell = card.grid[cellIdx];
        const cellX = marginX + col * cellSize;
        const cellY = cursorY + row * cellHeight;

        if (!cell || isBlankCell(cell)) {
          doc.setFillColor(24, 24, 27);
          doc.setDrawColor(9, 9, 11);
          doc.setLineWidth(0.5);
          doc.roundedRect(cellX, cellY, cellSize, cellHeight, 1.2, 1.2, "FD");
          try {
            doc.saveGraphicsState();
            doc.roundedRect(cellX, cellY, cellSize, cellHeight, 1.2, 1.2, null);
            doc.clip();
            doc.setDrawColor(58, 58, 64);
            doc.setLineWidth(0.4);
            const step = Math.max(2.6, cellSize / 9);
            for (let offset = -cellHeight; offset < cellSize; offset += step) {
              doc.line(cellX + offset, cellY, cellX + offset + cellHeight, cellY + cellHeight);
            }
            doc.restoreGraphicsState();
          } catch {
            // Solid black tile is still readable if clip is unavailable.
          }
          doc.setDrawColor(9, 9, 11);
          doc.setLineWidth(0.5);
          doc.roundedRect(cellX, cellY, cellSize, cellHeight, 1.2, 1.2, "S");
        } else {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(228, 228, 231);
          doc.setLineWidth(0.4);
          doc.roundedRect(cellX, cellY, cellSize, cellHeight, 1.5, 1.5, "FD");

          const track = cell?.track as Track | null;
          if (track) {
            const padding = 2.5;
            const textWidth = cellSize - padding * 2;
            const songNumber = getTrackSongNumber(tracks, track.id);
            const titleLineH = titleFont * 0.45;
            const artistLineH = artistFont * 0.42;
            const numberLineH = numberFont * 0.4;

            let totalContentHeight = 0;
            if (showNumbers && songNumber != null) totalContentHeight += numberLineH;
            if (showSongs) {
              doc.setFont("helvetica", "bold");
              doc.setFontSize(titleFont);
              const titleLines = doc.splitTextToSize(track.title, textWidth);
              doc.setFont("helvetica", "normal");
              doc.setFontSize(artistFont);
              const artistLines = doc.splitTextToSize(track.artist, textWidth);
              totalContentHeight += titleLines.length * titleLineH + artistLines.length * artistLineH + (showNumbers ? 1.5 : 2);
            }

            let textStartY = cellY + (cellHeight - totalContentHeight) / 2;

            if (showNumbers && songNumber != null) {
              textStartY += numberLineH * 0.85;
              doc.setFont("helvetica", "bold");
              doc.setFontSize(numberFont);
              doc.setTextColor(24, 24, 27);
              doc.text(String(songNumber), cellX + cellSize / 2, textStartY, { align: "center" });
              textStartY += numberLineH * 0.35 + (showSongs ? 1.2 : 0);
            }

            if (showSongs) {
              doc.setFont("helvetica", "bold");
              doc.setFontSize(titleFont);
              const titleLines = doc.splitTextToSize(track.title, textWidth);
              doc.setFont("helvetica", "normal");
              doc.setFontSize(artistFont);
              const artistLines = doc.splitTextToSize(track.artist, textWidth);

              textStartY += titleLineH;
              doc.setFont("helvetica", "bold");
              doc.setFontSize(titleFont);
              doc.setTextColor(24, 24, 27);
              textStartY = drawWrappedCentered(
                doc,
                titleLines,
                cellX + cellSize / 2,
                textStartY,
                titleLineH
              );

              textStartY += 0.5;
              doc.setFont("helvetica", "normal");
              doc.setFontSize(artistFont);
              doc.setTextColor(100, 116, 139);
              drawWrappedCentered(
                doc,
                artistLines,
                cellX + cellSize / 2,
                textStartY,
                artistLineH
              );
            }
          }
        }
      }
    }

    const footerY = cursorY + gridSize * cellHeight + 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(161, 161, 170);
    doc.text("Musical Bingo Creator", marginX, footerY);
    doc.text(
      `Card #${card.cardNumber} of ${cards.length} · Mark ${gridSize} in a row`,
      pageWidth - marginX,
      footerY,
      { align: "right" }
    );

    if (shareUrl) {
      await drawShareFooter(doc, shareUrl, marginX, pageWidth, footerY + 8, qrCache);
    }

    if (onProgress) {
      onProgress(cardIndex + 1, cards.length);
    }
  }

  return doc.output("blob");
}

export async function downloadBingoPdf(
  cards: BingoCard[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const blob = await generateBingoPdf(cards, options, onProgress);
  const url = URL.createObjectURL(blob);
  const cleanTitle = (options.customTitle || options.deckName || "musical-bingo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const a = document.createElement("a");
  a.href = url;
  a.download = `${cleanTitle}-cards-${cards.length}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
