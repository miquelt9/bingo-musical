import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Window } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { getNextDeckName } from "../lib/decks/readiness";
import { FolderOpen, Plus } from "lucide-react";

export const DeckNotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const { decks, createDeck } = useDeck();

  const handleCreateDeck = () => {
    const now = new Date().toISOString();
    const saved = createDeck({
      schemaVersion: 2,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: getNextDeckName(decks.map((d) => d.name)),
      createdAt: now,
      updatedAt: now,
      provider: "youtube",
      source: { type: "manual" },
      tracks: [],
    });
    navigate(`/deck/${saved.id}`);
  };

  return (
    <Window title="Deck not found">
      <div className="text-center py-8 space-y-4 max-w-md mx-auto">
        <h2 className="text-lg font-bold">Deck not found</h2>
        <p className="text-sm text-muted">
          This deck may have been deleted or the link is invalid. Check the URL or pick another deck from your library.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/" className="pc-button inline-flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5" />
            Go to decks
          </Link>
          <Button type="button" variant="primary" onClick={handleCreateDeck}>
            <Plus className="w-3.5 h-3.5" />
            Create new deck
          </Button>
        </div>
      </div>
    </Window>
  );
};
