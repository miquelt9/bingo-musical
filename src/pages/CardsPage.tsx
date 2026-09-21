import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button, Window } from "@miquelt9/pc-ui";
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
import { PdfCardPreview } from "../components/bingo/PdfCardPreview";
import { openPrintWindow } from "../lib/bingo/pdf";
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
import {
  computeDeckFingerprintHex,
  createCardBatchSeed,
  encodeCardVerificationCode,
} from "../lib/bingo/verification";
import { estimateBingoTimes, formatEstimateDraws, formatEstimateDuration } from "../lib/bingo/estimator";
import {
  DEFAULT_PDF_APPEARANCE,
  PdfAppearanceOptions,
  PdfFontFamily,
  PdfThemePreset,
  PdfTileStyle,
} from "../lib/bingo/pdfAppearance";
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
  ChevronDown,
  Settings2,
  FileText,
  Loader2,
  Edit3,
  ListOrdered,
  Check,
  AlertCircle,
  Palette,
  ImagePlus,
  Trash2,
} from "lucide-react";

const CARD_SETTINGS_KEY = "bingo.cards.settings";

const BINGO_PERCENT = 100;
const EVENT_TITLE_MAX = 160;
const DEFAULT_EVENT_TITLE = "Musical Bingo";
const EVENT_TITLE_PLACEHOLDER = "e.g. Friday Night Bingo";
const MAX_BACKGROUND_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BACKGROUND_EDGE = 2048;

type PrintJob = "cards" | "master" | "all";

interface CardSettings {
  version?: 3;
  cardCount: number;
  gridSize: number;
  cellContent: BingoCellContentSelection;
  cellContentSizes: BingoCellContentSizes;
  includeMasterList: boolean;
  includeShareQr?: boolean;
  batchSeed?: string;
  appearance?: PdfAppearanceOptions;
}

const DEFAULT_APPEARANCE: PdfAppearanceOptions = {
  ...DEFAULT_PDF_APPEARANCE,
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

async function downsampleBackground(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  const image = new Image();
  image.src = original;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not decode the selected image."));
  });

  const scale = Math.min(1, MAX_BACKGROUND_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return original;
  context.drawImage(image, 0, 0, width, height);
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(outputType, outputType === "image/jpeg" ? 0.84 : undefined);
}

