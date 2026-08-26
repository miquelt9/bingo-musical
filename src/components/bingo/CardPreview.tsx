import React, { useState } from "react";
import { BingoCard } from "../../types/deck";
import { Star, Check, RotateCcw } from "lucide-react";

interface CardPreviewProps {
  card: BingoCard;
  eventTitle: string;
  freeSpaceText?: string;
  interactiveMarks?: boolean;
}

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  eventTitle,
  freeSpaceText = "FREE SPACE",
  interactiveMarks = true,
}) => {
  const [markedIndices, setMarkedIndices] = useState<Set<number>>(new Set([12])); // Center free space is pre-marked

  const toggleMark = (idx: number) => {
    if (!interactiveMarks) return;
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
    setMarkedIndices(new Set([12]));
  };

  const letters = ["B", "I", "N", "G", "O"];

  return (
    <div className="bg-white text-zinc-900 rounded-2xl p-6 sm:p-8 shadow-2xl border border-zinc-200 max-w-xl mx-auto print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:w-full">
      {/* Header & Title */}
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
          <span>5x5 Musical Bingo</span>
        </div>
      </div>

      {/* B-I-N-G-O Row */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        {letters.map((letter) => (
          <div
            key={letter}
            className="bg-zinc-900 text-white font-extrabold text-lg sm:text-xl py-2 text-center rounded-lg shadow-sm print:bg-black print:text-white"
          >
            {letter}
          </div>
        ))}
      </div>

      {/* 5x5 Cells Grid */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {card.grid.map((cell, index) => {
          const isMarked = markedIndices.has(index);

          if (cell.isFreeSpace) {
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleMark(index)}
                className={`relative aspect-square flex flex-col items-center justify-center p-1.5 sm:p-2 text-center rounded-xl border-2 transition-all ${
                  isMarked
                    ? "bg-emerald-50 border-emerald-500 text-emerald-900"
                    : "bg-zinc-100 border-zinc-300 text-zinc-700"
                }`}
              >
                <Star className="w-5 h-5 fill-amber-400 text-amber-500 mb-0.5" />
                <span className="text-[10px] sm:text-xs font-bold leading-tight uppercase">
                  {freeSpaceText}
                </span>
                <span className="text-[8px] text-zinc-400 uppercase tracking-wider font-semibold">
                  Wildcard
                </span>
                {isMarked && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] shadow-sm">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          }

          const track = cell.track;

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
                  <p className="font-bold text-[10px] sm:text-[11px] leading-tight line-clamp-2 text-zinc-900">
                    {track.title}
                  </p>
                  <p className="font-medium text-[9px] sm:text-[10px] text-zinc-500 line-clamp-1 mt-0.5">
                    {track.artist}
                  </p>
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

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-[9px] text-zinc-400 font-medium">
        <span>Musical Bingo Creator</span>
        <span>Mark 5 in a row horizontally, vertically, or diagonally!</span>
      </div>
    </div>
  );
};
