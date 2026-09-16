import React, { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Window, Modal } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { EMPTY_DECK_ACTION_TITLE, isAbandonedEmptyDeck, isEmptyDeck } from "../lib/decks/discardable";
import { Deck, MusicProvider } from "../types/deck";
import {
  formatReadinessPrimary,
  formatReadinessSecondary,
  getDeckReadiness,
  getNextDeckName,
  MIN_CARDS_TRACKS,
} from "../lib/decks/readiness";
import { SAMPLE_DEEZER_DECK } from "../lib/storage/mockDeck";
import { saveStoredDecks } from "../lib/storage/decks";
import { getCachedEmbedStatus, validateTracksEmbeddability } from "../lib/youtube/validator";
import { getProviderLabel } from "../lib/music/providers";
import { OverflowMenu } from "../components/ui/OverflowMenu";

import { PcModal } from "../components/ui/PcModal";
import { useIsMobile } from "../hooks/useMediaQuery";
import {
  Music,
  Plus,
  Edit3,
  Radio,
  Printer,
  Copy,
  Trash2,
  Share2,

  X,
  Sparkles,
  Music2,
  Disc3,
  Users,
} from "lucide-react";

const ONBOARDING_KEY = "mb_onboarding_dismissed";
const SAMPLE_DECK_ID = SAMPLE_DEEZER_DECK.id;

function healthBadgeLabel(health: ReturnType<typeof getDeckReadiness>["health"], blocked: number, empty: boolean): string {
  if (empty) return "In progress";
  switch (health) {
    case "ready":
      return "Ready";
    case "needs_fix":
      return blocked > 0 ? `Needs fix (${blocked})` : "Needs fix";
    case "empty":
      return "Empty";
    case "too_few":
      return "Too few songs";
    default:
      return "";
  }
}

function healthBadgeClass(health: ReturnType<typeof getDeckReadiness>["health"]): string {
  switch (health) {
    case "ready":
      return "home-deck-health home-deck-health--ready";
    case "needs_fix":
      return "home-deck-health home-deck-health--warn";
    case "too_few":
      return "home-deck-health home-deck-health--warn";
    default:
      return "home-deck-health home-deck-health--muted";
  }
}

