import React, { useEffect, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { Copy, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { Deck } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { useToast } from "../../state/ToastContext";
import {
  buildShareMessage,
  buildSharedDeckUrl,
  getPlatformShareUrls,
} from "../../lib/share/deckShare";
import { isShareApiConfigured, publishSharedDeck } from "../../lib/share/sharedDecksApi";

interface ShareDeckModalProps {
  deck: Deck;
  initialShareId?: string;
  initialShareUrl?: string;
  onClose: () => void;
}

export const ShareDeckModal: React.FC<ShareDeckModalProps> = ({
  deck,
  initialShareId,
  initialShareUrl,
  onClose,
}) => {
  const { showToast } = useToast();
  const [shareId, setShareId] = useState<string | undefined>(initialShareId);
  const [shareUrl, setShareUrl] = useState<string | undefined>(initialShareUrl);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (shareUrl || !isShareApiConfigured()) {
      return;
    }

    let cancelled = false;
    setIsPublishing(true);
    setPublishError(null);

    void publishSharedDeck(deck)
      .then(({ shareId: publishedId }) => {
        if (cancelled) return;
        const url = buildSharedDeckUrl(publishedId);
        setShareId(publishedId);
        setShareUrl(url);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setPublishError(err.message);
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
  }, [deck, shareUrl]);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast({
        title: "Link copied",
        message: "Share link copied to clipboard.",
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

  const copyMessage = async () => {
    if (!shareUrl) return;
    const message = buildShareMessage(deck, shareUrl);
    try {
      await navigator.clipboard.writeText(message);
      showToast({
        title: "Copied",
        message: "Share message copied to clipboard.",
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={() => void copyLink()}>
                <Copy className="w-4 h-4" />
                Copy link
              </Button>
              <Button type="button" onClick={() => void copyMessage()}>
                <Copy className="w-4 h-4" />
                Copy message
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={getPlatformShareUrls(deck, shareUrl).whatsapp} target="_blank" rel="noopener noreferrer" className="pc-button">
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
              <a href={getPlatformShareUrls(deck, shareUrl).telegram} target="_blank" rel="noopener noreferrer" className="pc-button">
                <Send className="w-4 h-4" />
                Telegram
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
                ? "Could not create a share link right now. Try again later, or export the deck as JSON from Settings."
                : "Link sharing is not configured on this site yet. Export the deck as JSON from Settings to share it manually."}
            </p>
            {publishError ? <p className="text-xs pc-bevel-inset p-3">{publishError}</p> : null}
            <Link to="/settings" className="pc-button inline-flex" onClick={onClose}>
              Open Settings
            </Link>
          </>
        )}

        {shareId ? <p className="text-xs opacity-70">Share id: {shareId}</p> : null}
      </div>
    </PcModal>
  );
};
