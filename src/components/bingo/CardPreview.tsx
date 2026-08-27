import React, { useEffect, useState } from "react";
import { BingoCard } from "../../types/deck";
import { bingoColumnLetters, isBlankCell, normalizeGridSize } from "../../lib/bingo/generateCards";
import { Check, RotateCcw } from "lucide-react";

interface CardPreviewProps {
  card: BingoCard;
  eventTitle: string;
  interactiveMarks?: boolean;
}

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  eventTitle,
  interactiveMarks = true,
}) => {
  const gridSize = normalizeGridSize(card.gridSize || Math.round(Math.sqrt(card.grid.length)) || 5);
  const letters = bingoColumnLetters(gridSize);

  const [markedIndices, setMarkedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    setMarkedIndices(new Set());
  }, [card.id]);

  const toggleMark = (idx: number) => {
    if (!interactiveMarks) return;
    if (isBlankCell(card.grid[idx])) return;
    setMarkedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const resetMarks = () => {
    setMarkedIndices(new Set());
  };

  const titleClass =
    gridSize >= 6
      ? "font-bold text-[8px] sm:text-[9px] leading-tight line-clamp-2 text-zinc-900"
      : "font-bold text-[10px] sm:text-[11px] leading-tight line-clamp-2 text-zinc-900";
  const artistClass =
    gridSize >= 6
      ? "font-medium text-[7px] sm:text-[8px] text-zinc-500 line-clamp-1 mt-0.5"
      : "font-medium text-[9px] sm:text-[10px] text-zinc-500 line-clamp-1 mt-0.5";

  return (
    <div className="bg-white text-zinc-900 p-6 sm:p-8 border border-zinc-200 max-w-xl mx-auto print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:w-full">
      <div className="text-center mb-5 print:mb-3">
        <h2 className="text-2xl font-black tracking-tight text-zinc-950 uppercase print:text-xl">
          {eventTitle}
        </h2>
        <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mt-1">
          <span>Card #{card.cardNumber}</span>
          {interactiveMarks && (
            <button
              onClick={resetMarks}
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-700 transition-colors print:hidden"
              title="Reset stamps"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
          <span>
            {gridSize}×{gridSize} Musical Bingo
          </span>
        </div>
      </div>

      <div
        className="gap-1.5 sm:gap-2 mb-1.5 sm:mb-2"
        style={{ display: "grid", gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
      >
        {letters.map((letter) => (
          <div
            key={letter}
            className="bg-[var(--pc-titlebar-bg)] text-[var(--pc-titlebar-text,#ffffff)] font-extrabold text-lg sm:text-xl py-2 text-center rounded-lg shadow-sm print:bg-black print:text-white"
          >
            {letter}
          </div>
        ))}
      </div>

      <div
        className="gap-1.5 sm:gap-2"
        style={{ display: "grid", gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
      >
        {card.grid.map((cell, index) => {
          if (isBlankCell(cell)) {
            return (
              <div
                key={index}
                className="bingo-blank-tile aspect-square rounded-xl"
                aria-hidden="true"
              />
            );
          }

          const track = cell.track;
          const isMarked = markedIndices.has(index);

          return (
            <button
              key={index}
              type="button"
              onClick={() => toggleMark(index)}
              className={`relative aspect-square flex flex-col items-center justify-center p-1 sm:p-2 text-center rounded-xl border transition-all select-none overflow-hidden ${
                isMarked
                  ? "bg-emerald-500/10 border-emerald-500 text-zinc-950 ring-2 ring-emerald-500/30"
                  : "bg-zinc-50/80 hover:bg-zinc-100/90 border-zinc-200 text-zinc-800"
              }`}
            >
              {track ? (
                <>
                  <p className={titleClass}>{track.title}</p>
                  <p className={artistClass}>{track.artist}</p>
                </>
              ) : (
                <span className="text-[10px] text-zinc-300">-</span>
              )}

              {isMarked && (
                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-sm animate-in zoom-in duration-150">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-[9px] text-zinc-400 font-medium">
        <span>Musical Bingo Creator</span>
        <span>
          Mark {gridSize} in a row. Dark tiles are blocked spaces.
        </span>
      </div>
    </div>
  );
};
