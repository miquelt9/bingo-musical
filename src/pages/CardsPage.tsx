import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Button, Input, Window } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { Track } from "../types/deck";
import { generateBingoCards, GRID_SIZES, cellCount } from "../lib/bingo/generateCards";
import {
  getDeckReadiness,
  getLargestValidGridSize,
  isGridSizeValidForDeck,
} from "../lib/decks/readiness";
import { CardPreview } from "../components/bingo/CardPreview";
import { BingoCard } from "../types/deck";
import { CardsPlayabilityBanner } from "../components/bingo/CardsPlayabilityBanner";
import { usePlayabilityGate } from "../hooks/usePlayabilityGate";
import { useIsMobile } from "../hooks/useMediaQuery";
import { PageHeader } from "../components/layout/PageHeader";
import { trackEvent } from "../lib/analytics/trackEvent";
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
} from "lucide-react";

const CARD_SETTINGS_KEY = "bingo.cards.settings";
const CARD_COUNT_PRESETS = [5, 10, 20, 50, 100] as const;
const BINGO_PERCENT = 100;

interface CardSettings {
  cardCount: number;
  gridSize: number;
}

function readCardSettings(deckId: string): CardSettings | null {
  try {
    const raw = sessionStorage.getItem(`${CARD_SETTINGS_KEY}.${deckId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CardSettings;
    if (typeof parsed.cardCount === "number" && typeof parsed.gridSize === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export const CardsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { decks, loadDeck, updateDeck } = useDeck();
  const isMobile = useIsMobile();

  const deck = useMemo(() => (id ? decks.find((d) => d.id === id) ?? null : null), [id, decks]);

  const [customTitle, setCustomTitle] = useState("");
  const [cardCount, setCardCount] = useState<number>(10);
  const [gridSize, setGridSize] = useState<number>(5);

  const [cards, setCards] = useState<BingoCard[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number>(0);
  const [printCards, setPrintCards] = useState<BingoCard[] | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

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
    };
  }, [deck, customTitle, cardCount, gridSize]);

  const layoutKeyRef = useRef("");

  useEffect(() => {
    if (id) loadDeck(id);
  }, [id, loadDeck]);

  useEffect(() => {
    if (deck) return;
    if (decks.length > 0) {
      navigate(`/deck/${decks[0].id}/cards`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [deck, decks, navigate]);

  useEffect(() => {
    if (!deck) return;
    setCustomTitle(deck.name);
    const stored = readCardSettings(deck.id);
    const trackCount = deck.tracks.length;
    if (stored) {
      setCardCount(stored.cardCount);
      const size = isGridSizeValidForDeck(trackCount, stored.gridSize)
        ? stored.gridSize
        : getLargestValidGridSize(trackCount);
      setGridSize(size);
    } else if (trackCount > 0) {
      setGridSize(getLargestValidGridSize(trackCount));
    }
  }, [deck?.id, deck?.name, deck?.tracks.length]);

  useEffect(() => {
    if (!deck) return;
    try {
      sessionStorage.setItem(
        `${CARD_SETTINGS_KEY}.${deck.id}`,
        JSON.stringify({ cardCount, gridSize })
      );
    } catch {
      // ignore
    }
  }, [deck?.id, cardCount, gridSize]);

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
      await downloadBingoPdf(cards, cardOptions, (current, total) => {
        setPdfProgress({ current, total });
      });
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
    const resetPrintCards = () => setPrintCards(null);
    window.addEventListener("afterprint", resetPrintCards);
    return () => window.removeEventListener("afterprint", resetPrintCards);
  }, []);

  useEffect(() => {
    if (!pendingPrint || printCards === null) return;
    setPendingPrint(false);
    trackEvent("cards_printed");
    window.print();
  }, [pendingPrint, printCards]);

  const triggerBrowserPrint = (selection: BingoCard[]) => {
    if (cards.length === 0) return;
    setPrintCards(selection);
    setPendingPrint(true);
  };

  const handleBrowserPrint = () => triggerBrowserPrint(cards);

  const handlePrintPreviewCard = () => {
    const card = cards[activePreviewIndex];
    if (!card) return;
    triggerBrowserPrint([card]);
  };

  if (!deck) return null;

  const readiness = getDeckReadiness(deck.tracks, gridSize);
  const currentCard = cards[activePreviewIndex] || cards[0];
  const cardsForPrint = printCards ?? cards;
  const canGenerate = deck.tracks.length > 0 && isGridSizeValidForDeck(deck.tracks.length, gridSize);
  const exportsDisabled = cards.length === 0 || !canGenerate;
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
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Friday Night 80s Bingo"
                />
              </label>

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

              <p className="text-xs text-muted pt-1 border-t border-[var(--pc-border)]">
                {deck.tracks.length} song{deck.tracks.length === 1 ? "" : "s"} in deck · {slots} squares
                per card
                {!isGridSizeValidForDeck(deck.tracks.length, gridSize)
                  ? ` · Need ${cellCount(gridSize)}+ songs for this grid`
                  : ""}
              </p>
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
              <CardPreview card={currentCard} eventTitle={eventTitle} interactiveMarks={false} />
            </Window>
          ) : (
            previewEmptyState
          )}
        </div>
      </div>

      <div className="hidden print:block space-y-8">
        {cardsForPrint.map((c) => (
          <div key={c.id} className="page-break-after-always">
            <CardPreview card={c} eventTitle={eventTitle} interactiveMarks={false} />
          </div>
        ))}
      </div>
    </div>
  );
};
