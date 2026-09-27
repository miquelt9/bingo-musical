import { describe, expect, it } from "vitest";
import type { Deck } from "../../types/deck";
import { getHomePageUrl } from "./deckShare";
import {
  buildCollaborativeMessage,
  buildCollaborativeUrl,
  getCollaborativeShareUrls,
} from "./collaborativeShare";

const deck = { name: "Friday Night" } as Deck;

describe("collaborative playlist links", () => {
  it("builds an encoded collab hash URL and a message that includes the deck name", () => {
    const url = buildCollaborativeUrl("room 1");
    expect(url.startsWith(getHomePageUrl())).toBe(true);
    expect(url).toContain("#/collab/room%201");

    const message = buildCollaborativeMessage(deck, url);
    expect(message).toBe(
      `Join my collaborative musical bingo playlist "${deck.name}" — add songs here: ${url}`,
    );

    const urls = getCollaborativeShareUrls(deck, url);
    expect(urls.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(message)}`);
    expect(urls.telegram).toContain(encodeURIComponent(url));
    expect(urls.email).toContain(encodeURIComponent("Collaborative playlist: Friday Night"));
    expect(urls.email).toContain(encodeURIComponent(url));
  });
});
