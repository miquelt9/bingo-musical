import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Window } from "@miquelt9/pc-ui";
import { AlertCircle, Download, Music2 } from "lucide-react";
import { BackButton } from "../components/ui/BackButton";
import { useDeck } from "../state/DeckContext";
import { fetchSharedDeckPayload, isShareApiConfigured } from "../lib/share/sharedDecksApi";
import { validateDeckSchema } from "../lib/storage/decks";
import { AlbumArt } from "../components/tracks/AlbumArt";
import { ClipPreviewButton } from "../components/tracks/ClipPreviewButton";
import { getProviderLabel } from "../lib/music/providers";
import { getYoutubeThumbnailUrl } from "../lib/youtube/parseUrl";

export const SharedDeckPage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { importSharedDeck, loadDeck } = useDeck();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);

  useEffect(() => {
    if (!shareId) {
      setError("Missing share link id.");
      setIsLoading(false);
      return;
    }

    if (!isShareApiConfigured()) {
      setError("Link sharing is not configured for this site yet.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void fetchSharedDeckPayload(shareId)
      .then((data) => {
        if (cancelled) return;
        const validation = validateDeckSchema(data);
        if (!validation.isValid || !validation.deck) {
          setError(validation.error || "This shared deck is invalid.");
          return;
        }
        setPayload(data);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const preview = useMemo(() => {
    if (!payload) return null;
    const validation = validateDeckSchema(payload);
    if (!validation.isValid || !validation.deck) return null;
    return validation.deck;
  }, [payload]);

  const handleImport = async () => {
    if (!shareId) return;
    setIsImporting(true);
    setError(null);
    try {
      const imported = await importSharedDeck(shareId);
      loadDeck(imported.id);
      navigate(`/deck/${imported.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <BackButton fallbackTo="/" fallbackLabel="All decks" className="inline-flex" />

      <Window title="Shared Musical Bingo deck">
        {isLoading ? (
          <p className="text-sm">Loading shared deck…</p>
        ) : error ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-xs pc-bevel-inset p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <p className="text-xs">
              You can still import a deck file manually on the{" "}
              <Link to="/import" className="pc-link">
                import page
              </Link>
              .
            </p>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="pc-bevel-inset p-4">
              <div className="flex items-start gap-3">
                <Music2 className="w-8 h-8 shrink-0 opacity-70" />
                <div>
                  <h2 className="font-bold text-base">{preview.name}</h2>
                  <p className="text-sm mt-1">
                    {getProviderLabel(preview.provider)} · {preview.tracks.length} song{preview.tracks.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </div>

            <div className="pc-bevel-inset p-3 max-h-56 overflow-y-auto">
              <p className="text-xs font-bold mb-2">Songs</p>
              <ul className="text-xs space-y-1">
                {preview.tracks.map((track) => {
                  const thumbnailUrl = track.albumArtUrl || (track.media?.provider === "youtube" ? getYoutubeThumbnailUrl(track.media.id, "mqdefault") : "");
                  return (
                    <li key={track.id} className="flex items-center gap-2">
                      {thumbnailUrl ? <AlbumArt src={thumbnailUrl} alt="" className="w-9 h-9 object-cover shrink-0 pc-bevel-inset" /> : <Music2 className="w-7 h-7 shrink-0 opacity-60" />}
                      <span className="min-w-0 flex-1 truncate">{track.artist} — {track.title}</span>
                      {track.media ? <ClipPreviewButton track={track} size="sm" /> : <span className="text-pc-warning">Unavailable</span>}
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="text-sm">
              This is a read-only snapshot. Adding it copies the deck into your browser so you can print cards or
              host a game.
            </p>

            <Button type="button" variant="primary" disabled={isImporting} onClick={() => void handleImport()}>
              <Download className="w-4 h-4" />
              {isImporting ? "Adding…" : "Add to my decks"}
            </Button>
          </div>
        ) : null}
      </Window>
    </div>
  );
};
