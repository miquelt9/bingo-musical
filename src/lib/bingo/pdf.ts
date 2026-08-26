import { jsPDF } from "jspdf";
import { BingoCard, BingoCardOptions, Track } from "../../types/deck";

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
  const cellSize = gridWidth / 5; // 36mm
  const headerLetters = ["B", "I", "N", "G", "O"];

  const eventTitle = options.customTitle?.trim() || options.deckName || "Musical Bingo";
  const freeSpaceText = options.freeSpaceText?.trim() || "FREE SPACE";

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    if (cardIndex > 0) {
      doc.addPage("a4", "portrait");
    }

    const card = cards[cardIndex];
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
    doc.text(`Card #${card.cardNumber} • Listen carefully & mark the matched songs`, pageWidth / 2, cursorY, {
      align: "center",
    });
    cursorY += 8;

    // 2. B - I - N - G - O Column Headers
    const headerRowHeight = 12;
    for (let c = 0; c < 5; c++) {
      const cellX = marginX + c * cellSize;
      
      // Header cell background
      doc.setFillColor(24, 24, 27); // Dark background
      doc.roundedRect(cellX, cursorY, cellSize, headerRowHeight, 1.5, 1.5, "F");

      // Letter text
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);
      doc.text(headerLetters[c], cellX + cellSize / 2, cursorY + 8.5, { align: "center" });
    }
    cursorY += headerRowHeight + 2;

    // 3. 5x5 Grid Cells
    const cellHeight = 36;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const cellIdx = row * 5 + col;
        const cell = card.grid[cellIdx];
        const cellX = marginX + col * cellSize;
        const cellY = cursorY + row * cellHeight;

        if (cell.isFreeSpace) {
          // Free space background highlight
          doc.setFillColor(244, 244, 245); // zinc-100
          doc.setDrawColor(34, 197, 94); // emerald-500 border
          doc.setLineWidth(0.8);
          doc.roundedRect(cellX, cellY, cellSize, cellHeight, 1.5, 1.5, "FD");

          // Star or decorative text
          doc.setFont("helvetica", "bold");
          doc.setFontSize(14);
          doc.setTextColor(21, 128, 61); // emerald-700
          doc.text("★", cellX + cellSize / 2, cellY + 14, { align: "center" });

          doc.setFontSize(10);
          doc.text(freeSpaceText, cellX + cellSize / 2, cellY + 22, {
            align: "center",
            maxWidth: cellSize - 4,
          });

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(113, 113, 122);
          doc.text("Wildcard", cellX + cellSize / 2, cellY + 28, { align: "center" });
        } else {
          // Regular cell box
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(228, 228, 231); // zinc-200
          doc.setLineWidth(0.4);
          doc.roundedRect(cellX, cellY, cellSize, cellHeight, 1.5, 1.5, "FD");

          const track = cell.track as Track | null;
          if (track) {
            const padding = 2.5;
            const textWidth = cellSize - padding * 2;

            // Song Title (Bold)
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.setTextColor(24, 24, 27);
            const titleLines = doc.splitTextToSize(track.title, textWidth);
            const titleHeight = titleLines.length * 3.8;

            // Artist Name (Normal)
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(82, 82, 91); // zinc-600
            const artistLines = doc.splitTextToSize(track.artist, textWidth);
            const artistHeight = artistLines.length * 3.2;

            // Vertically center both in the cell
            const totalContentHeight = titleHeight + artistHeight + 2;
            let textStartY = cellY + (cellHeight - totalContentHeight) / 2 + 3.5;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.setTextColor(24, 24, 27);
            doc.text(titleLines, cellX + cellSize / 2, textStartY, {
              align: "center",
              maxWidth: textWidth,
            });

            textStartY += titleHeight + 0.5;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
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
    const footerY = cursorY + 5 * cellHeight + 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(161, 161, 170); // zinc-400
    doc.text("Musical Bingo Creator", marginX, footerY);
    doc.text(`Card #${card.cardNumber} of ${cards.length}`, pageWidth - marginX, footerY, { align: "right" });

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