function readCardSettings(deckId: string): Partial<CardSettings> | null {
  try {
    const raw = localStorage.getItem(`${CARD_SETTINGS_KEY}.${deckId}`);
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
  const [includeShareQr, setIncludeShareQr] = useState(true);
  const [batchSeed, setBatchSeed] = useState("");
  const [deckFingerprint, setDeckFingerprint] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<PdfAppearanceOptions>(DEFAULT_APPEARANCE);

  const [cards, setCards] = useState<BingoCard[]>([]);
  const [verificationCodes, setVerificationCodes] = useState<Record<string, string>>({});
  const [activePreviewIndex, setActivePreviewIndex] = useState<number>(0);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isPrintingPdf, setIsPrintingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  const [pdfError, setPdfError] = useState<string | null>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);

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
      customTitle: customTitle.trim() || DEFAULT_EVENT_TITLE,
      cardCount,
      gridSize,
      bingoPercent: BINGO_PERCENT,
      cellContent,
      shareUrl: shareUrl ?? undefined,
      cellContentSizes,
      appearance,
      seed: batchSeed,
    };
  }, [deck, customTitle, cardCount, gridSize, cellContent, cellContentSizes, shareUrl, appearance, batchSeed]);

  const layoutKeyRef = useRef("");

  useEffect(() => {
    if (!deck) return;
    setCustomTitle("");
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
      setIncludeShareQr(stored.includeShareQr !== false);
      setBatchSeed(typeof stored.batchSeed === "string" && /^[0-9a-f]{8}$/i.test(stored.batchSeed)
        ? stored.batchSeed
        : createCardBatchSeed());
      if (stored.appearance && typeof stored.appearance === "object") {
        setAppearance({ ...DEFAULT_APPEARANCE, ...stored.appearance });
      } else {
        setAppearance(DEFAULT_APPEARANCE);
      }
    } else if (trackCount > 0) {
      setGridSize(getLargestValidGridSize(trackCount));
      setIncludeShareQr(true);
      setBatchSeed(createCardBatchSeed());
    }

    let cancelled = false;
    setDeckFingerprint(null);
    void computeDeckFingerprintHex(deck).then((fingerprint) => {
      if (!cancelled) setDeckFingerprint(fingerprint);
    });
    return () => {
      cancelled = true;
    };
  }, [deck?.id, deck?.name, deck?.updatedAt, deck?.tracks.length]);

  useEffect(() => {
    if (!deck) return;
    try {
      localStorage.setItem(
        `${CARD_SETTINGS_KEY}.${deck.id}`,
        JSON.stringify({
          version: 3,
          cardCount,
          gridSize,
          cellContent,
          cellContentSizes,
          includeMasterList,
          includeShareQr,
          batchSeed,
          appearance,
        } satisfies CardSettings)
      );
    } catch {
      // ignore
    }
  }, [deck?.id, cardCount, gridSize, cellContent, cellContentSizes, includeMasterList, includeShareQr, batchSeed, appearance]);

  useEffect(() => {
    setActivePreviewIndex((prev) => (cards.length === 0 ? 0 : Math.min(prev, cards.length - 1)));
  }, [cards.length]);

  useEffect(() => {
    if (!deck || poolCount === 0 || !batchSeed) {
      setCards([]);
      setActivePreviewIndex(0);
      layoutKeyRef.current = "";
      return;
    }

    const authorMode = usesAuthorPool(cellContent) ? "authors" : "songs";
    const layoutKey = `${deck.id}:${deck.updatedAt}:${cardCount}:${gridSize}:${authorMode}:${batchSeed}`;
    const layoutChanged = layoutKey !== layoutKeyRef.current;
    layoutKeyRef.current = layoutKey;

    setCards(
      generateBingoCards(deck.tracks, {
        deckName: deck.name,
        customTitle: customTitle.trim() || DEFAULT_EVENT_TITLE,
        cardCount,
        gridSize,
        bingoPercent: BINGO_PERCENT,
        cellContent,
        seed: batchSeed,
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
    batchSeed,
  ]);

  // If author-only mode shrinks the pool below the current grid, step down.
  useEffect(() => {
    if (!deck || poolCount === 0) return;
  }, [deck, poolCount, gridSize]);

  useEffect(() => {
    if (!deck || !includeShareQr || !isShareApiConfigured() || deck.tracks.length === 0) {
      setShareUrl(null);
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
  }, [deck?.id, deck?.updatedAt, deck?.tracks.length, includeShareQr]);

  useEffect(() => {
    if (!deck || !deckFingerprint || !batchSeed || cards.length === 0) {
      setVerificationCodes({});
      return;
    }

    const codes: Record<string, string> = {};
    for (const card of cards) {
      codes[card.id] = encodeCardVerificationCode({
        fingerprintHex: deckFingerprint,
        batchSeed,
        cardNumber: card.cardNumber,
        gridSize: card.gridSize,
        bingoPercent: BINGO_PERCENT,
        cellContent,
      });
    }
    setVerificationCodes(codes);
  }, [deck, deckFingerprint, batchSeed, cards, cellContent]);

  const handleRegenerate = () => {
    if (!deck || !cardOptions || poolCount === 0) return;
    const nextSeed = createCardBatchSeed();
    const generated = generateBingoCards(deck.tracks, { ...cardOptions, seed: nextSeed });
    setBatchSeed(nextSeed);
    setCards(generated);
    setActivePreviewIndex(0);
  };

  const handleBackgroundUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast({ title: "Unsupported image", message: "Choose a PNG, JPEG, or WebP image.", duration: 5000 });
      return;
    }
    if (file.size > MAX_BACKGROUND_FILE_BYTES) {
      showToast({ title: "Image is too large", message: "Choose an image smaller than 5 MB.", duration: 5000 });
      return;
    }
    try {
      const source = await downsampleBackground(file);
      setAppearance((prev) => ({
        ...prev,
        background: {
          source,
          mode: prev.background?.mode ?? "cardWatermark",
          fit: prev.background?.fit ?? "cover",
          opacity: prev.background?.opacity ?? 0.14,
        },
      }));
    } catch (error) {
      showToast({
        title: "Background upload failed",
        message: error instanceof Error ? error.message : "The image could not be prepared.",
        duration: 7000,
      });
    }
  };

  const resetAppearance = () => setAppearance(DEFAULT_APPEARANCE);

  const handleDownloadPdf = async () => {
    if (!deck || !cardOptions || cards.length === 0 || isExportingPdf || isPrintingPdf) return;
    setIsExportingPdf(true);
    setPdfProgress({ current: 0, total: cards.length });

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
          verificationCodes,
        },
        (current, total) => setPdfProgress({ current, total })
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
      setPdfProgress(null);
    }
  };

  const runPdfPrint = async (selection: BingoCard[], job: PrintJob, printWindow: Window | null) => {
    if (!deck || !cardOptions || isExportingPdf || isPrintingPdf) {
      printWindow?.close();
      return;
    }
    if (job !== "master" && selection.length === 0) {
      printWindow?.close();
      return;
    }
    if (job === "master" && deck.tracks.length === 0) {
      printWindow?.close();
      return;
    }

    setIsPrintingPdf(true);
    const total = Math.max(1, selection.length);
    setPdfProgress({ current: 0, total });

    const loadingToastId = showToast({
      title: "Preparing print",
      message: job === "master" ? "Building the master song list…" : `Preparing ${selection.length} bingo card${selection.length === 1 ? "" : "s"}…`,
      duration: undefined,
    });

    try {
      const { printBingoPdf } = await import("../lib/bingo/pdf");
      await printBingoPdf(
        selection,
        {
          ...cardOptions,
          tracks: deck.tracks,
          cellContent,
          cellContentSizes,
          shareUrl: shareUrl ?? undefined,
          includeMasterList: job === "master" || (job === "all" && includeMasterList),
          verificationCodes,
          appearanceCardOffset: selection.length === 1 ? Math.max(0, cards.findIndex((c) => c.id === selection[0].id)) : 0,
        },
        (current, nextTotal) => setPdfProgress({ current, total: nextTotal }),
        printWindow
      );
      trackEvent("cards_printed", "cards", { output: "pdf" });
      dismissToast(loadingToastId);
    } catch (err) {
      console.error("PDF print failed:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setPdfError("Failed to print PDF: " + message);
      dismissToast(loadingToastId);
      printWindow?.close();
      showToast({
        title: "Print failed",
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        message: "The printable PDF could not be opened.",
        duration: 10000,
      });
    } finally {
      setIsPrintingPdf(false);
      setPdfProgress(null);
    }
  };

  const handleBrowserPrint = () => {
    void runPdfPrint(cards, includeMasterList ? "all" : "cards", openPrintWindow());
  };

  const handlePrintMasterOnly = () => {
    void runPdfPrint([], "master", openPrintWindow());
  };

  const handlePrintPreviewCard = () => {
    const card = cards[activePreviewIndex];
    if (!card) return;
    void runPdfPrint([card], "cards", openPrintWindow());
  };

  if (notFound) {
    return <DeckNotFoundPage />;
  }

  if (isLoading || !deck) return null;

  const readiness = getDeckReadiness(deck.tracks, gridSize);
  const deezerHydration = backgroundTasks[`deezer-hydration:${deck.id}`];
  const currentCard = cards[activePreviewIndex] || cards[0];
  const currentVerificationCode = currentCard ? verificationCodes[currentCard.id] : undefined;
  const canGenerate = poolCount > 0;
  const verificationReady = cards.length > 0 && Object.keys(verificationCodes).length === cards.length;
  const exportsDisabled = cards.length === 0 || !canGenerate || !verificationReady || isPrintingPdf;
  const eventTitle = customTitle.trim() || DEFAULT_EVENT_TITLE;

  const pdfButtonLabel = pdfProgress
    ? `Generating ${pdfProgress.current}/${pdfProgress.total}`
    : "Download PDF cards";

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

      {pdfProgress && (
        <div className="pc-bevel-inset p-3 space-y-1" aria-live="polite">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>Preparing PDF</span>
            <span className="text-muted">{pdfProgress.current} / {pdfProgress.total} cards</span>
          </div>
          <div className="h-2 bg-zinc-200 overflow-hidden rounded-full">
            <div
              className="h-full bg-[var(--pc-titlebar-bg)] transition-[width] duration-150"
              style={{ width: `${pdfProgress.total > 0 ? Math.round((pdfProgress.current / pdfProgress.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {isMobile ? (
        <PageHeader
          back={{ fallbackTo: `/deck/${deck.id}`, fallbackLabel: "Deck editor" }}
          title={`Cards`}
          primaryAction={
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button type="button" onClick={handleBrowserPrint} disabled={exportsDisabled} title="Print">
                {isPrintingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span className="sr-only sm:not-sr-only">Print</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleDownloadPdf()}
                disabled={isExportingPdf || exportsDisabled}
                title={pdfButtonLabel}
              >
                {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden xs:inline">PDF</span>
                <span className="sr-only">Download PDF cards</span>
              </Button>
              <Button
                type="button"
                onClick={handlePrintMasterOnly}
                disabled={deck.tracks.length === 0 || isPrintingPdf}
                title="Master list"
              >
                <ListOrdered className="w-4 h-4" />
                <span className="sr-only">Master list</span>
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
                {isPrintingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
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
        <div className="lg:col-span-5 space-y-4 order-2 lg:order-1">
          <Window
            title={
              <span className="inline-flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Print settings
              </span>
            }
          >
            <div className="space-y-4">
              {isMobile ? (
                <details className="border-t-0 pt-0">
                  <summary className="text-xs font-bold inline-flex items-center gap-2 cursor-pointer list-none min-h-[44px]">
                    <Palette className="w-4 h-4" />
                    Adjust appearance
                    <ChevronDown className="w-4 h-4 ml-auto" aria-hidden="true" />
                  </summary>
                  <div className="space-y-3 mt-3">
                    <label className="block text-xs font-bold">
                      Theme
                      <select
                        className="pc-select w-full mt-1"
                        value={appearance.themePreset ?? "default"}
                        onChange={(e) =>
                          setAppearance((prev) => ({
                            ...prev,
                            themePreset: e.target.value as PdfThemePreset,
                            headerStyle: e.target.value === "christmas" ? "festive" : prev.headerStyle,
                          }))
                        }
                      >
                        <option value="default">Default</option>
                        <option value="christmas">Christmas / Holiday</option>
                        <option value="colorful">Colorful / Dynamic</option>
                      </select>
                    </label>

                    <label className="block text-xs font-bold">
                      Header style
                      <select
                        className="pc-select w-full mt-1"
                        value={appearance.headerStyle ?? (appearance.themePreset === "christmas" ? "festive" : "plain")}
                        onChange={(e) =>
                          setAppearance((prev) => ({
                            ...prev,
                            headerStyle: e.target.value as "plain" | "festive",
                          }))
                        }
                      >
                        <option value="plain">Plain</option>
                        <option value="festive">Festive decorations</option>
                      </select>
                    </label>

                    <label className="block text-xs font-bold">
                      Tile style
                      <select
                        className="pc-select w-full mt-1"
                        value={appearance.tileStyle ?? "rounded"}
                        onChange={(e) =>
                          setAppearance((prev) => ({
                            ...prev,
                            tileStyle: e.target.value as PdfTileStyle,
                            tileGapMm: e.target.value === "compactSquare" ? 0 : prev.tileGapMm ?? 2,
                          }))
                        }
                      >
                        <option value="square">Square</option>
                        <option value="rounded">Rounded square</option>
                        <option value="circle">Circle</option>
                        <option value="compactSquare">Compact square (no gap)</option>
                      </select>
                    </label>

                    <div>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <label htmlFor="tile-opacity-mobile">Tile fill opacity</label>
                        <span className="font-normal text-muted">{Math.round((appearance.tileOpacity ?? 1) * 100)}%</span>
                      </div>
                      <input
                        id="tile-opacity-mobile"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={appearance.tileOpacity ?? 1}
                        onChange={(e) => setAppearance((prev) => ({ ...prev, tileOpacity: Number(e.target.value) }))}
                        className="w-full cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <label htmlFor="tile-gap-mobile">Tile gap</label>
                        <span className="font-normal text-muted">
                          {appearance.tileStyle === "compactSquare" ? "0 mm" : `${appearance.tileGapMm ?? 2} mm`}
                        </span>
                      </div>
                      <input
                        id="tile-gap-mobile"
                        type="range"
                        min={0}
                        max={6}
                        step={0.5}
                        disabled={appearance.tileStyle === "compactSquare"}
                        value={appearance.tileStyle === "compactSquare" ? 0 : appearance.tileGapMm ?? 2}
                        onChange={(e) => setAppearance((prev) => ({ ...prev, tileGapMm: Number(e.target.value) }))}
                        className="w-full cursor-pointer disabled:opacity-40"
                      />
                    </div>

                    <label className="block text-xs font-bold">
                      Title font
                      <select
                        className="pc-select w-full mt-1"
                        value={appearance.titleFontFamily ?? "helvetica"}
                        onChange={(e) => setAppearance((prev) => ({ ...prev, titleFontFamily: e.target.value as PdfFontFamily }))}
                      >
                        <option value="helvetica">Helvetica / clean</option>
                        <option value="times">Times / classic</option>
                        <option value="courier">Courier / retro</option>
                      </select>
                    </label>

                    <label className="block text-xs font-bold">
                      Cell font
                      <select
                        className="pc-select w-full mt-1"
                        value={appearance.cellFontFamily ?? "helvetica"}
                        onChange={(e) => setAppearance((prev) => ({ ...prev, cellFontFamily: e.target.value as PdfFontFamily }))}
                      >
                        <option value="helvetica">Helvetica / legible</option>
                        <option value="times">Times / classic</option>
                        <option value="courier">Courier / mono</option>
                      </select>
                    </label>

                    <div>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <label htmlFor="title-size-mobile">Title size</label>
                        <span className="font-normal text-muted">{appearance.titleSizePt ?? 22} pt</span>
                      </div>
                      <input
                        id="title-size-mobile"
                        type="range"
                        min={12}
                        max={36}
                        step={1}
                        value={appearance.titleSizePt ?? 22}
                        onChange={(e) => setAppearance((prev) => ({ ...prev, titleSizePt: Number(e.target.value) }))}
                        className="w-full cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-bold inline-flex items-center gap-2">
                        <ImagePlus className="w-4 h-4" />
                        Card background
                      </p>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="block w-full text-xs"
                        onChange={(e) => void handleBackgroundUpload(e.target.files?.[0])}
                      />
                      {appearance.background && (
                        <>
                          <div className="flex items-center gap-2">
                            <select
                              className="pc-select flex-1"
                              value={appearance.background.mode}
                              onChange={(e) =>
                                setAppearance((prev) => ({
                                  ...prev,
                                  background: prev.background
                                    ? { ...prev.background, mode: e.target.value as "fullPage" | "cardWatermark" }
                                    : prev.background,
                                }))
                              }
                            >
                              <option value="cardWatermark">Card watermark</option>
                              <option value="fullPage">Full card page</option>
                            </select>
                            <Button type="button" onClick={() => setAppearance((prev) => ({ ...prev, background: undefined }))} title="Remove background">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <label className="block text-xs font-bold">
                            Background opacity · {Math.round((appearance.background.opacity ?? 0.14) * 100)}%
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={appearance.background.opacity ?? 0.14}
                              onChange={(e) =>
                                setAppearance((prev) => ({
                                  ...prev,
                                  background: prev.background
                                    ? { ...prev.background, opacity: Number(e.target.value) }
                                    : prev.background,
                                }))
                              }
                              className="w-full cursor-pointer"
                            />
                          </label>
                        </>
                      )}
                      <p className="text-[11px] text-muted">Backgrounds apply to card pages only and stay local to this browser.</p>
                    </div>

                    <Button type="button" className="w-full" onClick={resetAppearance}>
                      Reset appearance
                    </Button>
                  </div>
                </details>
              ) : (
              <div className="border-t border-[var(--pc-border)] pt-3 space-y-3">
                <p className="text-xs font-bold inline-flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Appearance
                </p>

                <label className="block text-xs font-bold">
                  Theme
                  <select
                    className="pc-select w-full mt-1"
                    value={appearance.themePreset ?? "default"}
                    onChange={(e) =>
                      setAppearance((prev) => ({
                        ...prev,
                        themePreset: e.target.value as PdfThemePreset,
                        headerStyle: e.target.value === "christmas" ? "festive" : prev.headerStyle,
                      }))
                    }
                  >
                    <option value="default">Default</option>
                    <option value="christmas">Christmas / Holiday</option>
                    <option value="colorful">Colorful / Dynamic</option>
                  </select>
                </label>

                <label className="block text-xs font-bold">
                  Header style
                  <select
                    className="pc-select w-full mt-1"
                    value={appearance.headerStyle ?? (appearance.themePreset === "christmas" ? "festive" : "plain")}
                    onChange={(e) =>
                      setAppearance((prev) => ({
                        ...prev,
                        headerStyle: e.target.value as "plain" | "festive",
                      }))
                    }
                  >
                    <option value="plain">Plain</option>
                    <option value="festive">Festive decorations</option>
                  </select>
                </label>

                <label className="block text-xs font-bold">
                  Tile style
                  <select
                    className="pc-select w-full mt-1"
                    value={appearance.tileStyle ?? "rounded"}
                    onChange={(e) =>
                      setAppearance((prev) => ({
                        ...prev,
                        tileStyle: e.target.value as PdfTileStyle,
                        tileGapMm: e.target.value === "compactSquare" ? 0 : prev.tileGapMm ?? 2,
                      }))
                    }
                  >
                    <option value="square">Square</option>
                    <option value="rounded">Rounded square</option>
                    <option value="circle">Circle</option>
                    <option value="compactSquare">Compact square (no gap)</option>
                  </select>
                </label>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <label htmlFor="tile-opacity">Tile fill opacity</label>
                    <span className="font-normal text-muted">{Math.round((appearance.tileOpacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    id="tile-opacity"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={appearance.tileOpacity ?? 1}
                    onChange={(e) => setAppearance((prev) => ({ ...prev, tileOpacity: Number(e.target.value) }))}
                    className="w-full cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <label htmlFor="tile-gap">Tile gap</label>
                    <span className="font-normal text-muted">
                      {appearance.tileStyle === "compactSquare" ? "0 mm" : `${appearance.tileGapMm ?? 2} mm`}
                    </span>
                  </div>
                  <input
                    id="tile-gap"
                    type="range"
                    min={0}
                    max={6}
                    step={0.5}
                    disabled={appearance.tileStyle === "compactSquare"}
                    value={appearance.tileStyle === "compactSquare" ? 0 : appearance.tileGapMm ?? 2}
                    onChange={(e) => setAppearance((prev) => ({ ...prev, tileGapMm: Number(e.target.value) }))}
                    className="w-full cursor-pointer disabled:opacity-40"
                  />
                </div>

                <label className="block text-xs font-bold">
                  Title font
                  <select
                    className="pc-select w-full mt-1"
                    value={appearance.titleFontFamily ?? "helvetica"}
                    onChange={(e) => setAppearance((prev) => ({ ...prev, titleFontFamily: e.target.value as PdfFontFamily }))}
                  >
                    <option value="helvetica">Helvetica / clean</option>
                    <option value="times">Times / classic</option>
                    <option value="courier">Courier / retro</option>
                  </select>
                </label>

                <label className="block text-xs font-bold">
                  Cell font
                  <select
                    className="pc-select w-full mt-1"
                    value={appearance.cellFontFamily ?? "helvetica"}
                    onChange={(e) => setAppearance((prev) => ({ ...prev, cellFontFamily: e.target.value as PdfFontFamily }))}
                  >
                    <option value="helvetica">Helvetica / legible</option>
                    <option value="times">Times / classic</option>
                    <option value="courier">Courier / mono</option>
                  </select>
                </label>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <label htmlFor="title-size">Title size</label>
                    <span className="font-normal text-muted">{appearance.titleSizePt ?? 22} pt</span>
                  </div>
                  <input
                    id="title-size"
                    type="range"
                    min={12}
                    max={36}
                    step={1}
                    value={appearance.titleSizePt ?? 22}
                    onChange={(e) => setAppearance((prev) => ({ ...prev, titleSizePt: Number(e.target.value) }))}
                    className="w-full cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold inline-flex items-center gap-2">
                    <ImagePlus className="w-4 h-4" />
                    Card background
                  </p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="block w-full text-xs"
                    onChange={(e) => void handleBackgroundUpload(e.target.files?.[0])}
                  />
                  {appearance.background && (
                    <>
                      <div className="flex items-center gap-2">
                        <select
                          className="pc-select flex-1"
                          value={appearance.background.mode}
                          onChange={(e) =>
                            setAppearance((prev) => ({
                              ...prev,
                              background: prev.background
                                ? { ...prev.background, mode: e.target.value as "fullPage" | "cardWatermark" }
                                : prev.background,
                            }))
                          }
                        >
                          <option value="cardWatermark">Card watermark</option>
                          <option value="fullPage">Full card page</option>
                        </select>
                        <Button type="button" onClick={() => setAppearance((prev) => ({ ...prev, background: undefined }))} title="Remove background">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <label className="block text-xs font-bold">
                        Background opacity · {Math.round((appearance.background.opacity ?? 0.14) * 100)}%
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={appearance.background.opacity ?? 0.14}
                          onChange={(e) =>
                            setAppearance((prev) => ({
                              ...prev,
                              background: prev.background
                                ? { ...prev.background, opacity: Number(e.target.value) }
                                : prev.background,
                            }))
                          }
                          className="w-full cursor-pointer"
                        />
                      </label>
                    </>
                  )}
                  <p className="text-[11px] text-muted">Backgrounds apply to card pages only and stay local to this browser.</p>
                </div>

                <Button type="button" className="w-full" onClick={resetAppearance}>
                  Reset appearance
                </Button>
              </div>
              )}

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
                        min={10}
                        max={200}
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

              <label className="flex items-start gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeShareQr}
                  onChange={(e) => setIncludeShareQr(e.target.checked)}
                />
                <span>
                  Show deck sharing QR code
                  <span className="block font-normal text-muted mt-0.5">
                    Lets players scan to view or add this deck on their phone. This is separate from the card verification QR.
                  </span>
                  {!isShareApiConfigured() && (
                    <span className="block font-normal text-pc-warning mt-0.5">
                      Sharing is not configured, so this QR will not appear.
                    </span>
                  )}
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

        <div className="lg:col-span-7 space-y-3 order-1 lg:order-2">
          <label className="block text-xs font-bold">
            Game / Event Title
            <textarea
              className="w-full mt-1 pc-input min-h-[68px] resize-y"
              value={customTitle}
              maxLength={EVENT_TITLE_MAX}
              rows={2}
              onChange={(e) => setCustomTitle(e.target.value)}
              onBlur={() => setCustomTitle((current) => current.trim())}
              placeholder={EVENT_TITLE_PLACEHOLDER}
            />
            <span className="block mt-1 text-[11px] font-normal text-muted text-right">
              {customTitle.length}/{EVENT_TITLE_MAX} · shown on printed cards · blank uses “{DEFAULT_EVENT_TITLE}”
            </span>
          </label>

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
              <PdfCardPreview
                card={currentCard}
                eventTitle={eventTitle}
                deckName={deck.name}
                tracks={deck.tracks}
                cellContent={cellContent}
                cellContentSizes={cellContentSizes}
                shareUrl={includeShareQr ? shareUrl : null}
                verificationCode={currentVerificationCode}
                appearance={appearance}
                cardIndex={activePreviewIndex}
              />
            </Window>
          ) : (
            previewEmptyState
          )}
        </div>
      </div>
    </div>
  );
};
