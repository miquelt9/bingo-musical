import React, { useEffect, useMemo, useState } from "react";
import { BingoCard, Track } from "../../types/deck";
import {
  BingoCellContentSelection,
  BingoCellContentSizes,
  DEFAULT_CELL_CONTENT,
  DEFAULT_CELL_CONTENT_SIZES,
  normalizeCellContentSizes,
  getTrackAuthorNumber,
  normalizeCellContent,
  usesAuthorPool,
} from "../../lib/bingo/cellContent";
import { isBlankCell, normalizeGridSize } from "../../lib/bingo/generateCards";
import { getTrackSongNumber } from "../../lib/bingo/songNumbers";
import {
  PdfAppearanceOptions,
  PdfFontFamily,
  ResolvedPdfAppearance,
  normalizePdfAppearance,
  pdfColorToCss,
} from "../../lib/bingo/pdfAppearance";
import { Check, RotateCcw } from "lucide-react";

interface CardPreviewProps {
  card: BingoCard;
  eventTitle: string;
  /** Full deck track list in order — used to resolve song / author numbers. */
  tracks: Track[];
  cellContent?: BingoCellContentSelection;
  cellContentSizes?: BingoCellContentSizes;
  qrDataUrl?: string | null;
  interactiveMarks?: boolean;
  appearance?: PdfAppearanceOptions;
  cardIndex?: number;
}

function cssFontFamily(font: PdfFontFamily): string {
  switch (font) {
    case "times":
      return "Georgia, 'Times New Roman', serif";
    case "courier":
      return "'Courier New', Courier, monospace";
    case "helvetica":
    default:
      return "Arial, Helvetica, sans-serif";
  }
}

