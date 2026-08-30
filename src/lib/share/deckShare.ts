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

export function buildShareMessage(deck: Deck, shareUrl?: string): string {
  const homeUrl = getHomePageUrl();

  if (shareUrl) {
    return [
      `I made a Musical Bingo deck: "${deck.name}"!`,
      "",
      `Open this link to use it: ${shareUrl}`,
      "",
      `Create your own at ${homeUrl}`,
    ].join("\n");
  }

  return [
    `I made a Musical Bingo deck: "${deck.name}"!`,
    "",
    "Ask me for the share link, or export the deck as JSON from Settings → Advanced options.",
    "",
    `Create your own at ${homeUrl}`,
  ].join("\n");
}

export async function shareDeckNative(deck: Deck, shareUrl: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  const shareData: ShareData = {
    title: `Musical Bingo: ${deck.name}`,
    text: buildShareMessage(deck, shareUrl),
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
    email: `mailto:?subject=${encodeURIComponent(`Musical Bingo deck: ${deck.name}`)}&body=${encodeURIComponent(message)}`,
  };
}
