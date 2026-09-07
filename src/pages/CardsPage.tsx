import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Window } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { Track } from "../types/deck";
import { generateBingoCards, GRID_SIZES, cellCount } from "../lib/bingo/generateCards";
import {
  CELL_CONTENT_MODES,
  BingoCellContentMode,
  cellContentLabel,
  isBingoCellContentMode,
} from "../lib/bingo/cellContent";
import { generateQrDataUrl } from "../lib/bingo/qr";
import {
  getDeckReadiness,
  getLargestValidGridSize,
  isGridSizeValidForDeck,
  MIN_CARDS_TRACKS,
} from "../lib/decks/readiness";
import { CardPreview } from "../components/bingo/CardPreview";
import { MasterSongList } from "../components/bingo/MasterSongList";
import { BingoCard } from "../types/deck";
import { CardsPlayabilityBanner } from "../components/bingo/CardsPlayabilityBanner";
import { usePlayabilityGate } from "../hooks/usePlayabilityGate";
import { useIsMobile } from "../hooks/useMediaQuery";
import { PageHeader } from "../components/layout/PageHeader";
import { trackEvent } from "../lib/usage/events";
import { useDeckRoute } from "../hooks/useDeckRoute";
import { DeckNotFoundPage } from "./DeckNotFoundPage";
import { buildSharedDeckUrl } from "../lib/share/deckShare";
import {
  isShareApiConfigured,
  publishSharedDeck,
} from "../lib/share/sharedDecksApi";
import {
  Printer,
  Download,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  Settings2,
  FileText,
  Loader2,
  Edit3,
  ListOrdered,
} from "lucide-react";

const CARD_SETTINGS_KEY = "bingo.cards.settings";
const CARD_COUNT_PRESETS = [5, 10, 20, 50, 100] as const;
const BINGO_PERCENT = 100;
const EVENT_TITLE_MAX = 80;

type PrintJob = "cards" | "master" | "all";

interface CardSettings {
  cardCount: number;
  gridSize: number;
  cellContent: BingoCellContentMode;
  includeMasterList: boolean;
}

