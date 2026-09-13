import React, { useEffect, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { Copy, ExternalLink, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { Deck } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { useToast } from "../../state/ToastContext";
import { buildCollaborativeUrl, buildCollaborativeMessage, getCollaborativeShareUrls } from "../../lib/share/collaborativeShare";
import { createCollaborativePlaylist, isCollaborativeApiConfigured } from "../../lib/share/collaborativePlaylistsApi";

interface CollaborateModalProps { deck: Deck; onClose: () => void; }

export const CollaborateModal: React.FC<CollaborateModalProps> = ({ deck, onClose }) => {
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
    void createCollaborativePlaylist({ name: deck.name, provider: deck.provider, tracks: deck.tracks })
      .then(({ collaborationId }) => { if (!cancelled) setUrl(buildCollaborativeUrl(collaborationId)); })
      .catch((err: Error) => { if (!cancelled) setError(err.message || "Could not create a collaborative link."); })
      .finally(() => { if (!cancelled) setCreating(false); });
    return () => { cancelled = true; };
  }, [deck]);

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
            <p className="text-sm">Anyone with this link can add songs. New songs appear for everyone automatically.</p>
            <div className="pc-bevel-inset p-3 break-all text-xs">{url}</div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="primary" onClick={() => void copy(url, "Collaborative link copied to clipboard.")}><Copy className="w-4 h-4" />Copy link</Button>
              <Button type="button" onClick={() => void copy(buildCollaborativeMessage(deck, url), "Share message copied to clipboard.")}><Copy className="w-4 h-4" />Copy message</Button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <a className="pc-button inline-flex items-center gap-1.5" target="_blank" rel="noopener noreferrer" href={getCollaborativeShareUrls(deck, url).whatsapp}><MessageCircle className="w-4 h-4" />WhatsApp<ExternalLink className="w-3 h-3 opacity-75" /></a>
              <a className="pc-button inline-flex items-center gap-1.5" target="_blank" rel="noopener noreferrer" href={getCollaborativeShareUrls(deck, url).telegram}><Send className="w-4 h-4" />Telegram<ExternalLink className="w-3 h-3 opacity-75" /></a>
              <a className="pc-button inline-flex items-center gap-1.5" href={getCollaborativeShareUrls(deck, url).email}><Mail className="w-4 h-4" />Email</a>
            </div>
          </>
        ) : <div className="pc-bevel-inset p-3 text-sm">{error}</div>}
        {error && url ? <p className="text-xs pc-bevel-inset p-3">{error}</p> : null}
      </div>
    </PcModal>
  );
};
