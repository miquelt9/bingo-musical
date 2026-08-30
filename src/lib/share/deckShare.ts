import { Deck } from "../../types/deck";

export function getAppOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

export function getAppBasePath(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

export function getImportPageUrl(): string {
  return `${getAppOrigin()}${getAppBasePath()}#/import`;
}

export function getHomePageUrl(): string {
  return `${getAppOrigin()}${getAppBasePath()}`;
}

export function buildSharedDeckUrl(shareId: string): string {
  return `${getAppOrigin()}${getAppBasePath()}#/share/${encodeURIComponent(shareId)}`;
}

function buildShareIntro(deck: Deck): string {
  return `Check out my "${deck.name}" musical bingo!`;
}

export function buildShareMessage(deck: Deck, shareUrl?: string): string {
  const intro = buildShareIntro(deck);

  if (shareUrl) {
    return `${intro} ${shareUrl}`;
  }

  return `${intro} Ask me for the link.`;
}

export async function shareDeckNative(deck: Deck, shareUrl: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  const shareData: ShareData = {
    title: `Musical Bingo: ${deck.name}`,
    text: buildShareIntro(deck),
    url: shareUrl,
  };

  try {
    if (typeof navigator.canShare === "function" && !navigator.canShare(shareData)) {
      return false;
    }

    await navigator.share(shareData);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return true;
    }
    return false;
  }
}

export interface PlatformShareUrls {
  whatsapp: string;
  telegram: string;
  email: string;
}

export function getPlatformShareUrls(deck: Deck, shareUrl: string): PlatformShareUrls {
  const message = buildShareMessage(deck, shareUrl);

  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(message)}`,
    email: `mailto:?subject=${encodeURIComponent(`Musical Bingo: ${deck.name}`)}&body=${encodeURIComponent(message)}`,
  };
}
