import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Window, Modal } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { EMPTY_DECK_ACTION_TITLE, isEmptyDeck } from "../lib/decks/discardable";
import { Deck } from "../types/deck";
import {
  formatReadinessPrimary,
  formatReadinessSecondary,
  getDeckReadiness,
  getNextDeckName,
} from "../lib/decks/readiness";
import { SAMPLE_POP_HITS_DECK } from "../lib/storage/mockDeck";
import { saveStoredDecks } from "../lib/storage/decks";
import { OverflowMenu } from "../components/ui/OverflowMenu";
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
} from "lucide-react";

const ONBOARDING_KEY = "mb_onboarding_dismissed";
const SAMPLE_DECK_ID = SAMPLE_POP_HITS_DECK.id;

function healthBadgeLabel(health: ReturnType<typeof getDeckReadiness>["health"], blocked: number): string {
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
  const { decks, createDeck, deleteDeck, duplicateDeck, shareDeck } = useDeck();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem(ONBOARDING_KEY)
  );

  const sortedDecks = useMemo(() => {
    return [...decks].sort((a, b) => {
      if (a.id === SAMPLE_DECK_ID) return -1;
      if (b.id === SAMPLE_DECK_ID) return 1;
      const aReady = getDeckReadiness(a.tracks).health === "ready";
      const bReady = getDeckReadiness(b.tracks).health === "ready";
      if (aReady !== bReady) return aReady ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [decks]);

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  };

  const handleCreateEmptyDeck = () => {
    const now = new Date().toISOString();
    const saved = createDeck({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: getNextDeckName(decks.map((d) => d.name)),
      createdAt: now,
      updatedAt: now,
      source: { type: "manual" },
      tracks: [],
    });
    navigate(`/deck/${saved.id}`);
  };

  const handleRestoreSample = () => {
    const others = decks.filter((d) => d.id !== SAMPLE_DECK_ID);
    saveStoredDecks([SAMPLE_POP_HITS_DECK, ...others]);
    window.location.reload();
  };

  const renderDeckCard = (deck: Deck) => {
    const readiness = getDeckReadiness(deck.tracks);
    const emptyDeck = isEmptyDeck(deck);
    const hostReady = readiness.canHost;
    const fixHref = `/deck/${deck.id}?filter=blocked`;
    const secondary = formatReadinessSecondary(readiness);
    const isSample = deck.id === SAMPLE_DECK_ID;

    const statsLine = (
      <p className="home-deck-card-stats text-xs">
        {formatReadinessPrimary(readiness)}
        {secondary ? (
          <span className="text-pc-warning font-semibold"> · {secondary}</span>
        ) : null}
      </p>
    );

    const healthBadge = !emptyDeck ? (
      <span className={healthBadgeClass(readiness.health)}>
        {healthBadgeLabel(readiness.health, readiness.blockedCount)}
      </span>
    ) : null;

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
        disabled: emptyDeck,
        title: emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined,
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
    ) : readiness.blockedCount > 0 ? (
      <Link
        to={fixHref}
        className={`pc-button text-pc-warning ${isMobile ? "home-deck-card-primary" : "home-deck-card-action-play"}`}
        title="All songs must be playable before hosting"
      >
        {readiness.blockedCount} can&apos;t play — Fix now
      </Link>
    ) : (
      <span
        className={`pc-button opacity-60 pointer-events-none ${isMobile ? "home-deck-card-primary" : "home-deck-card-action-play"}`}
        title={
          emptyDeck
            ? EMPTY_DECK_ACTION_TITLE
            : readiness.tooFewForHost
              ? `Need at least ${readiness.minHostTracks} playable songs to host`
              : "Some songs need attention before hosting"
        }
      >
        <Radio className={isMobile ? "w-4 h-4" : "w-3.5 h-3.5"} />
        Host
      </span>
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
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="home-deck-card-title text-sm font-semibold truncate">{deck.name}</h3>
                {isSample && <span className="home-deck-recommended text-[10px] shrink-0">Recommended</span>}
              </div>
              {healthBadge}
              {statsLine}
              {!hostReady && readiness.blockedCount > 0 && (
                <Link to={fixHref} className="pc-link text-xs mt-1 inline-block">
                  {readiness.blockedCount} song{readiness.blockedCount === 1 ? "" : "s"} can&apos;t play — Fix now
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
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="home-deck-card-title text-sm font-semibold truncate">{deck.name}</h3>
              {isSample && <span className="home-deck-recommended text-[10px] shrink-0">Recommended</span>}
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
          {emptyDeck ? (
            <span title={EMPTY_DECK_ACTION_TITLE} className="contents">
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
          : "Match YouTube clips, print bingo sheets, or launch the host board."}
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
              to={`/deck/${SAMPLE_DECK_ID}/play`}
              className="pc-button pc-button--primary text-xs"
              onClick={dismissOnboarding}
            >
              Try sample deck
            </Link>
            <button type="button" className="pc-button text-xs" onClick={dismissOnboarding}>
              Got it
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
            <button type="button" className="pc-button" onClick={handleCreateEmptyDeck}>
              Create deck
            </button>
            <Link to="/import" className="pc-button">
              Import JSON
            </Link>
          </div>
        </div>
      )}

      <div className="home-decks-grid">
        <button type="button" className="home-deck-add" onClick={handleCreateEmptyDeck}>
          <Plus className="w-5 h-5 shrink-0 opacity-80" aria-hidden />
          <span className="font-semibold text-sm">Empty deck</span>
          <span className="text-xs text-muted">Add songs in the editor</span>
        </button>

        {sortedDecks.map(renderDeckCard)}
      </div>

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
