import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { AlertCircle, Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Deck, MusicProvider, Track } from "../../types/deck";
import { createTrack } from "../../lib/tracks";
import { deezerHitToTrack, DeezerTrackHit, searchDeezerTracksBatch } from "../../lib/deezer/api";
import { deezerMatchConfidence, normalizeMusicText } from "../../lib/deezer/matcher";
import { YoutubeSearchHit, guessTitleArtist, searchYoutubeVideos } from "../../lib/youtube/search";
import { checkVideoEmbeddable, getCachedEmbedStatus } from "../../lib/youtube/validator";
import { getProviderLabel } from "../../lib/music/providers";
import { PcModal } from "../ui/PcModal";
import { useDeck } from "../../state/DeckContext";

type Candidate =
  | { provider: "deezer"; hit: DeezerTrackHit; playable: boolean; confidence: "high" | "ambiguous" | "none" }
  | { provider: "youtube"; hit: YoutubeSearchHit; playable: boolean; confidence: "high" | "ambiguous" | "none" };

interface ConversionRow {
  source: Track;
  candidates: Candidate[];
  selected: number | null;
  status: "loading" | "matched" | "unmatched";
}

interface ConvertDeckModalProps {
  deck: Deck;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (deck: Deck) => Deck;
  onUpdateCreated?: (deck: Deck) => void;
}

const YOUTUBE_TRACK_DELAY_MS = 350;