export const HomePage: React.FC = () => {
  const { decks, createDeck, deleteDeck, duplicateDeck, shareDeck, backgroundTasks } = useDeck();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);

  const [deckNamePrompt, setDeckNamePrompt] = useState<{ provider: MusicProvider; defaultName: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem(ONBOARDING_KEY)
  );
  const [verifyTick, setVerifyTick] = useState(0);

  useEffect(() => {
    const uncached = decks.flatMap((d) =>
      d.tracks.filter((t) => t.media?.provider === "youtube" && !getCachedEmbedStatus(t.media.id))
    );
    if (uncached.length === 0) return;

    let cancelled = false;
    void validateTracksEmbeddability(uncached, 3).then(() => {
      if (!cancelled) setVerifyTick((tick) => tick + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [decks]);

  // Drop abandoned empty "New deck" drafts so Home stays tidy.
  useEffect(() => {
    const abandoned = decks.filter(isAbandonedEmptyDeck);
    if (abandoned.length === 0) return;
    for (const deck of abandoned) {
      deleteDeck(deck.id);
    }
  }, [decks, deleteDeck]);

  const sortedDecks = useMemo(() => {
    return [...decks].sort((a, b) => {
      if (a.id === SAMPLE_DECK_ID) return -1;
      if (b.id === SAMPLE_DECK_ID) return 1;
      const aReady = getDeckReadiness(a.tracks).health === "ready";
      const bReady = getDeckReadiness(b.tracks).health === "ready";
      if (aReady !== bReady) return aReady ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [decks, verifyTick]);

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  };

  const handleCreateEmptyDeck = (provider: MusicProvider = "youtube") => {
    setDeckNamePrompt({
      provider,
      defaultName: getNextDeckName(decks.map((d) => d.name)),
    });
  };

  const createNamedDeck = (entered: string) => {
    if (!deckNamePrompt) return;
    const { defaultName } = deckNamePrompt;
    const name = entered.trim() || defaultName;
    const provider = deckNamePrompt.provider;
    const now = new Date().toISOString();
    const saved = createDeck({
      schemaVersion: 2,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name,
      createdAt: now,
      updatedAt: now,
      provider,
      source: { type: "manual" },
      tracks: [],
    });
    setDeckNamePrompt(null);
    navigate(`/deck/${saved.id}`);
  };

  const handleRestoreSample = () => {
    const others = decks.filter(
      (d) => d.id !== SAMPLE_DECK_ID && d.id !== "deck-sample-pop-classics"
    );
    saveStoredDecks([SAMPLE_DEEZER_DECK, ...others]);
    window.location.reload();
  };

  const renderDeckCard = (deck: Deck) => {
    const readiness = getDeckReadiness(deck.tracks);
    const emptyDeck = isEmptyDeck(deck);
    const deezerHydration = backgroundTasks[`deezer-hydration:${deck.id}`];
    const isLoadingDeezerPreviews = Boolean(deezerHydration);
    const hostReady = readiness.canHost;
    const fixHref = `/deck/${deck.id}?filter=blocked`;
    const secondary = formatReadinessSecondary(readiness);
    const isSample = deck.id === SAMPLE_DECK_ID;
    const isCollaborative = Boolean(deck.collaboration?.id);

    const statsLine = (
      <p className="home-deck-card-stats text-xs">
        {emptyDeck
          ? "0 songs — add tracks in the editor"
          : isLoadingDeezerPreviews
            ? `Loading Deezer previews… (${deezerHydration.completed}/${deezerHydration.total})`
            : formatReadinessPrimary(readiness)}
        {!emptyDeck && !isLoadingDeezerPreviews && secondary ? (
          <span className="text-pc-warning font-semibold"> · {secondary}</span>
        ) : null}
      </p>
    );

    const healthBadge = (
      <span className={healthBadgeClass(emptyDeck || isLoadingDeezerPreviews ? "empty" : readiness.health)}>
        {isLoadingDeezerPreviews ? "Loading…" : healthBadgeLabel(readiness.health, readiness.blockedCount, emptyDeck)}
      </span>
    );

    const overflowItems = [
      {
        icon: <Share2 className="w-4 h-4" />,
        label: "Share",
        onClick: () => shareDeck(deck),
        disabled: emptyDeck,
        title: emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined,
      },

      {
        icon: <Copy className="w-4 h-4" />,
        label: "Duplicate",
        onClick: () => duplicateDeck(deck.id),
      },
      {
        icon: <Printer className="w-4 h-4" />,
        label: "Cards",
        onClick: () => navigate(`/deck/${deck.id}/cards`),
        disabled: emptyDeck || deck.tracks.length < MIN_CARDS_TRACKS,
        title: emptyDeck
          ? EMPTY_DECK_ACTION_TITLE
          : deck.tracks.length < MIN_CARDS_TRACKS
            ? `Need at least ${MIN_CARDS_TRACKS} songs for bingo cards`
            : undefined,
      },
      {
        icon: <Trash2 className="w-4 h-4" />,
        label: "Delete",
        destructive: true,
        onClick: () => setDeckToDelete(deck),
      },
    ];

    const hostAction = hostReady ? (
      <Link
        to={`/deck/${deck.id}/play`}
        className={`pc-button pc-button--primary ${isMobile ? "home-deck-card-primary" : "home-deck-card-action-play"}`}
        title="Host a live game"
      >
        <Radio className={isMobile ? "w-4 h-4" : "w-3.5 h-3.5"} />
        Host
      </Link>
    ) : (
      <button
        type="button"
        disabled
        className={`pc-button opacity-60 ${isMobile ? "home-deck-card-primary" : "home-deck-card-action-play"}`}
        title={
          emptyDeck
            ? EMPTY_DECK_ACTION_TITLE
            : readiness.blockedCount > 0
              ? "Fix songs in Edit before hosting"
              : readiness.tooFewForHost
                ? `Add at least ${readiness.minHostTracks} playable songs before hosting`
                : "Some songs need attention before hosting"
        }
      >
        <Radio className={isMobile ? "w-4 h-4" : "w-3.5 h-3.5"} />
        Host
      </button>
    );

    if (isMobile) {
      const mobileOverflowItems = [
        {
          icon: <Edit3 className="w-4 h-4" />,
          label: "Edit deck",
          onClick: () => navigate(`/deck/${deck.id}`),
        },
        ...overflowItems,
      ];

      return (
        <article key={deck.id} className="home-deck-card">
          <div className="home-deck-card-body">
            <Music className="home-deck-card-icon w-5 h-5 shrink-0" aria-hidden />
            <div className="home-deck-card-info min-w-0">
              <div className="flex flex-col gap-1.5 min-w-0">
                <h3 className="home-deck-card-title text-sm font-semibold line-clamp-2" title={deck.name}>
                  {deck.name}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="home-deck-recommended text-[10px] shrink-0">{getProviderLabel(deck.provider)}</span>
                  {isCollaborative && (
                    <span
                      className="inline-flex items-center shrink-0"
                      title="Collaborative deck"
                      aria-label="Collaborative deck"
                    >
                      <Users className="w-4 h-4" aria-hidden />
                    </span>
                  )}
                  {isSample && <span className="home-deck-recommended text-[10px] shrink-0">Recommended</span>}
                </div>
              </div>
              {healthBadge}
              {statsLine}
              {!isLoadingDeezerPreviews && !hostReady && readiness.blockedCount > 0 && (
                <Link to={fixHref} className="pc-link text-xs mt-1 inline-block">
                  Open editor to fix songs
                </Link>
              )}
            </div>
          </div>
          <div className="home-deck-card-actions home-deck-card-actions--mobile">
            {hostReady ? hostAction : (
              <Link to={`/deck/${deck.id}`} className="pc-button pc-button--primary home-deck-card-primary">
                <Edit3 className="w-4 h-4" />
                Edit deck
              </Link>
            )}
            {!hostReady && hostAction}
            <OverflowMenu items={mobileOverflowItems} ariaLabel={`More actions for ${deck.name}`} />
          </div>
        </article>
      );
    }

    return (
      <article key={deck.id} className="home-deck-card">
        <div className="home-deck-card-body">
          <Music className="home-deck-card-icon w-6 h-6 shrink-0" aria-hidden />
          <div className="home-deck-card-info min-w-0 flex-1">
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <h3 className="home-deck-card-title text-sm font-semibold line-clamp-2" title={deck.name}>
                {deck.name}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="home-deck-recommended text-[10px] shrink-0">{getProviderLabel(deck.provider)}</span>
                {isCollaborative && (
                  <span
                    className="inline-flex items-center shrink-0"
                    title="Collaborative deck"
                    aria-label="Collaborative deck"
                  >
                    <Users className="w-4 h-4" aria-hidden />
                  </span>
                )}
                {isSample && <span className="home-deck-recommended text-[10px] shrink-0">Recommended</span>}
              </div>
            </div>
            {healthBadge}
            {statsLine}
          </div>
        </div>
        <div className="home-deck-card-actions home-deck-card-actions--desktop">
          <div className="home-deck-card-toolbar home-deck-card-toolbar--above-play">
            <button
              type="button"
              className="pc-button"
              onClick={() => shareDeck(deck)}
              disabled={emptyDeck}
              title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : "Share deck"}
            >
              <Share2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              className="pc-button"
              onClick={() => duplicateDeck(deck.id)}
              title="Duplicate deck"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button type="button" className="pc-button" onClick={() => setDeckToDelete(deck)} title="Delete deck">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <Link to={`/deck/${deck.id}`} className="pc-button home-deck-card-action-edit">
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </Link>
          {emptyDeck || deck.tracks.length < MIN_CARDS_TRACKS ? (
            <span
              title={
                emptyDeck
                  ? EMPTY_DECK_ACTION_TITLE
                  : `Need at least ${MIN_CARDS_TRACKS} songs for bingo cards`
              }
              className="contents"
            >
              <span className="pc-button home-deck-card-action-cards opacity-60 pointer-events-none" aria-disabled>
                <Printer className="w-3.5 h-3.5" />
                Cards
              </span>
            </span>
          ) : (
            <Link to={`/deck/${deck.id}/cards`} className="pc-button home-deck-card-action-cards" title="Print bingo cards">
              <Printer className="w-3.5 h-3.5" />
              Cards
            </Link>
          )}
          {hostAction}
        </div>
      </article>
    );
  };

  const onlyEmptyCustom = decks.length === 0 || decks.every((d) => isEmptyDeck(d));

  return (
    <Window fill title="Your bingo decks" className="home-decks">
      <p className="home-decks-intro text-sm mb-1">
        {isMobile
          ? "Match clips, print cards, and host bingo."
          : "Match songs, print bingo sheets, or launch the host board."}
      </p>
      <p className="text-xs text-muted mb-4">Decks saved on this device only.</p>

      {showOnboarding && (
        <div className="pc-bevel-inset p-3 mb-4 text-sm relative">
          <button
            type="button"
            className="absolute top-2 right-2 pc-button p-1"
            onClick={dismissOnboarding}
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <p className="font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Quick start
          </p>
          <ol className="text-xs space-y-1 list-decimal list-inside mb-3">
            <li>Pick or create a deck</li>
            <li>Match YouTube clips (sample deck is ready)</li>
            <li>Print bingo cards</li>
            <li>Host and press Space to call songs</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/deck/${SAMPLE_DECK_ID}`}
              className="pc-button pc-button--primary text-xs"
              onClick={dismissOnboarding}
            >
              See sample deck
            </Link>
            <button type="button" className="pc-button text-xs" onClick={dismissOnboarding}>
              Don&apos;t show again
            </button>
          </div>
        </div>
      )}

      {onlyEmptyCustom && (
        <div className="pc-bevel-inset p-4 mb-4 text-sm text-center">
          <p className="mb-3">Create a deck or restore the sample to get started.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="pc-button pc-button--primary" onClick={handleRestoreSample}>
              Restore sample deck
            </button>
            <button type="button" className="pc-button" onClick={() => handleCreateEmptyDeck("youtube")}>
              Create YouTube deck
            </button>
            <button type="button" className="pc-button" onClick={() => handleCreateEmptyDeck("deezer")}>
              Create Deezer deck
            </button>
            <Link to="/import" className="pc-button">
              Import JSON
            </Link>
          </div>
        </div>
      )}

      <div className="home-decks-grid">
        <div
          className="home-deck-add home-deck-add--providers"
          onClick={() => handleCreateEmptyDeck("deezer")}
        >
          <Plus className="w-5 h-5 shrink-0 opacity-80" aria-hidden />
          <span className="font-semibold text-sm">Empty deck</span>
          <span className="text-xs text-muted">Choose a music provider</span>
          <div className="home-deck-add-options">
            <button
              type="button"
              className="home-deck-add-option"
              onClick={(event) => {
                event.stopPropagation();
                handleCreateEmptyDeck("youtube");
              }}
            >
              <Music2 className="w-5 h-5 opacity-80" aria-hidden />
              <span className="font-semibold text-xs">YouTube</span>
            </button>
            <button
              type="button"
              className="home-deck-add-option"
              onClick={(event) => {
                event.stopPropagation();
                handleCreateEmptyDeck("deezer");
              }}
            >
              <Disc3 className="w-5 h-5 opacity-80" aria-hidden />
              <span className="font-semibold text-xs">Deezer</span>
            </button>
          </div>
        </div>

        {sortedDecks.map(renderDeckCard)}
      </div>

      {deckNamePrompt && (
        <PcModal title="Create a deck" onClose={() => setDeckNamePrompt(null)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("deck-name");
              createNamedDeck(input instanceof HTMLInputElement ? input.value : "");
            }}
          >
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Music provider</legend>
              <label className="flex items-start gap-2 pc-bevel-inset p-2 cursor-pointer">
                <input
                  type="radio"
                  name="new-deck-provider"
                  value="youtube"
                  checked={deckNamePrompt.provider === "youtube"}
                  onChange={() => setDeckNamePrompt((current) => current ? { ...current, provider: "youtube" } : current)}
                  className="mt-1"
                />
                <span className="flex items-start gap-2 text-sm">
                  <Music2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                  <span><strong>YouTube</strong><span className="block text-xs text-muted">Video clips, fully customizable; YouTube ads may appear.</span></span>
                </span>
              </label>
              <label className="flex items-start gap-2 pc-bevel-inset p-2 cursor-pointer">
                <input
                  type="radio"
                  name="new-deck-provider"
                  value="deezer"
                  checked={deckNamePrompt.provider === "deezer"}
                  onChange={() => setDeckNamePrompt((current) => current ? { ...current, provider: "deezer" } : current)}
                  className="mt-1"
                />
                <span className="flex items-start gap-2 text-sm">
                  <Disc3 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                  <span><strong>Deezer</strong><span className="block text-xs text-muted">Predefined 30-second previews, ad-free.</span></span>
                </span>
              </label>
            </fieldset>
            <label className="block text-sm font-semibold" htmlFor="new-deck-name">
              Deck name
              <input id="new-deck-name" name="deck-name" type="text" className="pc-input w-full mt-1" defaultValue={deckNamePrompt.defaultName} autoFocus />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="pc-button" onClick={() => setDeckNamePrompt(null)}>Cancel</button>
              <button type="submit" className="pc-button pc-button--primary">Create deck</button>
            </div>
          </form>
        </PcModal>
      )}


      {deckToDelete && (
        <Modal
          open
          variant="danger"
          title="Delete deck"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            deleteDeck(deckToDelete.id);
            setDeckToDelete(null);
          }}
          onCancel={() => setDeckToDelete(null)}
        >
          <p>
            Delete <strong>{deckToDelete.name}</strong> and all {deckToDelete.tracks.length} songs? This cannot be
            undone.
          </p>
        </Modal>
      )}
    </Window>
  );
};
