import React, { useEffect, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { Copy, Loader2, Mail } from "lucide-react";
import { Deck } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { useToast } from "../../state/ToastContext";
import { buildCollaborativeUrl, getCollaborativeShareUrls } from "../../lib/share/collaborativeShare";
import { createCollaborativePlaylist, isCollaborativeApiConfigured } from "../../lib/share/collaborativePlaylistsApi";
import { getStoredCollaborationId, rememberCollaborationLink } from "../../lib/share/collaborationLinks";

interface CollaborateModalProps {
  deck: Deck;
  onClose: () => void;
  onLinked?: (collaborationId: string, revision?: number) => void;
}


export const CollaborateModal: React.FC<CollaborateModalProps> = ({ deck, onClose, onLinked }) => {
  const { showToast } = useToast();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!isCollaborativeApiConfigured()) {
      setError("Collaborative links are not configured on this site yet.");
      setCreating(false);
      return () => { cancelled = true; };
    }
    const storedCollaborationId = deck.collaboration?.id ?? getStoredCollaborationId(deck.id);
    if (storedCollaborationId) {
      onLinked?.(storedCollaborationId);
      setUrl(buildCollaborativeUrl(storedCollaborationId));
      setCreating(false);
      return () => { cancelled = true; };
    }

    void createCollaborativePlaylist({ name: deck.name, provider: deck.provider, tracks: deck.tracks })
      .then(({ collaborationId, revision }) => {
        rememberCollaborationLink(deck.id, collaborationId);
        onLinked?.(collaborationId, revision);
        if (!cancelled) setUrl(buildCollaborativeUrl(collaborationId));
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message || "Could not create a collaborative link."); })
      .finally(() => { if (!cancelled) setCreating(false); });
    return () => { cancelled = true; };
  }, [deck, onLinked]);

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast({ title: "Copied", message, duration: 3000 });
    } catch {
      showToast({ title: "Copy failed", message: "Could not copy to clipboard.", duration: 5000 });
    }
  };

  return (
    <PcModal title={`Collaborate on "${deck.name}"`} onClose={onClose}>
      <div className="space-y-4">
        {creating ? <p className="text-sm inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Creating collaborative playlist…</p> : url ? (
          <>
            <p className="text-sm">Anyone with this link can edit the playlist. Linked decks can check for updates from the editor.</p>
            <div className="pc-bevel-inset p-3 break-all text-xs">{url}</div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="primary" onClick={() => void copy(url, "Collaborative link copied to clipboard.")}><Copy className="w-4 h-4" />Copy link</Button>

            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <a className="pc-button inline-flex items-center gap-1.5" href={getCollaborativeShareUrls(deck, url).email}><Mail className="w-4 h-4" />Email</a>
            </div>
          </>
        ) : <div className="pc-bevel-inset p-3 text-sm">{error}</div>}
        {error && url ? <p className="text-xs pc-bevel-inset p-3">{error}</p> : null}
      </div>
    </PcModal>
  );
};
