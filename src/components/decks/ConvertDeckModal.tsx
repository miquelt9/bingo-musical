import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";
import { Deck, MusicProvider, Track } from "../../types/deck";
import { createTrack } from "../../lib/tracks";
import { deezerHitToTrack, DeezerTrackHit, searchDeezerTracks } from "../../lib/deezer/api";
import { deezerMatchConfidence, normalizeMusicText } from "../../lib/deezer/matcher";
import { YoutubeSearchHit, guessTitleArtist, searchYoutubeVideos } from "../../lib/youtube/search";
import { checkVideoEmbeddable } from "../../lib/youtube/validator";
import { getProviderLabel } from "../../lib/music/providers";
import { PcModal } from "../ui/PcModal";

type Candidate =
  | { provider: "deezer"; hit: DeezerTrackHit; playable: boolean; confidence: "high" | "ambiguous" | "none" }
  | { provider: "youtube"; hit: YoutubeSearchHit; playable: boolean; confidence: "high" | "ambiguous" | "none" };

interface ConversionRow {
  source: Track;
  candidates: Candidate[];
  selected: number | null;
  status: "loading" | "matched" | "review" | "unmatched";
}

interface ConvertDeckModalProps {
  deck: Deck;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (deck: Deck) => void;
}

function sameText(a: string, b: string): boolean {
  return normalizeMusicText(a) === normalizeMusicText(b);
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    const validation = await checkVideoEmbeddable(hit.videoId);
    candidates.push({ provider: "youtube", hit, playable: validation.embeddable, confidence });
    if (candidates.length >= 5) break;
  }
  return candidates;
}

async function findCandidates(track: Track, provider: MusicProvider): Promise<Candidate[]> {
  if (provider === "deezer") {
    const hits = await searchDeezerTracks(`${track.artist} ${track.title}`, 8);
    return hits.map((hit) => ({
      provider: "deezer" as const,
      hit,
      playable: Boolean(hit.previewUrl),
      confidence: deezerMatchConfidence(track, hit),
    })).filter((candidate) => candidate.confidence !== "none");
  }
  return findYoutubeCandidates(track);
}

export const ConvertDeckModal: React.FC<ConvertDeckModalProps> = ({ deck, isOpen, onClose, onCreate }) => {
  const targetProvider: MusicProvider = deck.provider === "youtube" ? "deezer" : "youtube";
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRows(deck.tracks.map((source) => ({ source, candidates: [], selected: null, status: "loading" })));
    setError(null);
    setIsMatching(true);
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < deck.tracks.length; i += 1) {
        if (cancelled) return;
        try {
          const candidates = await findCandidates(deck.tracks[i], targetProvider);
          const playable = candidates.filter((candidate) => candidate.playable && candidate.confidence === "high");
          const selected = playable.length === 1 ? candidates.indexOf(playable[0]) : null;
          setRows((current) => current.map((row, rowIndex) => rowIndex === i
            ? { ...row, candidates, selected, status: selected === null ? (candidates.length ? "review" : "unmatched") : "matched" }
            : row));
        } catch (err) {
          if (!cancelled) {
            setRows((current) => current.map((row, rowIndex) => rowIndex === i ? { ...row, status: "unmatched" } : row));
            setError((err as Error).message || "Some provider searches failed.");
          }
        }
      }
      if (!cancelled) setIsMatching(false);
    };
    void run();
    return () => { cancelled = true; };
  }, [deck, isOpen, targetProvider]);

  const unresolved = rows.filter((row) => row.selected === null).length;
  const completed = rows.filter((row) => row.status !== "loading").length;

  const convertedTracks = useMemo(() => rows.map((row) => {
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
  }), [rows, targetProvider]);

  const handleCreate = () => {
    if (rows.some((row) => row.status === "loading")) return;
    onCreate({
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
    onClose();
  };

  if (!isOpen) return null;
  return (
    <PcModal title={`Convert deck to ${getProviderLabel(targetProvider)}`} onClose={isMatching ? () => {} : onClose} className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <div className="space-y-3 text-xs">
        <p>Conversion creates a new copy. The original deck and its host session are not changed.</p>
        <p className="font-semibold">{completed} / {rows.length} songs searched{isMatching ? "…" : ""} · {unresolved} need review</p>
        {error && <p className="pc-bevel-inset p-2 text-pc-warning flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
        <div className="space-y-2 max-h-[52vh] overflow-y-auto">
          {rows.map((row, rowIndex) => (
            <div key={row.source.id} className="pc-bevel-inset p-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><p className="font-semibold truncate">{row.source.artist} — {row.source.title}</p><p className="text-[11px] opacity-75">{row.status === "loading" ? "Searching…" : row.status === "matched" ? "Matched automatically" : row.status === "review" ? "Choose a candidate" : "No confident match; track will need attention"}</p></div>
                {row.status === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
                {row.status === "matched" && <Check className="w-4 h-4 text-pc-success" />}
              </div>
              {row.candidates.length > 0 && (
                <div className="mt-2 space-y-1">
                  {row.candidates.map((candidate, candidateIndex) => {
                    const label = candidate.provider === "deezer" ? `${candidate.hit.artist} — ${candidate.hit.title}` : `${candidate.hit.author} — ${candidate.hit.title}`;
                    return <label key={`${candidate.provider}-${candidate.provider === "deezer" ? candidate.hit.id : candidate.hit.videoId}`} className={`flex items-center gap-2 p-1.5 pc-bevel-outset ${!candidate.playable ? "opacity-50" : ""}`}><input type="radio" name={`conversion-${rowIndex}`} checked={row.selected === candidateIndex} disabled={!candidate.playable} onChange={() => setRows((current) => current.map((item, indexValue) => indexValue === rowIndex ? { ...item, selected: candidateIndex, status: "matched" } : item))} /><span className="min-w-0 flex-1 truncate">{label}</span><span className="text-[10px]">{candidate.playable ? candidate.confidence === "high" ? "High confidence" : "Review" : "Unavailable"}</span></label>;
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2"><span className="text-[11px]">Unmatched songs are copied with no source so you can resolve them later.</span><div className="flex gap-2"><Button type="button" onClick={onClose} disabled={isMatching}>Cancel</Button><Button type="button" variant="primary" onClick={handleCreate} disabled={isMatching || rows.length === 0}><RefreshCw className="w-4 h-4" />Create converted copy</Button></div></div>
      </div>
    </PcModal>
  );
};