function sameText(a: string, b: string): boolean {
  return normalizeMusicText(a) === normalizeMusicText(b);
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function rowFromCandidates(source: Track, candidates: Candidate[]): ConversionRow {
  const firstPlayable = candidates.find((candidate) => candidate.playable);
  const selected = firstPlayable ? candidates.indexOf(firstPlayable) : null;
  return {
    source,
    candidates,
    selected,
    status: selected === null ? "unmatched" : "matched",
  };
}

function deezerCandidatesForTrack(track: Track, hits: DeezerTrackHit[]): Candidate[] {
  return hits
    .map((hit) => ({
      provider: "deezer" as const,
      hit,
      playable: Boolean(hit.previewUrl),
      confidence: deezerMatchConfidence(track, hit),
    }))
    .filter((candidate) => candidate.confidence !== "none");
}

async function findYoutubeCandidates(track: Track): Promise<Candidate[]> {
  const hits = await searchYoutubeVideos(`${track.artist} ${track.title}`, 8);
  const candidates: Candidate[] = [];
  for (const hit of hits) {
    const guessed = guessTitleArtist(hit.title, hit.author);
    const titleMatches = sameText(track.title, guessed.title) || sameText(track.title, hit.title);
    const artistMatches = sameText(track.artist, guessed.artist) || sameText(track.artist, hit.author);
    const confidence = titleMatches && artistMatches ? "high" : titleMatches || artistMatches ? "ambiguous" : "none";
    if (confidence === "none") continue;

    const cached = getCachedEmbedStatus(hit.videoId);
    const playable = cached ? cached.embeddable : (await checkVideoEmbeddable(hit.videoId)).embeddable;
    candidates.push({ provider: "youtube", hit, playable, confidence });
    if (candidates.length >= 5) break;
  }
  return candidates;
}

export const ConvertDeckModal: React.FC<ConvertDeckModalProps> = ({ deck, isOpen, onClose, onCreate, onUpdateCreated }) => {
  const targetProvider: MusicProvider = deck.provider === "youtube" ? "deezer" : "youtube";
  const { setBackgroundTask } = useDeck();
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("Searching…");
  const cancelRequestedRef = useRef(false);
  const createdDeckRef = useRef<Deck | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const taskId = `convert:${deck.id}:${targetProvider}`;

  const buildConvertedTracks = (sourceRows: ConversionRow[]): Track[] => sourceRows.map((row) => {
    const candidate = row.selected === null ? null : row.candidates[row.selected];
    if (candidate?.provider === "deezer") {
      return { ...deezerHitToTrack(candidate.hit), id: randomId("track") };
    }
    if (candidate?.provider === "youtube") {
      const base = createTrack({
        title: row.source.title,
        artist: row.source.artist,
        album: row.source.album,
        albumArtUrl: row.source.albumArtUrl || candidate.hit.thumbnailUrl,
        durationMs: row.source.durationMs,
        provider: "youtube",
        media: { provider: "youtube", id: candidate.hit.videoId, providerTitle: candidate.hit.title },
        matchStatus: "matched",
      });
      return { ...base, id: randomId("track") };
    }
    const base = createTrack({
      title: row.source.title,
      artist: row.source.artist,
      album: row.source.album,
      albumArtUrl: row.source.albumArtUrl,
      durationMs: row.source.durationMs,
      provider: targetProvider,
      media: null,
      matchStatus: "pending",
    });
    return targetProvider === "deezer" ? { ...base, id: randomId("track"), startTime: 0, endTime: 30 } : { ...base, id: randomId("track") };
  });

  const publishRows = (nextRows: ConversionRow[]) => {
    setRows(nextRows);
    const created = createdDeckRef.current;
    if (created) {
      const updated = { ...created, tracks: buildConvertedTracks(nextRows), updatedAt: new Date().toISOString() };
      createdDeckRef.current = updated;
      onUpdateCreated?.(updated);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    cancelRequestedRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    createdDeckRef.current = null;
    setRows(deck.tracks.map((source) => ({ source, candidates: [], selected: null, status: "loading" })));
    setError(null);
    setIsMatching(true);
    setProgressLabel(targetProvider === "deezer" ? "Batching Deezer search…" : "Searching…");
    setBackgroundTask(taskId, { label: `Matching ${getProviderLabel(targetProvider)} tracks`, completed: 0, total: deck.tracks.length });
    let cancelled = false;

    const run = async () => {
      if (targetProvider === "deezer") {
        try {
          const batchHits = await searchDeezerTracksBatch(deck.tracks, abortControllerRef.current?.signal);
          if (cancelled || cancelRequestedRef.current) return;
          publishRows(deck.tracks.map((source, index) =>
            rowFromCandidates(source, deezerCandidatesForTrack(source, batchHits[index] ?? []))
          ));
        } catch (err) {
          if (!cancelled && !cancelRequestedRef.current && (err as Error).name !== "AbortError") {
            publishRows(deck.tracks.map((source) => ({ source, candidates: [], selected: null, status: "unmatched" as const })));
            setError((err as Error).message || "Deezer batch search failed.");
          }
        }
        if (!cancelled && !cancelRequestedRef.current) {
          setIsMatching(false);
          setBackgroundTask(taskId, null);
        }
        return;
      }

      for (let i = 0; i < deck.tracks.length; i += 1) {
        if (cancelled || cancelRequestedRef.current) return;
        setProgressLabel(`Searching ${i + 1} / ${deck.tracks.length}…`);
        setBackgroundTask(taskId, { label: `Matching ${getProviderLabel(targetProvider)} tracks`, completed: i, total: deck.tracks.length });
        try {
          const candidates = await findYoutubeCandidates(deck.tracks[i]);
          if (cancelled || cancelRequestedRef.current) return;
          setRows((current) => {
            const nextRows = current.map((row, rowIndex) => rowIndex === i ? rowFromCandidates(deck.tracks[i], candidates) : row);
            const created = createdDeckRef.current;
            if (created) {
              const updated = { ...created, tracks: buildConvertedTracks(nextRows), updatedAt: new Date().toISOString() };
              createdDeckRef.current = updated;
              onUpdateCreated?.(updated);
            }
            return nextRows;
          });
        } catch (err) {
          if (!cancelled && !cancelRequestedRef.current) {
            setRows((current) => current.map((row, rowIndex) => rowIndex === i ? { ...row, status: "unmatched" } : row));
            setError((err as Error).message || "Some provider searches failed.");
          }
        }
        if (i < deck.tracks.length - 1 && !cancelled && !cancelRequestedRef.current) await sleep(YOUTUBE_TRACK_DELAY_MS);
      }
      if (!cancelled && !cancelRequestedRef.current) {
        setIsMatching(false);
        setBackgroundTask(taskId, null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (!createdDeckRef.current) cancelRequestedRef.current = true;
      abortControllerRef.current?.abort();
      if (!createdDeckRef.current || cancelRequestedRef.current) setBackgroundTask(taskId, null);
    };
  // Matching starts only when the modal opens. It intentionally continues after Create closes the modal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, setBackgroundTask, taskId]);


  const unresolved = rows.filter((row) => row.selected === null).length;
  const completed = rows.filter((row) => row.status !== "loading").length;

  const convertedTracks = useMemo(() => buildConvertedTracks(rows), [rows, targetProvider]);

  const handleCreate = () => {
    const created = onCreate({
      ...deck,
      id: randomId("deck"),
      name: `${deck.name} (${getProviderLabel(targetProvider)})`,
      provider: targetProvider,
      source: { type: "converted", provider: targetProvider, convertedFrom: deck.provider },
      tracks: convertedTracks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: 2,
    });
    createdDeckRef.current = created;
    onClose();
  };

  const handleCancel = () => {
    cancelRequestedRef.current = true;
    abortControllerRef.current?.abort();
    onClose();
  };

  if (!isOpen) return null;
  return (
    <PcModal title={`Convert deck to ${getProviderLabel(targetProvider)}`} onClose={handleCancel} className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <div className="space-y-3 text-xs">
        <p>Conversion creates a new copy. The original deck and its host session are not changed.</p>
        <p className="font-semibold">
          {completed} / {rows.length} songs searched{isMatching ? "…" : ""} · {unresolved} need review
          {isMatching ? ` · ${progressLabel}` : ""}
        </p>
        {error && <p className="pc-bevel-inset p-2 text-pc-warning flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
        <div className="space-y-2 max-h-[52vh] overflow-y-auto">
          {rows.map((row) => {
            const selectedCandidate = row.selected === null ? null : row.candidates[row.selected];
            const label = selectedCandidate
              ? selectedCandidate.provider === "deezer"
                ? `${selectedCandidate.hit.artist} — ${selectedCandidate.hit.title}`
                : `${selectedCandidate.hit.author} — ${selectedCandidate.hit.title}`
              : null;
            return (
              <div key={row.source.id} className="pc-bevel-inset p-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{row.source.artist} — {row.source.title}</p>
                    <p className="text-[11px] opacity-75">
                      {row.status === "loading" ? "Searching…" : row.status === "matched" ? "Matched automatically" : "No playable match; track will need attention"}
                    </p>
                  </div>
                  {row.status === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
                  {row.status === "matched" && <Check className="w-4 h-4 text-pc-success" />}
                </div>
                {selectedCandidate && label && (
                  <div className="mt-2 p-1.5 pc-bevel-outset flex items-center gap-2">
                    <span className="truncate flex-1">{label}</span>
                    <a
                      href={selectedCandidate.provider === "deezer"
                        ? selectedCandidate.hit.providerUrl
                        : `https://www.youtube.com/watch?v=${selectedCandidate.hit.videoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0"
                      aria-label={`Open official ${selectedCandidate.provider} link for ${label}`}
                      title="Open official link in a new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2"><Button type="button" onClick={handleCancel}>Cancel</Button><Button type="button" variant="primary" onClick={handleCreate} disabled={rows.length === 0}><RefreshCw className="w-4 h-4" />Create converted copy</Button></div>
      </div>
    </PcModal>
  );
};
