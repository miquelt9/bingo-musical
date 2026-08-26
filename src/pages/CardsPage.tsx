import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useDeck } from "../state/DeckContext";
import { generateBingoCards } from "../lib/bingo/generateCards";
import { downloadBingoPdf } from "../lib/bingo/pdf";
import { CardPreview } from "../components/bingo/CardPreview";
import { BingoCard } from "../types/deck";
import {
  Printer,
  Download,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Settings2,
  FileText,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export const CardsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { decks, loadDeck } = useDeck();

  const deck = useMemo(() => (id ? loadDeck(id) : null), [id, loadDeck]);

  // Card generation parameters
  const [customTitle, setCustomTitle] = useState("");
  const [cardCount, setCardCount] = useState<number>(10);
  const [includeFreeSpace, setIncludeFreeSpace] = useState<boolean>(true);
  const [freeSpaceText, setFreeSpaceText] = useState<string>("FREE SPACE");

  // Generated cards
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number>(0);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    if (!deck) {
      if (decks.length > 0) {
        navigate(`/deck/${decks[0].id}/cards`, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
      return;
    }

    if (!customTitle) {
      setCustomTitle(deck.name);
    }

    // Generate initial card set
    const initial = generateBingoCards(deck.tracks, {
      deckName: deck.name,
      customTitle: customTitle || deck.name,
      cardCount,
      includeFreeSpace,
      freeSpaceText,
    });
    setCards(initial);
    setActivePreviewIndex(0);
  }, [deck, decks, navigate]);

  const handleRegenerate = () => {
    if (!deck) return;
    const generated = generateBingoCards(deck.tracks, {
      deckName: deck.name,
      customTitle,
      cardCount,
      includeFreeSpace,
      freeSpaceText,
    });
    setCards(generated);
    setActivePreviewIndex(0);
  };

  const handleDownloadPdf = async () => {
    if (!deck || cards.length === 0) return;
    setIsExportingPdf(true);
    setPdfProgress({ current: 0, total: cards.length });

    try {
      await downloadBingoPdf(
        cards,
        {
          deckName: deck.name,
          customTitle,
          cardCount,
          includeFreeSpace,
          freeSpaceText,
        },
        (current, total) => {
          setPdfProgress({ current, total });
        }
      );
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF: " + (err as Error).message);
    } finally {
      setIsExportingPdf(false);
      setPdfProgress(null);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  if (!deck) return null;

  const hasEnoughTracks = deck.tracks.length >= 24;
  const currentCard = cards[activePreviewIndex] || cards[0];

  return (
    <div className="space-y-8">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <Link
          to={`/deck/${deck.id}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Deck Editor</span>
        </Link>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBrowserPrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700 transition-colors active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print in Browser</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {isExportingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  Generating PDF ({pdfProgress?.current}/{pdfProgress?.total})...
                </span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download {cards.length} Cards (Vector PDF)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Layout: Configuration + Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:hidden">
        {/* Left Settings Sidebar */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
              <Settings2 className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Card Generator Settings</h2>
            </div>

            {/* Custom Header Title */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Game / Event Title
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Friday Night 80s Bingo"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 text-sm text-white outline-none"
              />
            </div>

            {/* Card Count Selector */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Number of Cards ({cardCount})
              </label>
              <div className="flex items-center gap-2">
                {[5, 10, 20, 50, 100].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCardCount(num)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                      cardCount === num
                        ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                        : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Free Space Options */}
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeFreeSpace}
                  onChange={(e) => setIncludeFreeSpace(e.target.checked)}
                  className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-emerald-500 accent-emerald-500"
                />
                <span className="text-xs font-semibold text-zinc-200">
                  Include Center "FREE SPACE" Wildcard
                </span>
              </label>

              {includeFreeSpace && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Free Space Text
                  </label>
                  <input
                    type="text"
                    value={freeSpaceText}
                    onChange={(e) => setFreeSpaceText(e.target.value)}
                    placeholder="FREE SPACE"
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 text-xs text-white outline-none"
                  />
                </div>
              )}
            </div>

            {/* Reshuffle / Regenerate */}
            <div className="pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleRegenerate}
                className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold border border-zinc-700 flex items-center justify-center gap-2 transition-colors active:scale-95"
              >
                <Shuffle className="w-4 h-4 text-emerald-400" />
                <span>Reshuffle & Generate {cardCount} Cards</span>
              </button>
            </div>
          </div>

          {/* Track Pool Info Box */}
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-5 text-xs text-zinc-400 space-y-2">
            <div className="flex items-center justify-between text-zinc-200 font-semibold">
              <span>Deck Song Pool</span>
              <span className="text-emerald-400">{deck.tracks.length} songs</span>
            </div>
            <p className="text-zinc-500">
              Each generated card randomly selects 24 unique songs from this pool using the Fisher-Yates unbiased shuffle algorithm.
            </p>
            {!hasEnoughTracks && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2 mt-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Deck has fewer than 24 songs ({deck.tracks.length}). Cards will repeat some songs.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Preview Area */}
        <div className="lg:col-span-7 space-y-4">
          {/* Card Carousel Controls */}
          {cards.length > 0 && (
            <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-2xl px-5 py-3 shadow-lg">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Previewing Card #{currentCard.cardNumber} of {cards.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setActivePreviewIndex((prev) => (prev > 0 ? prev - 1 : cards.length - 1))
                  }
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  title="Previous card"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-zinc-400 px-1">
                  {activePreviewIndex + 1} / {cards.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setActivePreviewIndex((prev) => (prev < cards.length - 1 ? prev + 1 : 0))
                  }
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  title="Next card"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Interactive Card Preview */}
          {currentCard && (
            <div className="bg-zinc-950/60 p-4 sm:p-8 rounded-3xl border border-zinc-800 shadow-inner">
              <CardPreview
                card={currentCard}
                eventTitle={customTitle || deck.name}
                freeSpaceText={freeSpaceText}
                interactiveMarks={true}
              />
            </div>
          )}
        </div>
      </div>

      {/* Hidden printable layout for @media print (renders every generated card cleanly on its own page) */}
      <div className="hidden print:block space-y-8">
        {cards.map((c) => (
          <div key={c.id} className="page-break-after-always">
            <CardPreview
              card={c}
              eventTitle={customTitle || deck.name}
              freeSpaceText={freeSpaceText}
              interactiveMarks={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
