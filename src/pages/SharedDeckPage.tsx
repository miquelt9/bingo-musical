import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Window } from "@miquelt9/pc-ui";
import { AlertCircle, Download, Music2 } from "lucide-react";
import { BackButton } from "../components/ui/BackButton";
import { useDeck } from "../state/DeckContext";
import { fetchSharedDeckPayload, isShareApiConfigured } from "../lib/share/sharedDecksApi";
import { validateDeckSchema } from "../lib/storage/decks";
import { ClipPreviewButton } from "../components/tracks/ClipPreviewButton";
import { deezerHitToTrack, resolveDeezerTrack } from "../lib/deezer/api";
import { getProviderLabel } from "../lib/music/providers";

export const SharedDeckPage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { importSharedDeck } = useDeck();
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

  useEffect(() => {
    if (!preview || preview.provider !== "deezer") return;
    const missing = preview.tracks.filter((track) => track.media?.provider === "deezer" && !track.media.previewUrl);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map(async (track) => {
      try {
        return { sourceId: track.media!.id, hit: await resolveDeezerTrack(track.media!.id) };
      } catch {
        return null;
      }
    })).then((resolved) => {
      if (cancelled) return;
      const byId = new Map(resolved.filter((item): item is NonNullable<typeof item> => item !== null).map((item) => [item.sourceId, item.hit]));
      if (byId.size === 0) return;
      setPayload((current: unknown) => {
        const validation = validateDeckSchema(current);
        if (!validation.deck) return current;
        return {
          ...validation.deck,
          tracks: validation.deck.tracks.map((track) => {
            const hit = track.media?.provider === "deezer" ? byId.get(track.media.id) : undefined;
            if (!hit) return track;
            const resolvedTrack = deezerHitToTrack(hit);
            return { ...track, album: resolvedTrack.album, albumArtUrl: resolvedTrack.albumArtUrl, durationMs: resolvedTrack.durationMs, media: resolvedTrack.media, startTime: resolvedTrack.startTime, endTime: resolvedTrack.endTime, matchStatus: "matched" as const };
          }),
        };
      });
    });
    return () => { cancelled = true; };
  }, [preview]);

  const handleImport = async () => {
    if (!shareId) return;
    setIsImporting(true);
    setError(null);
    try {
      const imported = await importSharedDeck(shareId);
      navigate(`/deck/${imported.id}`);
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
                {preview.tracks.slice(0, 12).map((track) => (
                  <li key={track.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{track.artist} — {track.title}</span>
                    {track.media ? <ClipPreviewButton track={track} size="sm" /> : <span className="text-pc-warning">Unavailable</span>}
                  </li>
                ))}
                {preview.tracks.length > 12 ? (
                  <li className="opacity-70">…and {preview.tracks.length - 12} more</li>
                ) : null}
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
