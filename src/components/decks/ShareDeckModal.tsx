import React, { useEffect, useRef, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { AlertCircle, AlertTriangle, Check, Copy, Download, Loader2, Share2, Users } from "lucide-react";
import { Deck } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { useToast } from "../../state/ToastContext";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { buildSharedDeckUrl, isNativeShareAvailable, shareDeckNative } from "../../lib/share/deckShare";
import { buildCollaborativeUrl } from "../../lib/share/collaborativeShare";
import { createCollaborativePlaylist, isCollaborativeApiConfigured } from "../../lib/share/collaborativePlaylistsApi";
import { getStoredCollaborationId, rememberCollaborationLink } from "../../lib/share/collaborationLinks";
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
  const isMobile = useIsMobile();
  const showNativeShare = isMobile && isNativeShareAvailable();
  const [shareId, setShareId] = useState<string | undefined>(initialShareId);
  const [shareUrl, setShareUrl] = useState<string | undefined>(initialShareUrl);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const storedCollaborationId = deck.collaboration?.id ?? getStoredCollaborationId(deck.id);
  const [collaborationUrl, setCollaborationUrl] = useState<string | undefined>(() => (
    storedCollaborationId ? buildCollaborativeUrl(storedCollaborationId) : undefined
  ));
  const [isCreatingCollaboration, setIsCreatingCollaboration] = useState(false);
  const [collaborationError, setCollaborationError] = useState<string | null>(null);
  const linkedStoredId = useRef<string>();

  useEffect(() => {
    if (storedCollaborationId && !deck.collaboration?.id && linkedStoredId.current !== storedCollaborationId) {
      linkedStoredId.current = storedCollaborationId;
      onLinked?.(storedCollaborationId);
    }
  }, [deck.collaboration?.id, onLinked, storedCollaborationId]);

  useEffect(() => {
    if (shareUrl || !isShareApiConfigured()) return;
    let cancelled = false;
    setIsPublishing(true);
    setPublishError(null);

    void publishSharedDeck(deck)
      .then((published) => {
        if (cancelled) return;
        setShareId(published.shareId);
        setShareUrl(buildSharedDeckUrl(published.shareId));
      })
      .catch((err) => {
        if (!cancelled) setPublishError(err instanceof Error ? err.message : "Could not create a share link.");
      })
      .finally(() => {
        if (!cancelled) setIsPublishing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deck, shareUrl]);

  const shareNatively = async (url: string) => {
    const shared = await shareDeckNative(deck, url);
    if (!shared) {
      showToast({
        title: "Native sharing unavailable",
        message: "Copy the link to share this deck.",
        duration: 5000,
      });
    }
  };

  const shareDeck = async () => {
    setPublishError(null);
    if (shareUrl) {
      await shareNatively(shareUrl);
      return;
    }
    if (!isShareApiConfigured()) {
      setPublishError("Link sharing is not configured on this site yet.");
      return;
    }

    setIsPublishing(true);
    try {
      const published = await publishSharedDeck(deck);
      const url = buildSharedDeckUrl(published.shareId);
      setShareId(published.shareId);
      setShareUrl(url);
      await shareNatively(url);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Could not create a share link.");
    } finally {
      setIsPublishing(false);
    }
  };

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
      rememberCollaborationLink(deck.id, collaborationId);
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
      <div className="space-y-5">
        <section className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Share this deck</p>
            <p className="text-sm">Anyone with this link can open the deck and add a copy to their browser.</p>
          </div>
          {isPublishing ? (
            <p className="text-sm inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating share link…
            </p>
          ) : shareUrl ? (
            <>
              <div className="pc-bevel-inset p-3 break-all text-xs">{shareUrl}</div>
              <div className="flex flex-wrap justify-end gap-2">
                {showNativeShare ? (
                  <Button type="button" variant="primary" onClick={() => void shareDeck()}>
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void copyLink()}>
                  <Copy className="w-4 h-4" />
                  Copy link
                </Button>
              </div>
            </>
          ) : (
            <>
              {publishError ? <p className="text-xs pc-bevel-inset p-3">{publishError}</p> : null}
              <div className="flex justify-end">
                <Button type="button" onClick={() => void shareDeck()} disabled={isPublishing}>
                  <Share2 className="w-4 h-4" />
                  Retry share link
                </Button>
              </div>
              {publishError ? <Button type="button" onClick={downloadJson}><Download className="w-4 h-4" />Download JSON</Button> : null}
            </>
          )}
        </section>

        <section className="space-y-3 border-t border-zinc-200 pt-5">
          <div>
            <p className="text-sm font-semibold">Collaborate on this deck</p>
            <div className="mt-2 flex items-start gap-2 border-l-4 border-pc-warning bg-pc-warning p-3 text-xs text-pc-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p><span className="font-bold">Anyone with this link can edit this playlist.</span> Only share it with people you trust.</p>
            </div>
          </div>
          {collaborationUrl ? (
            <>
              <div className="pc-bevel-inset p-3 break-all text-xs">{collaborationUrl}</div>
              <div className="flex flex-wrap justify-end gap-2">
                {showNativeShare ? (
                  <Button type="button" variant="primary" onClick={() => void shareNatively(collaborationUrl)}>
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void copyLink(collaborationUrl, "Collaborative link copied to clipboard.")}>
                  <Copy className="w-4 h-4" />
                  Copy link
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-end">
              <Button type="button" onClick={() => void generateCollaborationLink()} disabled={isCreatingCollaboration}>
                {isCreatingCollaboration ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                {isCreatingCollaboration ? "Creating collaboration link…" : "Generate collaboration link"}
              </Button>
            </div>
          )}
          {collaborationError ? <p className="text-xs pc-bevel-inset p-3">{collaborationError}</p> : null}
        </section>

        {shareId ? <p className="text-xs opacity-70">Share id: {shareId}</p> : null}
      </div>
    </PcModal>
  );
};