function rgba(color: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function tileShapeClass(appearance: ResolvedPdfAppearance): string {
  switch (appearance.tileStyle) {
    case "circle":
      return "rounded-full";
    case "square":
    case "compactSquare":
      return "rounded-none";
    case "rounded":
    default:
      return "rounded-xl";
  }
}

function backgroundUrl(source: unknown): string | null {
  return typeof source === "string" ? source : null;
}

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  eventTitle,
  tracks,
  cellContent = DEFAULT_CELL_CONTENT,
  cellContentSizes = DEFAULT_CELL_CONTENT_SIZES,
  qrDataUrl = null,
  interactiveMarks = true,
  appearance,
  cardIndex = 0,
}) => {
  const gridSize = normalizeGridSize(card.gridSize || Math.round(Math.sqrt(card.grid.length)) || 5);
  const selection = normalizeCellContent(cellContent);
  const showNumbers = selection.numbers;
  const showSongs = selection.songs;
  const showAuthors = selection.authors;
  const authorPool = usesAuthorPool(selection);
  const sizes = normalizeCellContentSizes(cellContentSizes);
  const resolved = useMemo(
    () => normalizePdfAppearance(appearance, cardIndex),
    [appearance, cardIndex]
  );
  const numberSize = gridSize >= 6 ? 2.5 : gridSize >= 5 ? 2 : 2.25;
  const songSize = gridSize >= 5 ? 0.6875 : 0.75;
  const authorSize = gridSize >= 5 ? 0.625 : 0.6875;
  const authorOnlySize = gridSize >= 5 ? 0.75 : 0.8125;
  const enabledSizes = [
    showNumbers ? sizes.numbers : null,
    showSongs ? sizes.songs : null,
    showAuthors ? sizes.authors : null,
  ].filter((size): size is number => size !== null);
  const contentGap = enabledSizes.length > 1
    ? `${Math.max(1, Math.min(4, enabledSizes.reduce((sum, size) => sum + size, 0) / enabledSizes.length / 25))}px`
    : undefined;
  const [markedIndices, setMarkedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    setMarkedIndices(new Set());
  }, [card.id]);

  const toggleMark = (idx: number) => {
    if (!interactiveMarks || isBlankCell(card.grid[idx])) return;
    setMarkedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const resetMarks = () => setMarkedIndices(new Set());
  const numberOnly = showNumbers && !showSongs && !showAuthors;
  const numberClass = numberOnly
    ? gridSize >= 6
      ? "font-black text-2xl sm:text-3xl leading-none tabular-nums"
      : "font-black text-3xl sm:text-4xl leading-none tabular-nums"
    : gridSize >= 5
      ? "font-black text-lg sm:text-2xl leading-none tabular-nums"
      : "font-black text-xl sm:text-2xl leading-none tabular-nums";
  const titleClass = gridSize >= 5
    ? "font-bold text-[9px] sm:text-[11px] leading-tight line-clamp-3 text-zinc-900"
    : "font-bold text-[10px] sm:text-[11px] leading-tight line-clamp-3 text-zinc-900";
  const artistClass = gridSize >= 5
    ? "font-medium text-[8px] sm:text-[10px] line-clamp-2"
    : "font-medium text-[9px] sm:text-[10px] line-clamp-2";
  const authorOnlyClass = gridSize >= 5
    ? "font-bold text-[10px] sm:text-[12px] leading-tight line-clamp-3"
    : "font-bold text-[11px] sm:text-[12px] leading-tight line-clamp-3";
  const gapPx = resolved.tileStyle === "compactSquare" ? 0 : resolved.tileGapMm * 3.78;
  const gridBackdrop = rgba(
    resolved.themePreset === "default"
      ? { r: 244, g: 244, b: 245 }
      : { r: resolved.accentColor.r, g: resolved.accentColor.g, b: resolved.accentColor.b },
    resolved.themePreset === "default" ? resolved.tileOpacity : 0.12 * resolved.tileOpacity
  );
  const imageUrl = resolved.background ? backgroundUrl(resolved.background.source) : null;
  const rootStyle: React.CSSProperties = {
    fontFamily: cssFontFamily(resolved.cellFontFamily),
    ["--bingo-accent" as string]: pdfColorToCss(resolved.accentColor),
    ["--bingo-grid-gap" as string]: `${gapPx}px`,
  };
  const backgroundStyle: React.CSSProperties | undefined = imageUrl
    ? {
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: resolved.background?.fit === "contain" ? "contain" : "cover",
        backgroundPosition: `${(resolved.background?.positionX ?? 0.5) * 100}% ${(resolved.background?.positionY ?? 0.5) * 100}%`,
        backgroundRepeat: "no-repeat",
      }
    : undefined;

  return (
    <div
      className="bingo-card-preview-print-surface relative bg-white text-zinc-900 p-4 sm:p-8 border border-zinc-200 max-w-xl mx-auto print:shadow-none print:border-none print:p-8 print:m-0 print:max-w-none print:w-full overflow-hidden"
      style={rootStyle}
    >
      {imageUrl && resolved.background?.mode === "fullPage" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ ...backgroundStyle, opacity: resolved.background.opacity }}
        />
      )}
      <div className="relative z-10">
        <div className="text-center mb-4 sm:mb-5 print:mb-3">
          {resolved.headerStyle === "festive" && (
            <div className="h-1 mb-2 flex items-center gap-2" aria-hidden="true">
              <span className="h-1 flex-1 bg-red-700" />
              <span className="h-2 w-2 rounded-full bg-green-700" />
              <span className="h-1 flex-1 bg-green-700" />
            </div>
          )}
          <h2
            className="text-xl sm:text-2xl font-black tracking-tight uppercase whitespace-pre-line"
            style={{
              color: resolved.themePreset === "default" ? "#18181b" : pdfColorToCss(resolved.accentColor),
              fontFamily: cssFontFamily(resolved.titleFontFamily),
              fontSize: `${Math.min(2.5, Math.max(1.1, resolved.titleSizePt / 12))}rem`,
              lineHeight: 1.08,
            }}
          >
            {eventTitle}
          </h2>
          {interactiveMarks && (
            <button
              onClick={resetMarks}
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-700 transition-colors print:hidden mt-1"
              title="Reset stamps"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        <div className="bingo-card-preview-scroll print:overflow-visible">
          <div className="relative">
            {imageUrl && resolved.background?.mode === "cardWatermark" && (
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{ ...backgroundStyle, opacity: resolved.background.opacity }}
              />
            )}
            <div
              className="relative bingo-card-preview-grid"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                gap: "var(--bingo-grid-gap)",
                ["--bingo-grid-size" as string]: String(gridSize),
                backgroundColor: gridBackdrop,
              }}
            >
              {card.grid.map((cell, index) => {
              const blank = isBlankCell(cell);
              if (blank) {
                return (
                  <div
                    key={index}
                    className={`bingo-blank-tile bingo-card-preview-cell aspect-square ${tileShapeClass(resolved)}`}
                    aria-hidden="true"
                    style={{
                      backgroundColor: rgba({ r: 24, g: 24, b: 27 }, resolved.tileOpacity),
                      borderColor: "#09090b",
                    }}
                  />
                );
              }

              const track = cell.track;
              const isMarked = markedIndices.has(index);
              const cellNumber = track
                ? authorPool
                  ? getTrackAuthorNumber(tracks, track.id)
                  : getTrackSongNumber(tracks, track.id)
                : null;
              const tileBackground = isMarked
                ? "rgba(16, 185, 129, 0.1)"
                : rgba(
                    resolved.themePreset === "default"
                      ? { r: 244, g: 244, b: 245 }
                      : { r: resolved.accentColor.r, g: resolved.accentColor.g, b: resolved.accentColor.b },
                    resolved.themePreset === "default" ? resolved.tileOpacity : 0.12 * resolved.tileOpacity
                  );

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleMark(index)}
                  className={`bingo-card-preview-cell relative aspect-square flex flex-col items-center justify-center p-1 sm:p-2 text-center border transition-all select-none overflow-hidden ${tileShapeClass(resolved)} ${
                    isMarked ? "ring-2 ring-emerald-500/30" : "hover:brightness-95"
                  }`}
                  style={{
                    rowGap: contentGap,
                    backgroundColor: tileBackground,
                    borderColor: isMarked ? "#10b981" : pdfColorToCss(resolved.accentColor),
                    color: "#18181b",
                    fontFamily: cssFontFamily(resolved.cellFontFamily),
                  }}
                >
                  {track ? (
                    <>
                      {showNumbers && cellNumber != null && (
                        <p
                          className={numberClass}
                          style={{
                            fontSize: `${numberSize * sizes.numbers / 100}rem`,
                            lineHeight: 1,
                          }}
                        >
                          {cellNumber}
                        </p>
                      )}
                      {showSongs && (
                        <p
                          className={titleClass}
                          style={{
                            fontSize: `${songSize * sizes.songs / 100}rem`,
                            lineHeight: 1.1,
                          }}
                        >
                          {track.title}
                        </p>
                      )}
                      {showAuthors && (
                        <p
                          className={showSongs ? artistClass : authorOnlyClass}
                          style={{
                            color: showSongs ? "#64748b" : "#18181b",
                            fontSize: `${(showSongs ? authorSize : authorOnlySize) * sizes.authors / 100}rem`,
                            lineHeight: 1.1,
                          }}
                        >
                          {track.artist}
                        </p>
                      )}
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
          </div>
        </div>

        {qrDataUrl && (
          <div className="mt-4 pt-3 border-t border-zinc-100 flex justify-end">
            <img
              src={qrDataUrl}
              alt="QR code linking to this deck"
              className="w-16 h-16 sm:w-[72px] sm:h-[72px] print:w-[72px] print:h-[72px]"
            />
          </div>
        )}
      </div>
    </div>
  );
};
