import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Window, Modal } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { EMPTY_DECK_ACTION_TITLE, isEmptyDeck } from "../lib/decks/discardable";
import { Deck } from "../types/deck";
import { getUnplayableTracks } from "../lib/youtube/validator";
import { canStartGame } from "../lib/youtube/playabilityGate";
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
} from "lucide-react";

export const HomePage: React.FC = () => {
  const { decks, createDeck, deleteDeck, duplicateDeck, shareDeck } = useDeck();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);

  const handleCreateEmptyDeck = () => {
    const now = new Date().toISOString();
    const saved = createDeck({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: "New Custom Deck",
      createdAt: now,
      updatedAt: now,
      source: { type: "manual" },
      tracks: [],
    });
    navigate(`/deck/${saved.id}`);
  };

  const showEmptyDeckAddTile = !isMobile;

  const newDeckButton = (
    <button
      type="button"
      className="pc-titlebar-btn"
      onClick={handleCreateEmptyDeck}
      aria-label="New empty deck"
      title="New empty deck"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <Window
      fill
      title="Your bingo decks"
      className="home-decks"
      titleBarProps={{ controls: showEmptyDeckAddTile ? undefined : newDeckButton }}
    >
      <p className="home-decks-intro text-sm mb-4">
        {isMobile
          ? "Match clips, print cards, and host bingo."
          : "Match YouTube clips, print bingo sheets, or launch the host board."}
      </p>

      <div className="home-decks-grid">
        {showEmptyDeckAddTile && (
          <button
            type="button"
            className="home-deck-add"
            onClick={handleCreateEmptyDeck}
          >
            <span className="font-semibold text-sm">+ Empty deck</span>
            <span className="text-xs opacity-75">Add songs in the editor</span>
          </button>
        )}

        {decks.map((deck) => {
          const matchedCount = deck.tracks.filter(
            (t) => t.matchStatus === "matched" || t.matchStatus === "manual"
          ).length;
          const attentionCount = getUnplayableTracks(deck.tracks).length;
          const emptyDeck = isEmptyDeck(deck);
          const playReady = canStartGame(deck.tracks);
          const cardsDisabledTitle = emptyDeck
            ? EMPTY_DECK_ACTION_TITLE
            : "Fix song issues in Edit before printing cards";

          const statsLine = (
            <p className="home-deck-card-stats text-xs">
              {deck.tracks.length} tracks · {matchedCount}/{deck.tracks.length} matched
              {attentionCount > 0 ? (
                <span className="text-pc-warning font-semibold">
                  {" "}
                  · {attentionCount} need attention
                </span>
              ) : null}
            </p>
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
              disabled: !playReady,
              title: playReady ? undefined : cardsDisabledTitle,
            },
            {
              icon: <Trash2 className="w-4 h-4" />,
              label: "Delete",
              destructive: true,
              onClick: () => setDeckToDelete(deck),
            },
          ];

          if (isMobile) {
            const mobileOverflowItems = playReady
              ? [
                  {
                    icon: <Edit3 className="w-4 h-4" />,
                    label: "Edit",
                    onClick: () => navigate(`/deck/${deck.id}`),
                  },
                  ...overflowItems,
                ]
              : overflowItems;

            return (
              <article key={deck.id} className="home-deck-card">
                <div className="home-deck-card-body">
                  <Music className="home-deck-card-icon w-5 h-5 shrink-0" aria-hidden />
                  <div className="home-deck-card-info min-w-0">
                    <h3 className="home-deck-card-title text-sm font-semibold truncate">
                      {deck.name}
                    </h3>
                    {statsLine}
                  </div>
                </div>
                <div className="home-deck-card-actions home-deck-card-actions--mobile">
                  {playReady ? (
                    <Link
                      to={`/deck/${deck.id}/play`}
                      className="pc-button pc-button--primary home-deck-card-primary"
                    >
                      <Radio className="w-4 h-4" />
                      Play
                    </Link>
                  ) : (
                    <Link
                      to={`/deck/${deck.id}`}
                      className="pc-button pc-button--primary home-deck-card-primary"
                    >
                      <Edit3 className="w-4 h-4" />
                      Edit
                      {attentionCount > 0 ? " ⚠" : ""}
                    </Link>
                  )}
                  <OverflowMenu
                    items={mobileOverflowItems}
                    ariaLabel={`More actions for ${deck.name}`}
                  />
                </div>
              </article>
            );
          }

          return (
            <article key={deck.id} className="home-deck-card">
              <div className="home-deck-card-body">
                <Music className="home-deck-card-icon w-6 h-6 shrink-0" aria-hidden />
                <div className="home-deck-card-info min-w-0 flex-1">
                  <h3 className="home-deck-card-title text-sm font-semibold truncate">
                    {deck.name}
                  </h3>
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
                  <button
                    type="button"
                    className="pc-button"
                    onClick={() => setDeckToDelete(deck)}
                    title="Delete deck"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <Link
                  to={`/deck/${deck.id}`}
                  className="pc-button home-deck-card-action-edit"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </Link>
                {playReady ? (
                  <Link
                    to={`/deck/${deck.id}/cards`}
                    className="pc-button home-deck-card-action-cards"
                    title="Print bingo cards"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Cards
                  </Link>
                ) : (
                  <span title={cardsDisabledTitle} className="contents">
                    <Link
                      to="#"
                      className="pc-button home-deck-card-action-cards opacity-60 pointer-events-none"
                      aria-disabled
                      tabIndex={-1}
                      onClick={(e) => e.preventDefault()}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Cards
                      {attentionCount > 0 ? " ⚠" : ""}
                    </Link>
                  </span>
                )}
                <Link
                  to={playReady ? `/deck/${deck.id}/play` : "#"}
                  className={`pc-button home-deck-card-action-play ${playReady ? "pc-button--primary" : "opacity-60 pointer-events-none"}`}
                  aria-disabled={!playReady}
                  title={
                    playReady
                      ? "Host live game"
                      : emptyDeck
                        ? EMPTY_DECK_ACTION_TITLE
                        : "Some songs need attention before hosting"
                  }
                  onClick={(e) => {
                    if (!playReady) e.preventDefault();
                  }}
                >
                  <Radio className="w-3.5 h-3.5" />
                  Play
                  {!playReady && attentionCount > 0 ? " ⚠" : ""}
                </Link>
              </div>
            </article>
          );
        })}
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
            Delete <strong>{deckToDelete.name}</strong> and all {deckToDelete.tracks.length} songs?
            This cannot be undone.
          </p>
        </Modal>
      )}
    </Window>
  );
};
