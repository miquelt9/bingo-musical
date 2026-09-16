import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Window } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { Track } from "../types/deck";
import { generateBingoCards, GRID_SIZES, cellCount } from "../lib/bingo/generateCards";
import {
  BingoCellContentSelection,
  CELL_CONTENT_KINDS,
  DEFAULT_CELL_CONTENT,
  DEFAULT_CELL_CONTENT_SIZES,
  BingoCellContentSizes,
  cellContentKindLabel,
  cellContentPool,
  normalizeCellContentSizes,
  parseStoredCellContent,
  toggleCellContent,
  usesAuthorPool,
} from "../lib/bingo/cellContent";

import {
  getDeckReadiness,
  getLargestValidGridSize,
  isGridSizeValidForDeck,
} from "../lib/decks/readiness";
import { CardPreview } from "../components/bingo/CardPreview";
import { MasterSongList } from "../components/bingo/MasterSongList";
import { BingoCard } from "../types/deck";
import { CardsPlayabilityBanner } from "../components/bingo/CardsPlayabilityBanner";
import { AlertModal } from "../components/ui/AppDialog";
import { useToast } from "../state/ToastContext";
import { usePlayabilityGate } from "../hooks/usePlayabilityGate";
import { useIsMobile } from "../hooks/useMediaQuery";
import { PageHeader } from "../components/layout/PageHeader";
import { trackEvent } from "../lib/usage/events";
import { useDeckRoute } from "../hooks/useDeckRoute";
import { DeckNotFoundPage } from "./DeckNotFoundPage";
import { buildSharedDeckUrl } from "../lib/share/deckShare";
import { generateQrDataUrl } from "../lib/bingo/qr";
import { estimateBingoTimes, formatEstimateDraws, formatEstimateDuration } from "../lib/bingo/estimator";
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
  Check,
  AlertCircle,
} from "lucide-react";

const CARD_SETTINGS_KEY = "bingo.cards.settings";

const BINGO_PERCENT = 100;
const EVENT_TITLE_MAX = 80;

type PrintJob = "cards" | "master" | "all";

interface CardSettings {
  cardCount: number;
  gridSize: number;
  cellContent: BingoCellContentSelection;
  cellContentSizes: BingoCellContentSizes;
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
  const { updateDeck, backgroundTasks } = useDeck();
  const { showToast, dismissToast } = useToast();
  const isMobile = useIsMobile();

  const [customTitle, setCustomTitle] = useState("");
  const [cardCount, setCardCount] = useState<number>(10);
  const [gridSize, setGridSize] = useState<number>(5);
  const [cellContent, setCellContent] = useState<BingoCellContentSelection>(DEFAULT_CELL_CONTENT);
  const [cellContentSizes, setCellContentSizes] = useState<BingoCellContentSizes>(DEFAULT_CELL_CONTENT_SIZES);
  const [includeMasterList, setIncludeMasterList] = useState(true);