function readCardSettings(deckId: string): Partial<CardSettings> | null {
  try {
    const raw = sessionStorage.getItem(`${CARD_SETTINGS_KEY}.${deckId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CardSettings>;
    return parsed;
  } catch {
    return null;
  }
}

export const CardsPage: React.FC = () => {
  const { deck, isLoading, notFound } = useDeckRoute();
  const { updateDeck } = useDeck();
  const isMobile = useIsMobile();

  const [customTitle, setCustomTitle] = useState("");
  const [cardCount, setCardCount] = useState<number>(10);
  const [gridSize, setGridSize] = useState<number>(5);
  const [cellContent, setCellContent] = useState<BingoCellContentMode>("both");
  const [includeMasterList, setIncludeMasterList] = useState(true);

  const [cards, setCards] = useState<BingoCard[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number>(0);
  const [printCards, setPrintCards] = useState<BingoCard[] | null>(null);
  const [printJob, setPrintJob] = useState<PrintJob>("all");
  const [pendingPrint, setPendingPrint] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [shareError, setShareError] = useState<string | null>(null);

  const handleTracksUpdated = useCallback(
    (updatedTracks: Track[]) => {
      if (!deck) return;
      updateDeck({ ...deck, tracks: updatedTracks });
    },
    [deck, updateDeck]
  );

  const {
    isChecking,
    invalidTracks,
    progress: gateProgress,
  } = usePlayabilityGate(deck?.tracks ?? [], {
    autoRun: Boolean(deck),
    onTracksUpdated: handleTracksUpdated,
  });

  const slots = cellCount(gridSize);

  const cardOptions = useMemo(() => {
    if (!deck) return null;
    return {
      deckName: deck.name,
      customTitle: customTitle || deck.name,
      cardCount,
      gridSize,
      bingoPercent: BINGO_PERCENT,
      cellContent,
      shareUrl: shareUrl ?? undefined,
    };
  }, [deck, customTitle, cardCount, gridSize, cellContent, shareUrl]);

  const layoutKeyRef = useRef("");

  useEffect(() => {
    if (!deck) return;
    setCustomTitle(deck.name);
    const stored = readCardSettings(deck.id);
    const trackCount = deck.tracks.length;
    if (stored) {
      if (typeof stored.cardCount === "number") setCardCount(stored.cardCount);
      const sizeCandidate =
        typeof stored.gridSize === "number" ? stored.gridSize : getLargestValidGridSize(trackCount);
      const size = isGridSizeValidForDeck(trackCount, sizeCandidate)
        ? sizeCandidate
        : getLargestValidGridSize(trackCount);
      setGridSize(size);
      if (isBingoCellContentMode(stored.cellContent)) setCellContent(stored.cellContent);
      if (typeof stored.includeMasterList === "boolean") {
        setIncludeMasterList(stored.includeMasterList);
      }
    } else if (trackCount > 0) {
      setGridSize(getLargestValidGridSize(trackCount));
    }
  }, [deck?.id, deck?.name, deck?.tracks.length]);

  useEffect(() => {
    if (!deck) return;
    try {
      sessionStorage.setItem(
        `${CARD_SETTINGS_KEY}.${deck.id}`,
        JSON.stringify({ cardCount, gridSize, cellContent, includeMasterList } satisfies CardSettings)
      );
    } catch {
      // ignore
    }
  }, [deck?.id, cardCount, gridSize, cellContent, includeMasterList]);

  useEffect(() => {
    setActivePreviewIndex((prev) => (cards.length === 0 ? 0 : Math.min(prev, cards.length - 1)));
  }, [cards.length]);

  useEffect(() => {
    if (!deck || deck.tracks.length === 0) {
      setCards([]);
      setActivePreviewIndex(0);
      layoutKeyRef.current = "";
      return;
    }

    const layoutKey = `${deck.id}:${deck.updatedAt}:${cardCount}:${gridSize}`;
    const layoutChanged = layoutKey !== layoutKeyRef.current;
    layoutKeyRef.current = layoutKey;

    setCards(
      generateBingoCards(deck.tracks, {
        deckName: deck.name,
        customTitle: customTitle || deck.name,
        cardCount,
        gridSize,
        bingoPercent: BINGO_PERCENT,
      })
    );

    if (layoutChanged) {
      setActivePreviewIndex(0);
    }
  }, [deck?.id, deck?.updatedAt, cardCount, gridSize]);

  useEffect(() => {
    if (!deck || !isShareApiConfigured()) {
      setShareUrl(null);
      setQrDataUrl(null);
      setShareStatus("idle");
      setShareError(null);
      return;
    }

    let cancelled = false;
    setShareStatus("loading");
    setShareError(null);

    void (async () => {
      try {
        const { shareId } = await publishSharedDeck(deck);
        if (cancelled) return;
        const url = buildSharedDeckUrl(shareId);
        setShareUrl(url);
        const qr = await generateQrDataUrl(url, 160);
        if (cancelled) return;
        setQrDataUrl(qr);
        setShareStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setShareUrl(null);
        setQrDataUrl(null);
        setShareStatus("error");
        setShareError((err as Error).message || "Could not create share link");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deck?.id, deck?.updatedAt]);

  const handleRegenerate = () => {
    if (!deck || !cardOptions || deck.tracks.length === 0) return;
    const generated = generateBingoCards(deck.tracks, cardOptions);
    setCards(generated);
    setActivePreviewIndex(0);
  };

  const handleDownloadPdf = async () => {
    if (!deck || !cardOptions || cards.length === 0 || isExportingPdf) return;
    setIsExportingPdf(true);
    setPdfProgress({ current: 0, total: cards.length });

    try {
      const { downloadBingoPdf } = await import("../lib/bingo/pdf");
      await downloadBingoPdf(
        cards,
        {
          ...cardOptions,
          tracks: deck.tracks,
          cellContent,
          shareUrl: shareUrl ?? undefined,
          includeMasterList,
        },
        (current, total) => {
          setPdfProgress({ current, total });
        }
      );
      trackEvent("cards_printed");
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF: " + (err as Error).message);
    } finally {
      setIsExportingPdf(false);
      setPdfProgress(null);
    }
  };

  useEffect(() => {
    const resetPrintCards = () => {
      setPrintCards(null);
      setPrintJob("all");
    };
    window.addEventListener("afterprint", resetPrintCards);
    return () => window.removeEventListener("afterprint", resetPrintCards);
  }, []);

  useEffect(() => {
    if (!pendingPrint || printCards === null) return;
    setPendingPrint(false);
    trackEvent("cards_printed");
    window.print();
  }, [pendingPrint, printCards]);

  const triggerBrowserPrint = (selection: BingoCard[], job: PrintJob = "all") => {
    if (job !== "master" && cards.length === 0) return;
    setPrintJob(job);
    setPrintCards(selection);
    setPendingPrint(true);
  };

  const handleBrowserPrint = () =>
    triggerBrowserPrint(cards, includeMasterList ? "all" : "cards");

  const handlePrintMasterOnly = () => triggerBrowserPrint([], "master");

  const handlePrintPreviewCard = () => {
    const card = cards[activePreviewIndex];
    if (!card) return;
    triggerBrowserPrint([card], "cards");
  };

  if (notFound) {
    return <DeckNotFoundPage />;
  }

  if (isLoading || !deck) return null;

  const readiness = getDeckReadiness(deck.tracks, gridSize);
  const currentCard = cards[activePreviewIndex] || cards[0];
  const cardsForPrint = printCards ?? cards;
  const canGenerate = deck.tracks.length > 0 && isGridSizeValidForDeck(deck.tracks.length, gridSize);
  const exportsDisabled = cards.length === 0 || !canGenerate;
  const showCardsInPrint = printJob === "cards" || printJob === "all";
  const eventTitle = customTitle || deck.name;

  const pdfButtonLabel = isExportingPdf
    ? `Generating PDF (${pdfProgress?.current}/${pdfProgress?.total})...`
    : `Download PDF (${cards.length} cards)`;

  const previewEmptyState = (
    <Window title="Preview">
      <div className="text-center py-8 space-y-3">
        {deck.tracks.length === 0 ? (
          <>
            <p className="text-sm">Add songs in the deck to generate cards.</p>
            <Link to={`/deck/${deck.id}`} className="pc-button pc-button--primary inline-flex items-center gap-2">
              <Edit3 className="w-4 h-4" />
              Open deck
            </Link>
          </>
        ) : deck.tracks.length < MIN_CARDS_TRACKS ? (
          <>
            <p className="text-sm">
              Need at least {MIN_CARDS_TRACKS} songs for a 3×3 bingo card (you have {deck.tracks.length}).
            </p>
            <Link to={`/deck/${deck.id}`} className="pc-button pc-button--primary inline-flex items-center gap-2">
              <Edit3 className="w-4 h-4" />
              Add more songs
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted">Adjust settings to preview cards.</p>
        )}
      </div>
    </Window>
  );

  return (
    <div className="space-y-4">
      <CardsPlayabilityBanner
        deckId={deck.id}
        isChecking={isChecking}
        progress={gateProgress}
        invalidTracks={invalidTracks}
        readiness={readiness}
      />

      {isMobile ? (
        <PageHeader
          back={{ fallbackTo: `/deck/${deck.id}`, fallbackLabel: "Deck editor" }}
          title={`Cards`}
          primaryAction={
            <Button type="button" onClick={handleBrowserPrint} disabled={exportsDisabled}>
              <Printer className="w-4 h-4" />
              Print
            </Button>
          }
          overflowItems={[
            {
              icon: isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              ),
              label: isExportingPdf
                ? `Generating PDF (${pdfProgress?.current ?? 0}/${pdfProgress?.total ?? cards.length})`
                : `Download PDF (${cards.length} cards)`,
              onClick: () => void handleDownloadPdf(),
              disabled: exportsDisabled,
            },
            {
              icon: <ListOrdered className="w-4 h-4" />,
              label: "Print master list",
              onClick: handlePrintMasterOnly,
              disabled: deck.tracks.length === 0,
            },
          ]}
        />
      ) : (
        <PageHeader
          back={{ fallbackTo: `/deck/${deck.id}`, fallbackLabel: "Deck editor" }}
          title={`Bingo cards — ${deck.name}`}
          primaryAction={
            <div className="flex items-center gap-2">
              <Button type="button" onClick={handleBrowserPrint} disabled={exportsDisabled}>
                <Printer className="w-4 h-4" />
                Print
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleDownloadPdf()}
                disabled={isExportingPdf || exportsDisabled}
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {pdfButtonLabel}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {pdfButtonLabel}
                  </>
                )}
              </Button>
            </div>
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 print:hidden">
        <div className="lg:col-span-5 space-y-4">
          <Window
            title={
              <span className="inline-flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Print settings
              </span>
            }
          >
            <div className="space-y-4">
              <label className="block text-xs font-bold">
                Game / Event Title
                <Input
                  type="text"
                  className="w-full mt-1"
                  value={customTitle}
                  maxLength={EVENT_TITLE_MAX}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  onBlur={() => setCustomTitle((current) => current.trim())}
                  placeholder="e.g. Friday Night 80s Bingo"
                />
                <span className="block mt-1 text-[11px] font-normal text-muted text-right">
                  {customTitle.length}/{EVENT_TITLE_MAX}
                </span>
              </label>

              <div>
                <p className="text-xs font-bold mb-1.5">Cell content</p>
                {isMobile ? (
                  <select
                    className="pc-select w-full"
                    value={cellContent}
                    onChange={(e) => setCellContent(e.target.value as BingoCellContentMode)}
                    aria-label="Cell content"
                  >
                    {CELL_CONTENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {cellContentLabel(mode)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex flex-col gap-2">
                    {CELL_CONTENT_MODES.map((mode) => (
                      <Button
                        key={mode}
                        type="button"
                        active={cellContent === mode}
                        onClick={() => setCellContent(mode)}
                        className="w-full justify-start"
                      >
                        {cellContentLabel(mode)}
                      </Button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted mt-1.5">
                  Numbers follow deck order (#1 is the first song). Best for players who may not know the tracks.
                </p>
              </div>

              <label className="flex items-start gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeMasterList}
                  onChange={(e) => setIncludeMasterList(e.target.checked)}
                />
                <span>
                  Include master song list
                  <span className="block font-normal text-muted mt-0.5">
                    Prints a number → song key sheet for the host (and PDF first pages).
                  </span>
                </span>
              </label>

              {!isMobile && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handlePrintMasterOnly}
                  disabled={deck.tracks.length === 0}
                >
                  <ListOrdered className="w-4 h-4" />
                  Print master list only
                </Button>
              )}

              <div>
                <p className="text-xs font-bold mb-1.5">Grid size ({gridSize}×{gridSize})</p>
                {isMobile ? (
                  <select
                    className="pc-select w-full"
                    value={gridSize}
                    onChange={(e) => setGridSize(Number(e.target.value))}
                    aria-label="Grid size"
                  >
                    {GRID_SIZES.map((size) => {
                      const valid = isGridSizeValidForDeck(deck.tracks.length, size);
                      return (
                      <option key={size} value={size} disabled={!valid}>
                        {size}×{size}{!valid ? ` (need ${cellCount(size)}+ songs)` : ""}
                      </option>
                    );})}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    {GRID_SIZES.map((size) => {
                      const valid = isGridSizeValidForDeck(deck.tracks.length, size);
                      return (
                      <Button
                        key={size}
                        type="button"
                        active={gridSize === size}
                        disabled={!valid}
                        title={valid ? undefined : `Need at least ${cellCount(size)} songs for ${size}×${size}`}
                        onClick={() => setGridSize(size)}
                        className="flex-1"
                      >
                        {size}×{size}
                      </Button>
                    );})}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold mb-1.5">Number of Cards ({cardCount})</p>
                {isMobile ? (
                  <select
                    className="pc-select w-full"
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    aria-label="Number of cards"
                  >
                    {CARD_COUNT_PRESETS.map((num) => (
                      <option key={num} value={num}>
                        {num} cards
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    {CARD_COUNT_PRESETS.map((num) => (
                      <Button
                        key={num}
                        type="button"
                        active={cardCount === num}
                        onClick={() => setCardCount(num)}
                        className="flex-1"
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={handleRegenerate}
                disabled={!canGenerate}
              >
                <Shuffle className="w-4 h-4" />
                Shuffle again
              </Button>

              <div className="text-xs pt-1 border-t border-[var(--pc-border)] space-y-1">
                <p className="text-muted">
                  {deck.tracks.length} song{deck.tracks.length === 1 ? "" : "s"} in deck · {slots} squares
                  per card
                  {!isGridSizeValidForDeck(deck.tracks.length, gridSize)
                    ? ` · Need ${cellCount(gridSize)}+ songs for this grid`
                    : ""}
                </p>
                {shareStatus === "loading" && (
                  <p className="text-muted inline-flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Preparing share link for QR…
                  </p>
                )}
                {shareStatus === "ready" && shareUrl && (
                  <p className="text-muted break-all">
                    QR / link on prints: {shareUrl}
                  </p>
                )}
                {shareStatus === "error" && (
                  <p className="text-pc-warning">
                    Share link unavailable{shareError ? `: ${shareError}` : ""}. Cards still print without QR.
                  </p>
                )}
                {shareStatus === "idle" && !isShareApiConfigured() && (
                  <p className="text-muted">
                    Share API not configured — prints will omit the deck QR / link.
                  </p>
                )}
              </div>
            </div>
          </Window>
        </div>

        <div className="lg:col-span-7 space-y-3">
          {cards.length > 0 && currentCard ? (
            <Window
              title={
                <span className="inline-flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Preview · card {currentCard.cardNumber} of {cards.length}
                </span>
              }
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <button
                  type="button"
                  onClick={handlePrintPreviewCard}
                  disabled={exportsDisabled}
                  className="text-xs text-muted hover:text-inherit underline-offset-2 hover:underline disabled:opacity-50 disabled:pointer-events-none"
                  title={`Print card ${currentCard.cardNumber}`}
                >
                  Print this card
                </button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      setActivePreviewIndex((prev) => (prev > 0 ? prev - 1 : cards.length - 1))
                    }
                    title="Previous card"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-mono px-1">
                    {activePreviewIndex + 1} / {cards.length}
                  </span>
                  <Button
                    type="button"
                    onClick={() =>
                      setActivePreviewIndex((prev) => (prev < cards.length - 1 ? prev + 1 : 0))
                    }
                    title="Next card"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <CardPreview
                card={currentCard}
                eventTitle={eventTitle}
                tracks={deck.tracks}
                cellContent={cellContent}
                shareUrl={shareUrl}
                qrDataUrl={qrDataUrl}
                interactiveMarks={false}
              />
            </Window>
          ) : (
            previewEmptyState
          )}
        </div>
      </div>

      <div className="hidden print:block space-y-8">
        {(printJob === "master" || (printJob === "all" && includeMasterList)) &&
          deck.tracks.length > 0 && (
            <div className="page-break-after-always">
              <MasterSongList
                eventTitle={eventTitle}
                tracks={deck.tracks}
                shareUrl={shareUrl}
                qrDataUrl={qrDataUrl}
              />
            </div>
          )}
        {showCardsInPrint &&
          cardsForPrint.map((c) => (
            <div key={c.id} className="page-break-after-always">
              <CardPreview
                card={c}
                eventTitle={eventTitle}
                tracks={deck.tracks}
                cellContent={cellContent}
                shareUrl={shareUrl}
                qrDataUrl={qrDataUrl}
                interactiveMarks={false}
              />
            </div>
          ))}
      </div>
    </div>
  );
};
