import React, { useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { Copy, Download, Mail, MessageCircle, Send } from "lucide-react";
import { Deck } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { useToast } from "../../state/ToastContext";
import {
  buildShareMessage,
  downloadDeckFile,
  getPlatformShareUrls,
} from "../../lib/share/deckShare";

interface ShareDeckModalProps {
  deck: Deck;
  onClose: () => void;
}

export const ShareDeckModal: React.FC<ShareDeckModalProps> = ({ deck, onClose }) => {
  const { showToast } = useToast();
  const [message] = useState(() => buildShareMessage(deck));
  const platformUrls = getPlatformShareUrls(deck);

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
        message: "Could not copy to clipboard. Select the text below manually.",
        duration: 5000,
      });
    }
  };

  const handleDownload = () => {
    downloadDeckFile(deck);
    showToast({
      title: "Deck downloaded",
      message: "Attach the JSON file when sharing on WhatsApp or other apps.",
      duration: 4000,
    });
  };

  return (
    <PcModal title={`Share "${deck.name}"`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm">
          Share the deck JSON file with friends. They can import it from the link in the message.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" onClick={copyMessage}>
            <Copy className="w-4 h-4" />
            Copy message
          </Button>
          <Button type="button" onClick={handleDownload}>
            <Download className="w-4 h-4" />
            Download deck
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={platformUrls.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="pc-button"
            onClick={handleDownload}
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </a>
          <a
            href={platformUrls.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className="pc-button"
            onClick={handleDownload}
          >
            <Send className="w-4 h-4" />
            Telegram
          </a>
          <a href={platformUrls.email} className="pc-button" onClick={handleDownload}>
            <Mail className="w-4 h-4" />
            Email
          </a>
        </div>

        <p className="text-xs">
          For WhatsApp and email, download the deck file first, then attach it to your message.
        </p>

        <pre className="text-xs pc-bevel-inset p-3 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          {message}
        </pre>
      </div>
    </PcModal>
  );
};
