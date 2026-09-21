import React, { useEffect, useRef, useState } from "react";
import { BingoCard, Track } from "../../types/deck";
import {
  BingoCellContentSelection,
  BingoCellContentSizes,
  DEFAULT_CELL_CONTENT,
  DEFAULT_CELL_CONTENT_SIZES,
} from "../../lib/bingo/cellContent";
import { PdfAppearanceOptions } from "../../lib/bingo/pdfAppearance";
import { generateBingoPdf, PdfExportOptions } from "../../lib/bingo/pdf";
import { Loader2 } from "lucide-react";

interface PdfCardPreviewProps {
  card: BingoCard;
  eventTitle: string;
  deckName: string;
  tracks: Track[];
  cellContent?: BingoCellContentSelection;
  cellContentSizes?: BingoCellContentSizes;
  shareUrl?: string | null;
  verificationCode?: string;
  appearance?: PdfAppearanceOptions;
  cardIndex?: number;
}

/**
 * Renders one bingo card page from the same jsPDF pipeline used for download/print,
 * so the on-screen preview matches the sheet that gets printed.
 */
export const PdfCardPreview: React.FC<PdfCardPreviewProps> = ({
  card,
  eventTitle,
  deckName,
  tracks,
  cellContent = DEFAULT_CELL_CONTENT,
  cellContentSizes = DEFAULT_CELL_CONTENT_SIZES,
  shareUrl = null,
  verificationCode,
  appearance,
  cardIndex = 0,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const urlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setIsGenerating(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const options: PdfExportOptions = {
            deckName,
            customTitle: eventTitle,
            cardCount: 1,
            gridSize: card.gridSize,
            bingoPercent: 100,
            cellContent,
            cellContentSizes,
            shareUrl: shareUrl ?? undefined,
            appearance,
            includeMasterList: false,
            tracks,
            verificationCodes: verificationCode ? { [card.id]: verificationCode } : undefined,
            appearanceCardOffset: cardIndex,
          };
          const blob = await generateBingoPdf([card], options);
          if (requestId !== requestIdRef.current) return;

          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          const nextUrl = URL.createObjectURL(blob);
          urlRef.current = nextUrl;
          setBlobUrl(nextUrl);
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          console.error("Card preview PDF failed:", err);
          setError(err instanceof Error ? err.message : "Could not render preview.");
          setBlobUrl(null);
        } finally {
          if (requestId === requestIdRef.current) setIsGenerating(false);
        }
      })();
    }, 280);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    card,
    eventTitle,
    deckName,
    tracks,
    cellContent,
    cellContentSizes,
    shareUrl,
    verificationCode,
    appearance,
    cardIndex,
  ]);

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  return (
    <div className="bingo-pdf-preview relative w-full max-w-xl mx-auto">
      <div
        className="bingo-pdf-preview-frame relative w-full overflow-hidden bg-white border border-zinc-200"
        style={{ aspectRatio: "210 / 297" }}
      >
        {blobUrl && (
          <iframe
            title={`Bingo card ${card.cardNumber} preview`}
            src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
        {(isGenerating || !blobUrl) && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 text-zinc-600 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
            <span>Updating preview…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-700 bg-white">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
