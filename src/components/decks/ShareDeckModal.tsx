import React, { useEffect, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { AlertCircle, Check, Copy, Download, ExternalLink, Loader2, Mail, MessageCircle, Send, Users } from "lucide-react";
import { Deck } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { useToast } from "../../state/ToastContext";
import { buildSharedDeckUrl, getPlatformShareUrls } from "../../lib/share/deckShare";
import { buildCollaborativeUrl, getCollaborativeShareUrls } from "../../lib/share/collaborativeShare";
import { createCollaborativePlaylist, isCollaborativeApiConfigured } from "../../lib/share/collaborativePlaylistsApi";
import { isShareApiConfigured, publishSharedDeck } from "../../lib/share/sharedDecksApi";
import { exportDeckToJson } from "../../lib/storage/decks";

interface ShareDeckModalProps {
  deck: Deck;
  initialShareId?: string;
  initialShareUrl?: string;
  onLinked?: (collaborationId: string, revision?: number) => void;
  onClose: () => void;
}

export const ShareDeckModal: React.FC<ShareDeckModalProps> = ({
  deck,
  initialShareId,
  initialShareUrl,
  onLinked,
  onClose,
}) => {
  const { showToast } = useToast();
  const [shareId, setShareId] = useState<string | undefined>(initialShareId);
  const [shareUrl, setShareUrl] = useState<string | undefined>(initialShareUrl);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [collaborationUrl, setCollaborationUrl] = useState<string>();
  const [isCreatingCollaboration, setIsCreatingCollaboration] = useState(false);
  const [collaborationError, setCollaborationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isShareApiConfigured() || initialShareUrl) {
      return;
    }

    let cancelled = false;
    setIsPublishing(true);
    setPublishError(null);
    setShareId(undefined);
    setShareUrl(undefined);

    void publishSharedDeck(deck)
      .then((published) => {
        if (cancelled) return;
        setShareId(published.shareId);
        setShareUrl(buildSharedDeckUrl(published.shareId));
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setPublishError(err.message || "Could not create a share link.");
          setShareId(undefined);
          setShareUrl(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPublishing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deck, initialShareUrl]);

  const copyLink = async (url = shareUrl, message = "Share link copied to clipboard.") => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast({
        title: "Link copied",
        message,
        duration: 3000,
      });
    } catch {
      showToast({
        title: "Copy failed",
        message: "Could not copy to clipboard.",
        duration: 5000,
      });
    }
  };


  const generateCollaborationLink = async () => {
    if (collaborationUrl || isCreatingCollaboration) return;
    setCollaborationError(null);
    setIsCreatingCollaboration(true);
    try {
      if (!isCollaborativeApiConfigured()) {
        throw new Error("Collaborative links are not configured on this site yet.");
      }
      const { collaborationId, revision } = await createCollaborativePlaylist({
        name: deck.name,
        provider: deck.provider,
        tracks: deck.tracks,
      });
      onLinked?.(collaborationId, revision);
      setCollaborationUrl(buildCollaborativeUrl(collaborationId));
    } catch (err) {
      setCollaborationError(err instanceof Error ? err.message : "Could not create a collaborative link.");
    } finally {
      setIsCreatingCollaboration(false);
    }
  };

  const downloadJson = () => {
    try {
      exportDeckToJson(deck);
      showToast({
        title: "Deck exported",
        icon: <Check className="w-3.5 h-3.5" />,
        message: "Send the JSON file so they can import it from Home.",
        duration: 4000,
      });
    } catch (err) {
      showToast({
        title: "JSON export failed",
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        message: err instanceof Error ? err.message : "Could not download the deck as JSON.",
        duration: 10000,
      });
    }
  };

  return (
    <PcModal title={`Share "${deck.name}"`} onClose={onClose}>
      <div className="space-y-4">
        {isPublishing ? (
          <p className="text-sm inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating share link…
          </p>
        ) : shareUrl ? (
          <>
            <p className="text-sm">Anyone with this link can open the deck and add a copy to their browser.</p>
            <div className="pc-bevel-inset p-3 break-all text-xs">{shareUrl}</div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="primary" onClick={() => void copyLink()}>
                <Copy className="w-4 h-4" />
                Copy link
              </Button>
            </div>
            <div className="border-t border-zinc-200 pt-4 space-y-3">
              {collaborationUrl ? (
                <>
                  <p className="text-sm">Anyone with this link can edit the playlist.</p>
                  <div className="pc-bevel-inset p-3 break-all text-xs">{collaborationUrl}</div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="primary" onClick={() => void copyLink(collaborationUrl, "Collaborative link copied to clipboard.")}>
                      <Copy className="w-4 h-4" />
                      Copy link
                    </Button>
                    <a className="pc-button inline-flex items-center gap-1.5" target="_blank" rel="noopener noreferrer" href={getCollaborativeShareUrls(deck, collaborationUrl).whatsapp}>
                      <MessageCircle className="w-4 h-4" />WhatsApp<ExternalLink className="w-3 h-3 opacity-75" />
                    </a>
                    <a className="pc-button inline-flex items-center gap-1.5" target="_blank" rel="noopener noreferrer" href={getCollaborativeShareUrls(deck, collaborationUrl).telegram}>
                      <Send className="w-4 h-4" />Telegram<ExternalLink className="w-3 h-3 opacity-75" />
                    </a>
                    <a className="pc-button inline-flex items-center gap-1.5" href={getCollaborativeShareUrls(deck, collaborationUrl).email}>
                      <Mail className="w-4 h-4" />Email
                    </a>
                  </div>
                </>
              ) : (
                <Button type="button" onClick={() => void generateCollaborationLink()} disabled={isCreatingCollaboration}>
                  {isCreatingCollaboration ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                  {isCreatingCollaboration ? "Creating collaboration link…" : "Generate collaboration link"}
                </Button>
              )}
              {collaborationError ? <p className="text-xs pc-bevel-inset p-3">{collaborationError}</p> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <a
                href={getPlatformShareUrls(deck, shareUrl).whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="pc-button inline-flex items-center gap-1.5"
                title="Opens in a new tab"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
                <ExternalLink className="w-3 h-3 opacity-75" />
              </a>
              <a
                href={getPlatformShareUrls(deck, shareUrl).telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="pc-button inline-flex items-center gap-1.5"
                title="Opens in a new tab"
              >
                <Send className="w-4 h-4" />
                Telegram
                <ExternalLink className="w-3 h-3 opacity-75" />
              </a>
              <a href={getPlatformShareUrls(deck, shareUrl).email} className="pc-button">
                <Mail className="w-4 h-4" />
                Email
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">
              {publishError
                ? "Could not create a share link right now. Download the deck as JSON and share that file instead — they can import it from Home."
                : "Link sharing is not configured on this site yet. Download the deck as JSON to share it manually."}
            </p>
            {publishError ? <p className="text-xs pc-bevel-inset p-3">{publishError}</p> : null}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="primary" onClick={downloadJson}>
                <Download className="w-4 h-4" />
                Download JSON
              </Button>
            </div>
          </>
        )}

        {shareId ? <p className="text-xs opacity-70">Share id: {shareId}</p> : null}
      </div>
    </PcModal>
  );
};
