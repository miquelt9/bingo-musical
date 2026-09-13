const COLLABORATION_LINKS_KEY = "bingo-musical:collaboration-links";

type StoredCollaborationLinks = Record<string, string>;

export function readStoredCollaborationLinks(): StoredCollaborationLinks {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLABORATION_LINKS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0,
      ),
    );
  } catch {
    return {};
  }
}

export function getStoredCollaborationId(deckId: string): string | undefined {
  return readStoredCollaborationLinks()[deckId];
}

export function rememberCollaborationLink(deckId: string, collaborationId: string): void {
  try {
    const links = readStoredCollaborationLinks();
    links[deckId] = collaborationId;
    localStorage.setItem(COLLABORATION_LINKS_KEY, JSON.stringify(links));
  } catch {
    // Link creation still succeeds if local storage is unavailable.
  }
}
