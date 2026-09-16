import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { AlertCircle, ClipboardList, Loader2 } from "lucide-react";
import { Track } from "../../types/deck";
import { parseSongList } from "../../lib/tracks";
import { PcModal } from "../ui/PcModal";

interface BulkSongListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (tracks: Track[]) => void;
  onAddTrack: (track: Track) => void | Promise<boolean | void>;
  onAddTracks?: (tracks: Track[]) => void | Promise<boolean | void>;
}

const MAX_BULK_SONGS = 100;

export const BulkSongListModal: React.FC<BulkSongListModalProps> = ({
  isOpen,
  onClose,
  onAdded,
  onAddTrack,
  onAddTracks,
}) => {
  const [songList, setSongList] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSongList("");
    setIsAdding(false);
    setError(null);
  }, [isOpen]);

  const parsed = useMemo(() => parseSongList(songList), [songList]);
  const songsToAdd = parsed.tracks.slice(0, MAX_BULK_SONGS);
  const lineCount = songList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")).length;

  const addSongs = async () => {
    if (songsToAdd.length === 0) {
      setError("Paste at least one song before adding.");
      return;
    }

    setIsAdding(true);
    setError(
      parsed.tracks.length > MAX_BULK_SONGS
        ? `Only the first ${MAX_BULK_SONGS} songs will be added at once.`
        : null
    );

    try {
      if (onAddTracks) {
        const added = await onAddTracks(songsToAdd);
        if (added === false) {
          setError("Could not add the songs. You can try again.");
          return;
        }
      } else {
        for (const track of songsToAdd) {
          const added = await onAddTrack(track);
          if (added === false) {
            setError("Some songs could not be added. You can try again.");
            return;
          }
        }
      }
      onClose();
      onAdded?.(songsToAdd);
    } catch (err) {
      setError((err as Error).message || "Could not add the songs.");
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <PcModal
      title="Add multiple songs"
      onClose={onClose}
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-3 text-xs">
        <p>
          Paste one song per line in <strong>Artist - Title</strong> format. The songs will be added first,
          then matched automatically in the background. You can keep editing while matches load.
        </p>
        <textarea
          value={songList}
          onChange={(event) => {
            setSongList(event.target.value);
            setError(null);
          }}
          disabled={isAdding}
          rows={9}
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

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void addSongs()}
            disabled={isAdding || songsToAdd.length === 0}
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            {isAdding ? "Adding…" : `Add ${songsToAdd.length} song${songsToAdd.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </PcModal>
  );
};