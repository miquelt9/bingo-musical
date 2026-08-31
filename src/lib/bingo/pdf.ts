import { jsPDF } from "jspdf";
import { BingoCard, BingoCardOptions, Track } from "../../types/deck";
import { bingoColumnLetters, isBlankCell, normalizeGridSize } from "./generateCards";

export interface PdfExportOptions extends BingoCardOptions {
  themeColor?: string; // hex color for accents
  includeQrOrFooter?: boolean;
}

export async function generateBingoPdf(
  cards: BingoCard[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  // A4 dimensions in mm: 210 x 297
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const marginX = 15;
  const gridWidth = pageWidth - marginX * 2; // 180mm

  const eventTitle = options.customTitle?.trim() || options.deckName || "Musical Bingo";

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    if (cardIndex > 0) {
      doc.addPage("a4", "portrait");
    }

    const card = cards[cardIndex];
    const gridSize = normalizeGridSize(card.gridSize || options.gridSize || 5);
    const cellSize = gridWidth / gridSize;
    const headerLetters = bingoColumnLetters(gridSize);
    const scale = cellSize / 36;
    const titleFont = Math.max(6, 8.5 * scale);
    const artistFont = Math.max(5.5, 7.5 * scale);
    const headerRowHeight = Math.max(8, 12 * Math.min(1.2, scale));
    let cursorY = 18;

    // 1. Header Bar / Event Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(24, 24, 27); // zinc-900
    doc.text(eventTitle, pageWidth / 2, cursorY, { align: "center", maxWidth: 170 });
    cursorY += 8;

    // Subtitle & Card Number
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(113, 113, 122); // zinc-500
    doc.text(
      `Card #${card.cardNumber} • ${gridSize}×${gridSize} • Listen carefully & mark the matched songs`,
      pageWidth / 2,
      cursorY,
      { align: "center" }
    );
    cursorY += 8;

    // 2. Column headers
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

    // 3. Grid cells
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
            const titleLineH = titleFont * 0.45;
            const artistLineH = artistFont * 0.42;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(titleFont);
            const titleLines = doc.splitTextToSize(track.title, textWidth);
            const titleHeight = titleLines.length * titleLineH;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(artistFont);
            const artistLines = doc.splitTextToSize(track.artist, textWidth);
            const artistHeight = artistLines.length * artistLineH;

            const totalContentHeight = titleHeight + artistHeight + 2;
            let textStartY = cellY + (cellHeight - totalContentHeight) / 2 + titleLineH;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(titleFont);
            doc.setTextColor(24, 24, 27);
            doc.text(titleLines, cellX + cellSize / 2, textStartY, {
              align: "center",
              maxWidth: textWidth,
            });

            textStartY += titleHeight + 0.5;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(artistFont);
            doc.setTextColor(100, 116, 139);
            doc.text(artistLines, cellX + cellSize / 2, textStartY, {
              align: "center",
              maxWidth: textWidth,
            });
          }
        }
      }
    }

    // 4. Footer
    const footerY = cursorY + gridSize * cellHeight + 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(161, 161, 170);
    doc.text("Musical Bingo Creator", marginX, footerY);
    doc.text(`Card #${card.cardNumber} of ${cards.length} · Mark ${gridSize} in a row · empty squares = fewer songs than cells`, pageWidth - marginX, footerY, {
      align: "right",
    });

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
