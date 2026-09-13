import React, { useEffect, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { Copy, ExternalLink, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { Deck } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { useToast } from "../../state/ToastContext";
import { buildCollaborativeUrl, buildCollaborativeMessage, getCollaborativeShareUrls } from "../../lib/share/collaborativeShare";
import { createCollaborativePlaylist, isCollaborativeApiConfigured } from "../../lib/share/collaborativePlaylistsApi";

interface CollaborateModalProps {
  deck: Deck;
  onClose: () => void;
  onLinked?: (collaborationId: string, revision?: number) => void;
}

const COLLABORATION_LINKS_KEY = "bingo-musical:collaboration-links";

type StoredCollaborationLinks = Record<string, string>;

function readStoredCollaborationLinks(): StoredCollaborationLinks {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLABORATION_LINKS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    );
  } catch {
    return {};
  }
}

function rememberCollaborationLink(deckId: string, collaborationId: string): void {
  try {
    const links = readStoredCollaborationLinks();
    links[deckId] = collaborationId;
    localStorage.setItem(COLLABORATION_LINKS_KEY, JSON.stringify(links));
  } catch {
    // Link creation still succeeds if local storage is unavailable.
  }
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
    const storedCollaborationId = readStoredCollaborationLinks()[deck.id];
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
