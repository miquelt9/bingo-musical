import { Deck } from "../../types/deck";
import { serializeDeckForExport } from "../storage/decks";

const API_URL = (import.meta.env.VITE_SHARE_API_URL ?? "").replace(/\/$/, "");

export function isShareApiConfigured(): boolean {
  return API_URL.length > 0;
}

export function getShareApiUrl(): string {
  return API_URL;
}

export interface PublishedSharedDeck {
  shareId: string;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) {
      return body.error;
    }
  } catch {
    // ignore parse errors
  }
  return `Request failed (${response.status})`;
}

export async function publishSharedDeck(deck: Deck): Promise<PublishedSharedDeck> {
  if (!API_URL) {
    throw new Error("Link sharing is not configured yet.");
  }

  const { exportObject } = serializeDeckForExport(deck);
  const response = await fetch(`${API_URL}/api/decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportObject),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const body = (await response.json()) as { shareId?: string };
  if (!body.shareId) {
    throw new Error("Share API returned an invalid response.");
  }

  return { shareId: body.shareId };
}

export async function fetchSharedDeckPayload(shareId: string): Promise<unknown> {
  if (!API_URL) {
    throw new Error("Link sharing is not configured yet.");
  }

  const response = await fetch(`${API_URL}/api/decks/${encodeURIComponent(shareId)}`);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}
