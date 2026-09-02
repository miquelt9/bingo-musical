import { Deck } from "../../types/deck";
import { serializeDeckForExport } from "../storage/decks";
import {
  buildCanonicalSharePayload,
  canonicalizeSharePayload,
  canonicalPayloadsEqual,
  computeShareId,
} from "./deckCanonical";

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

export async function computeShareIdForDeck(deck: Deck): Promise<string> {
  return computeShareId(buildCanonicalSharePayload(deck));
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

async function tryResolveExistingShare(
  shareId: string,
  canonical: ReturnType<typeof buildCanonicalSharePayload>
): Promise<string | null> {
  const response = await fetch(`${API_URL}/api/decks/${encodeURIComponent(shareId)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const existing = await response.json();
  const existingCanonical = canonicalizeSharePayload(existing);
  if (existingCanonical && canonicalPayloadsEqual(existingCanonical, canonical)) {
    return shareId;
  }

  return null;
}

export async function publishSharedDeck(deck: Deck): Promise<PublishedSharedDeck> {
  if (!API_URL) {
    throw new Error("Link sharing is not configured yet.");
  }

  const canonical = buildCanonicalSharePayload(deck);
  const shareId = await computeShareId(canonical);
  const existingShareId = await tryResolveExistingShare(shareId, canonical);
  if (existingShareId) {
    return { shareId: existingShareId };
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
  if (body.shareId && body.shareId !== shareId) {
    console.warn(
      `Share API returned id "${body.shareId}" but content hash is "${shareId}". ` +
        "The share API may need redeploying."
    );
  }

  // The link is always derived from deck content, not from a server-assigned random id.
  return { shareId };
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
