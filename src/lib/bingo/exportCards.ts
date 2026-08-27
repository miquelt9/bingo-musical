import { BingoCard, BingoCardOptions } from "../../types/deck";
import { isBlankCell, normalizeGridSize } from "./generateCards";
import { downloadJson, slugifyFilename } from "../storage/download";

export interface ReadableCardCell {
  blank?: true;
  title?: string;
  artist?: string;
}

export function cardsToReadableJson(cards: BingoCard[], options: BingoCardOptions) {
  return {
    format: "bingo-musical-cards",
    schemaVersion: 1,
    title: options.customTitle?.trim() || options.deckName,
    deck: options.deckName,
    gridSize: options.gridSize,
    bingoPercent: options.bingoPercent,
    cardCount: cards.length,
    exportedAt: new Date().toISOString(),
    cards: cards.map((card) => {
      const gridSize = normalizeGridSize(card.gridSize || options.gridSize);
      const rows: ReadableCardCell[][] = [];
      for (let row = 0; row < gridSize; row++) {
        const cells: ReadableCardCell[] = [];
        for (let col = 0; col < gridSize; col++) {
          const cell = card.grid[row * gridSize + col];
          if (!cell || isBlankCell(cell)) {
            cells.push({ blank: true });
          } else {
            cells.push({
              title: cell.track?.title ?? "",
              artist: cell.track?.artist ?? "",
            });
          }
        }
        rows.push(cells);
      }
      return {
        number: card.cardNumber,
        rows,
      };
    }),
  };
}

export function downloadBingoCardsJson(cards: BingoCard[], options: BingoCardOptions): void {
  const data = cardsToReadableJson(cards, options);
  const name = slugifyFilename(data.title, "musical-bingo");
  downloadJson(`${name}-cards-${cards.length}.json`, data);
}
