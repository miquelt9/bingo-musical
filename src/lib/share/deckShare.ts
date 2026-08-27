import { Deck } from "../../types/deck";
import { serializeDeckForExport } from "../storage/decks";
import { downloadTextFile } from "../storage/download";

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

export function buildShareMessage(deck: Deck): string {
  const importUrl = getImportPageUrl();
  const homeUrl = getHomePageUrl();

  return [
    `I made a Musical Bingo deck: "${deck.name}"!`,
    "",
    `1. Open this link: ${importUrl}`,
    "2. Import the attached JSON file",
    "",
    `Create your own at ${homeUrl}`,
  ].join("\n");
}

export function deckToShareFile(deck: Deck): File {
  const { filename, jsonText } = serializeDeckForExport(deck);
  return new File([jsonText], filename, { type: "application/json" });
}

export function downloadDeckFile(deck: Deck): void {
  const { filename, jsonText } = serializeDeckForExport(deck);
  downloadTextFile(filename, jsonText, "application/json");
}

export function canShareDeckFile(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareDeckNative(deck: Deck): Promise<boolean> {
  const file = deckToShareFile(deck);
  if (!canShareDeckFile(file)) {
    return false;
  }

  try {
    await navigator.share({
      title: `Musical Bingo: ${deck.name}`,
      text: buildShareMessage(deck),
      files: [file],
      url: getImportPageUrl(),
    });
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

export function getPlatformShareUrls(deck: Deck): PlatformShareUrls {
  const message = buildShareMessage(deck);
  const importUrl = getImportPageUrl();

  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(importUrl)}&text=${encodeURIComponent(message)}`,
    email: `mailto:?subject=${encodeURIComponent(`Musical Bingo deck: ${deck.name}`)}&body=${encodeURIComponent(message)}`,
  };
}
