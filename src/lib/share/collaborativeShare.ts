import { Deck } from "../../types/deck";
import { getAppBasePath, getAppOrigin } from "./deckShare";

export function buildCollaborativeUrl(id: string): string {
  return `${getAppOrigin()}${getAppBasePath()}#/collab/${encodeURIComponent(id)}`;
}

export function buildCollaborativeMessage(deck: Deck, url: string): string {
  return `Join my collaborative musical bingo playlist "${deck.name}" — add songs here: ${url}`;
}

export function getCollaborativeShareUrls(deck: Deck, url: string) {
  const message = buildCollaborativeMessage(deck, url);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`,
    email: `mailto:?subject=${encodeURIComponent(`Collaborative playlist: ${deck.name}`)}&body=${encodeURIComponent(url)}`,
  };
}
