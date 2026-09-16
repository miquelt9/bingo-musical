import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { AlertCircle, Check, ClipboardList, Loader2, RefreshCw } from "lucide-react";
import { MusicProvider, Track } from "../../types/deck";
import { parseSongList } from "../../lib/tracks";
import { batchMatchDeezerTracks } from "../../lib/deezer/matcher";
import { batchMatchTracks, BatchMatchProgress } from "../../lib/youtube/matcher";
import { getProviderLabel } from "../../lib/music/providers";
import { PcModal } from "../ui/PcModal";

interface BulkSongListModalProps {
  provider: MusicProvider;
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (track: Track) => void | Promise<boolean | void>;
  onAddTracks?: (tracks: Track[]) => void | Promise<boolean | void>;
}

type BulkRowStatus = "loading" | "matched" | "unmatched";

interface BulkRow {
  track: Track;
  status: BulkRowStatus;
}

const MAX_BULK_SONGS = 100;

function isMatched(track: Track): boolean {
  return Boolean(track.media) && (track.matchStatus === "matched" || track.matchStatus === "manual");
}

export const BulkSongListModal: React.FC<BulkSongListModalProps> = ({
  provider,
  isOpen,
  onClose,
  onAddTrack,
  onAddTracks,
}) => {
  const [songList, setSongList] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [progress, setProgress] = useState<BatchMatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    cancelRequestedRef.current = false;
    setSongList("");
    setRows([]);
    setIsMatching(false);
    setIsAdding(false);
    setProgress(null);
    setError(null);
  }, [isOpen]);

  const parsed = useMemo(() => parseSongList(songList), [songList]);
  const matchedRows = rows.filter((row) => row.status === "matched" && isMatched(row.track));
  const lineCount = songList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")).length;

  const startMatching = async () => {
    const parsedList = parseSongList(songList);
    if (parsedList.tracks.length === 0) {
      setError("Paste at least one song before matching.");
      return;
    }

    const tracks = parsedList.tracks.slice(0, MAX_BULK_SONGS);
    cancelRequestedRef.current = false;
    setError(
      parsedList.tracks.length > MAX_BULK_SONGS
        ? `Only the first ${MAX_BULK_SONGS} songs will be matched at once.`
        : null
    );
    setRows(tracks.map((track) => ({ track, status: "loading" })));
    setProgress({ total: tracks.length, completed: 0, matched: 0, failed: 0 });
    setIsMatching(true);

    const handleProgress = (nextProgress: BatchMatchProgress, updatedTrack: Track) => {
      if (cancelRequestedRef.current) return;
      setProgress(nextProgress);
      setRows((current) => current.map((row) =>
        row.track.id === updatedTrack.id
          ? { track: updatedTrack, status: isMatched(updatedTrack) ? "matched" : "unmatched" }
          : row
      ));
    };

    try {
      const matchedTracks = provider === "deezer"
        ? await batchMatchDeezerTracks(tracks, 2, handleProgress, () => cancelRequestedRef.current)
        : await batchMatchTracks(tracks, 2, handleProgress, () => cancelRequestedRef.current);

      if (cancelRequestedRef.current) return;
      setRows(matchedTracks.map((track) => ({
        track,
        status: isMatched(track) ? "matched" : "unmatched",
      })));
      setProgress((current) => current ?? {
        total: tracks.length,
        completed: tracks.length,
        matched: matchedTracks.filter(isMatched).length,
        failed: matchedTracks.filter((track) => !isMatched(track)).length,
      });
    } catch (err) {
      if (!cancelRequestedRef.current) {
        setRows((current) => current.map((row) =>
          row.status === "loading" ? { ...row, status: "unmatched" } : row
        ));
        setError((err as Error).message || "Bulk matching failed. Try again.");
      }
    } finally {
      if (!cancelRequestedRef.current) setIsMatching(false);
    }
  };

  const addMatchedSongs = async () => {
    if (matchedRows.length === 0) return;
    setIsAdding(true);
    setError(null);
    try {
      if (onAddTracks) {
        const added = await onAddTracks(matchedRows.map((row) => row.track));
        if (added === false) {
          setError("Could not add the matched songs. You can try again.");
          return;
        }
      } else {
        for (const row of matchedRows) {
          const added = await onAddTrack(row.track);
          if (added === false) {
            setError("Some matched songs could not be added. You can try again.");
            return;
          }
        }
      }
      onClose();
    } catch (err) {
      setError((err as Error).message || "Could not add the matched songs.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleClose = () => {
    cancelRequestedRef.current = true;
    onClose();
  };

  if (!isOpen) return null;

  return (
    <PcModal
      title="Add multiple songs"
      onClose={handleClose}
      className="max-w-3xl max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-3 text-xs">
        <p>
          Paste one song per line in <strong>Artist - Title</strong> format. Every line is matched automatically;
          you do not need to choose results one by one.
        </p>
        <textarea
          value={songList}
          onChange={(event) => {
            setSongList(event.target.value);
            if (!isMatching) setError(null);
          }}
          disabled={isMatching || isAdding}
          rows={8}
          className="pc-input w-full resize-y font-mono text-xs"
          placeholder={'The Beatles - Come Together\nABBA - Dancing Queen\nQueen - Don\'t Stop Me Now'}
          aria-label="Songs to add, one per line"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] opacity-80">
          <span>
            {lineCount} line{lineCount === 1 ? "" : "s"}
            {parsed.skipped > 0 ? ` · ${parsed.skipped} duplicate line${parsed.skipped === 1 ? "" : "s"} ignored` : ""}
          </span>
          <span>Maximum {MAX_BULK_SONGS} songs per batch</span>
        </div>

        {error && (
          <div className="pc-bevel-inset p-2 flex items-center gap-2 text-pc-warning" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            <p className="font-semibold">
              {progress?.completed ?? 0} / {rows.length} songs matched{isMatching ? "…" : ""}
              {!isMatching && ` · ${matchedRows.length} ready to add`}
            </p>
            <div className="space-y-1.5 max-h-[38vh] overflow-y-auto">
              {rows.map((row) => (
                <div key={row.track.id} className="pc-bevel-inset p-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{row.track.artist} — {row.track.title}</p>
                    <p className="text-[11px] opacity-75">
                      {row.status === "loading"
                        ? "Searching…"
                        : row.status === "matched"
                          ? `Matched automatically on ${getProviderLabel(provider)}`
                          : "No playable match found"}
                    </p>
                  </div>
                  {row.status === "loading" && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  {row.status === "matched" && <Check className="w-4 h-4 text-pc-success shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button type="button" onClick={handleClose} disabled={isAdding}>
            {isMatching ? "Cancel matching" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={() => void startMatching()}
            disabled={isMatching || isAdding || !songList.trim()}
          >
            <RefreshCw className="w-4 h-4" />
            {rows.length > 0 ? "Match again" : "Match songs"}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void addMatchedSongs()}
            disabled={isMatching || isAdding || matchedRows.length === 0}
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            {isAdding ? "Adding…" : `Add ${matchedRows.length} matched song${matchedRows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </PcModal>
  );
};
