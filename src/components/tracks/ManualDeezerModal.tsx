import React, { useEffect, useState } from "react";
import { Button, Input } from "@miquelt9/pc-ui";
import { AlertCircle, Check, Loader2, Search, Volume2 } from "lucide-react";
import { Track } from "../../types/deck";
import { deezerHitToTrack, isDeezerApiConfigured, resolveDeezerTrack } from "../../lib/deezer/api";
import { PcModal } from "../ui/PcModal";

interface ManualDeezerModalProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

export const ManualDeezerModal: React.FC<ManualDeezerModalProps> = ({ track, isOpen, onClose, onSave }) => {
  const [inputValue, setInputValue] = useState("");
  const [resolved, setResolved] = useState<ReturnType<typeof deezerHitToTrack> | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setInputValue(track.media?.provider === "deezer" ? track.media.providerUrl || track.media.id : "");
    setResolved(null);
    setError(null);
  }, [isOpen, track]);

  const resolve = async () => {
    if (!inputValue.trim()) return;
    setIsResolving(true);
    setError(null);
    try {
      setResolved(deezerHitToTrack(await resolveDeezerTrack(inputValue)));
    } catch (err) {
      setResolved(null);
      setError((err as Error).message || "That Deezer track could not be found.");
    } finally {
      setIsResolving(false);
    }
  };

  const save = () => {
    if (!resolved) {
      setError("Resolve a Deezer track before saving.");
      return;
    }
    onSave({
      ...track,
      album: resolved.album,
      albumArtUrl: resolved.albumArtUrl,
      durationMs: resolved.durationMs,
      media: resolved.media,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      matchStatus: resolved.media?.provider === "deezer" && resolved.media.previewUrl ? "manual" : "failed",
    });
    onClose();
  };

  if (!isOpen) return null;
  return (
    <PcModal title="Manual Deezer track" onClose={onClose} className="max-w-xl">
      <p className="text-sm font-semibold mb-1">{track.title}</p>
      <p className="text-sm mb-4">{track.artist}</p>
      {!isDeezerApiConfigured() ? (
        <p className="pc-bevel-inset p-3 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4" />Deezer metadata is unavailable until the Worker is configured.</p>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs font-bold">Deezer track URL or numeric ID</label>
          <div className="flex gap-2">
            <Input className="flex-1 font-mono" value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder="https://www.deezer.com/track/…" />
            <Button type="button" variant="primary" onClick={() => void resolve()} disabled={isResolving || !inputValue.trim()}>
              {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Resolve
            </Button>
          </div>
          {error && <p className="text-xs text-pc-error flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
          {resolved && (
            <div className="pc-bevel-inset p-2 flex items-center gap-3">
              <img src={resolved.albumArtUrl} alt="" className="w-14 h-14 object-cover" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{resolved.title}</p><p className="text-xs truncate">{resolved.artist} · {resolved.album}</p><p className={`text-[11px] mt-1 flex items-center gap-1 ${resolved.media?.provider === "deezer" && resolved.media.previewUrl ? "text-pc-success" : "text-pc-warning"}`}><Volume2 className="w-3 h-3" />{resolved.media?.provider === "deezer" && resolved.media.previewUrl ? "Preview available" : "No preview available"}</p></div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="button" variant="primary" disabled={!resolved} onClick={save}><Check className="w-4 h-4" />Save track</Button></div>
        </div>
      )}
    </PcModal>
  );
};
