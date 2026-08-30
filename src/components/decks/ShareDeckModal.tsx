import React, { useEffect, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { Copy, Download, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { Deck } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { useToast } from "../../state/ToastContext";
import {
  buildShareMessage,
  buildSharedDeckUrl,
  downloadDeckFile,
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

  const message = buildShareMessage(deck, shareUrl);
  const platformUrls = getPlatformShareUrls(deck, shareUrl);

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

  const handleDownload = () => {
    downloadDeckFile(deck);
    showToast({
      title: "Deck downloaded",
      message: "JSON file saved as a backup.",
      duration: 4000,
    });
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
              <Button type="button" onClick={handleDownload}>
                <Download className="w-4 h-4" />
                Download JSON
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={platformUrls.whatsapp} target="_blank" rel="noopener noreferrer" className="pc-button">
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
              <a href={platformUrls.telegram} target="_blank" rel="noopener noreferrer" className="pc-button">
                <Send className="w-4 h-4" />
                Telegram
              </a>
              <a href={platformUrls.email} className="pc-button">
                <Mail className="w-4 h-4" />
                Email
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">
              {publishError
                ? "Could not create a share link. You can still send the JSON file manually."
                : "Link sharing is not configured yet. Download the JSON file to share this deck."}
            </p>
            {publishError ? <p className="text-xs pc-bevel-inset p-3">{publishError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={handleDownload}>
                <Download className="w-4 h-4" />
                Download deck
              </Button>
              <Button type="button" onClick={() => void copyMessage()}>
                <Copy className="w-4 h-4" />
                Copy import message
              </Button>
            </div>
          </>
        )}

        {shareId ? <p className="text-xs opacity-70">Share id: {shareId}</p> : null}

        {!shareUrl && !isPublishing ? (
          <pre className="text-xs pc-bevel-inset p-3 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
            {message}
          </pre>
        ) : null}
      </div>
    </PcModal>
  );
};