  const [cards, setCards] = useState<BingoCard[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number>(0);
  const [printCards, setPrintCards] = useState<BingoCard[] | null>(null);
  const [printJob, setPrintJob] = useState<PrintJob>("all");
  const [pendingPrint, setPendingPrint] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const [pdfError, setPdfError] = useState<string | null>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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
  const poolTracks = useMemo(
    () => (deck ? cellContentPool(deck.tracks, cellContent) : []),
    [deck, cellContent]
  );
  const poolCount = poolTracks.length;

  const averageClipSeconds = useMemo(() => {
    if (poolTracks.length === 0) return 0;
    return (
      poolTracks.reduce(
        (total, track) => total + Math.max(0, track.endTime - track.startTime),
        0
      ) / poolTracks.length
    );
  }, [poolTracks]);
  const bingoEstimate = useMemo(
    () => estimateBingoTimes(poolCount, gridSize, gridSize, cardCount, averageClipSeconds),
    [poolCount, gridSize, cardCount, averageClipSeconds]
  );

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
      cellContentSizes,
    };
  }, [deck, customTitle, cardCount, gridSize, cellContent, cellContentSizes, shareUrl]);

  const layoutKeyRef = useRef("");

  useEffect(() => {
    if (!deck) return;
    setCustomTitle(deck.name);
    const stored = readCardSettings(deck.id);
    const trackCount = deck.tracks.length;
    if (stored) {
      if (typeof stored.cardCount === "number") setCardCount(stored.cardCount);
      const parsedContent = parseStoredCellContent(stored.cellContent) ?? DEFAULT_CELL_CONTENT;
      setCellContent(parsedContent);
      setCellContentSizes(normalizeCellContentSizes(stored.cellContentSizes));
      const poolSize = cellContentPool(deck.tracks, parsedContent).length;
      const sizeCandidate =
        typeof stored.gridSize === "number" ? stored.gridSize : getLargestValidGridSize(poolSize);
      const size = isGridSizeValidForDeck(poolSize, sizeCandidate)
        ? sizeCandidate
        : getLargestValidGridSize(poolSize);
      setGridSize(size);
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
        JSON.stringify({ cardCount, gridSize, cellContent, cellContentSizes, includeMasterList } satisfies CardSettings)
      );
    } catch {
      // ignore
    }
  }, [deck?.id, cardCount, gridSize, cellContent, cellContentSizes, includeMasterList]);

  useEffect(() => {
    setActivePreviewIndex((prev) => (cards.length === 0 ? 0 : Math.min(prev, cards.length - 1)));
  }, [cards.length]);

  useEffect(() => {
    if (!deck || poolCount === 0) {
      setCards([]);
      setActivePreviewIndex(0);
      layoutKeyRef.current = "";
      return;
    }

    const authorMode = usesAuthorPool(cellContent) ? "authors" : "songs";
    const layoutKey = `${deck.id}:${deck.updatedAt}:${cardCount}:${gridSize}:${authorMode}`;
    const layoutChanged = layoutKey !== layoutKeyRef.current;
    layoutKeyRef.current = layoutKey;

    setCards(
      generateBingoCards(deck.tracks, {
        deckName: deck.name,
        customTitle: customTitle || deck.name,
        cardCount,
        gridSize,
        bingoPercent: BINGO_PERCENT,
        cellContent,
      })
    );

    if (layoutChanged) {
      setActivePreviewIndex(0);
    }
  }, [
    deck?.id,
    deck?.updatedAt,
    deck?.tracks.length,
    poolCount,
    cardCount,
    gridSize,
    cellContent.songs,
    cellContent.authors,
  ]);

  // If author-only mode shrinks the pool below the current grid, step down.
  useEffect(() => {
    if (!deck || poolCount === 0) return;
  }, [deck, poolCount, gridSize]);

  useEffect(() => {
    if (!deck || !isShareApiConfigured() || deck.tracks.length === 0) {
      setShareUrl(null);
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { shareId } = await publishSharedDeck(deck);
        if (cancelled) return;
        const url = buildSharedDeckUrl(shareId);
        setShareUrl(url);
      } catch {
        if (cancelled) return;
        setShareUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deck?.id, deck?.updatedAt, deck?.tracks.length]);

  useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    void generateQrDataUrl(shareUrl, 180).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  const handleRegenerate = () => {
    if (!deck || !cardOptions || poolCount === 0) return;
    const generated = generateBingoCards(deck.tracks, cardOptions);
    setCards(generated);
    setActivePreviewIndex(0);
  };

  const handleDownloadPdf = async () => {
    if (!deck || !cardOptions || cards.length === 0 || isExportingPdf) return;
    setIsExportingPdf(true);

    const loadingToastId = showToast({
      title: "Generating PDF",
      message: `Preparing ${cards.length} bingo cards…`,
      duration: undefined,
    });

    try {
      const { downloadBingoPdf } = await import("../lib/bingo/pdf");
      await downloadBingoPdf(
        cards,
        {
          ...cardOptions,
          tracks: deck.tracks,
          cellContent,
          cellContentSizes,
          shareUrl: shareUrl ?? undefined,
          includeMasterList,
        },
        () => {}
      );
      trackEvent("cards_printed", "cards", { output: "pdf" });
      dismissToast(loadingToastId);
      showToast({
        title: "PDF downloaded",
        icon: <Check className="w-3.5 h-3.5" />,
        message: `${cards.length} bingo cards are ready to print or share.`,
        duration: 5000,
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setPdfError("Failed to generate PDF: " + message);
      dismissToast(loadingToastId);
      showToast({
        title: "PDF export failed",
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        message: "The PDF could not be generated. See the error details for more information.",
        duration: 10000,
      });
    } finally {
      setIsExportingPdf(false);

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
    trackEvent("cards_printed", "cards", { output: "browser" });
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
  const deezerHydration = backgroundTasks[`deezer-hydration:${deck.id}`];
  const currentCard = cards[activePreviewIndex] || cards[0];
  const cardsForPrint = printCards ?? cards;
  const canGenerate = poolCount > 0;
  const exportsDisabled = cards.length === 0 || !canGenerate;
  const showCardsInPrint = printJob === "cards" || printJob === "all";
  const eventTitle = customTitle || deck.name;

  const pdfButtonLabel = "Download PDF cards";

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
        ) : (
          <p className="text-sm text-muted">Adjust settings to preview cards.</p>
        )}
      </div>
    </Window>
  );

  return (
    <div className="space-y-4">
      {pdfError && (
        <AlertModal title="PDF export failed" onClose={() => setPdfError(null)}>
          {pdfError}
        </AlertModal>
      )}
      <CardsPlayabilityBanner
        deckId={deck.id}
        isChecking={isChecking}
        progress={gateProgress}
        invalidTracks={invalidTracks}
        readiness={readiness}
        isLoadingDeezerPreviews={Boolean(deezerHydration)}
        deezerPreviewProgress={deezerHydration}
      />

      {isMobile ? (
        <PageHeader
          back={{ fallbackTo: `/deck/${deck.id}`, fallbackLabel: "Deck editor" }}
          title={`Cards`}
          primaryAction={
            <div className="flex items-center gap-2">
              <Button type="button" onClick={handleBrowserPrint} disabled={exportsDisabled}>
                <Printer className="w-4 h-4" />
                Print
              </Button>
              <Button type="button" variant="primary" onClick={() => void handleDownloadPdf()} disabled={isExportingPdf || exportsDisabled}>
                {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF cards
              </Button>
              <Button type="button" onClick={handlePrintMasterOnly} disabled={deck.tracks.length === 0}>
                <ListOrdered className="w-4 h-4" />
                Master list
              </Button>
            </div>
          }
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
                <div className="flex flex-col gap-2">
                  {CELL_CONTENT_KINDS.map((kind) => (
                    <div key={kind} className="flex items-center gap-2 text-xs font-bold">
                      <label className="flex items-center gap-2 cursor-pointer min-w-[76px]">
                        <input
                          type="checkbox"
                          checked={cellContent[kind]}
                          onChange={() => setCellContent((prev) => toggleCellContent(prev, kind))}
                        />
                        <span>{cellContentKindLabel(kind)}</span>
                      </label>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        step={5}
                        value={cellContentSizes[kind]}
                        disabled={!cellContent[kind]}
                        onChange={(e) =>
                          setCellContentSizes((prev) => ({ ...prev, [kind]: Number(e.target.value) }))
                        }
                        aria-label={`${cellContentKindLabel(kind)} size`}
                        className="flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <span className="w-10 text-right text-[10px] font-normal text-muted">
                        {cellContentSizes[kind]}%
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted mt-1.5">
                  {usesAuthorPool(cellContent)
                    ? "Authors are deduplicated across songs. Numbers follow first appearance in the deck."
                    : "Numbers follow deck order (#1 is the first song). Pick any combination of numbers, songs, and authors."}
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
                    Adds a number-to-song key sheet for the host.
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
                      const valid = true;
                      return (
                      <option key={size} value={size} disabled={!valid}>
                        {size}×{size}
                      </option>
                    );})}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    {GRID_SIZES.map((size) => {
                      const valid = true;
                      return (
                      <Button
                        key={size}
                        type="button"
                        active={gridSize === size}
                        disabled={!valid}
                        title={undefined}
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
                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    aria-label="Number of cards"
                    className="w-full cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-muted">
                    <span>1 card</span>
                    <span>100 cards</span>
                  </div>
                </div>
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
                  {deck.tracks.length} song{deck.tracks.length === 1 ? "" : "s"} in deck
                  {usesAuthorPool(cellContent)
                    ? ` · ${poolCount} unique author${poolCount === 1 ? "" : "s"}`
                    : ""}{" "}
                  · {slots} squares per card

                </p>
                {canGenerate && (
                  <div className="pc-bevel-inset p-2.5 mt-2 space-y-2" aria-live="polite">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">Estimated game time</span>
                      <span className="text-[10px] text-muted">
                        ~{Math.round(averageClipSeconds)}s per song
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-muted">First line</span>
                        <span className="block font-bold">
                          {formatEstimateDuration(bingoEstimate.line.estimatedSeconds)}
                        </span>
                        <span className="block text-[10px] text-muted">
                          {formatEstimateDraws(bingoEstimate.line.expectedDraws)} called
                        </span>
                      </div>
                      <div>
                        <span className="block text-muted">Full card</span>
                        <span className="block font-bold">
                          {formatEstimateDuration(bingoEstimate.fullCard.estimatedSeconds)}
                        </span>
                        <span className="block text-[10px] text-muted">
                          {formatEstimateDraws(bingoEstimate.fullCard.expectedDraws)} called
                        </span>
                      </div>
                    </div>

                  </div>
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
                cellContentSizes={cellContentSizes}
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
                shareUrl={null}
                qrDataUrl={null}
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
                cellContentSizes={cellContentSizes}
                qrDataUrl={qrDataUrl}
                interactiveMarks={false}
              />
            </div>
          ))}
      </div>
    </div>
  );
};
