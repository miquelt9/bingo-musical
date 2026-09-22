import { describe, expect, it } from "vitest";
import {
  activeTabFromPath,
  deckSwitchConfirmMessage,
  isDesktopTaskbarVisible,
  routeDeckIdFromPath,
} from "./shellNav";

describe("shell navigation", () => {
  it("maps routes to the desktop taskbar tabs", () => {
    expect(activeTabFromPath("/")).toBe("decks");
    expect(activeTabFromPath("/settings")).toBe("settings");
    expect(activeTabFromPath("/deck/abc")).toBe("editor");
    expect(activeTabFromPath("/deck/abc/cards")).toBe("cards");
    expect(activeTabFromPath("/deck/abc/play")).toBe("host");
    expect(activeTabFromPath("/import")).toBeNull();
    expect(routeDeckIdFromPath("/deck/abc/play")).toBe("abc");
  });

  it("keeps the desktop taskbar and hides it on mobile", () => {
    expect(isDesktopTaskbarVisible(false)).toBe(true);
    expect(isDesktopTaskbarVisible(true)).toBe(false);
  });

  it("asks before leaving an editor, cards page, or live host session", () => {
    expect(
      deckSwitchConfirmMessage({
        activeTab: "editor",
        targetName: "Party",
        hasGameInProgress: false,
        hasActiveClip: false,
      }),
    ).toMatch(/leave the current deck/);

    expect(
      deckSwitchConfirmMessage({
        activeTab: "cards",
        targetName: "Party",
        hasGameInProgress: false,
        hasActiveClip: false,
      }),
    ).toMatch(/leave the current deck/);

    expect(
      deckSwitchConfirmMessage({
        activeTab: "host",
        targetName: "Party",
        hasGameInProgress: true,
        hasActiveClip: false,
      }),
    ).toMatch(/host session/);

    expect(
      deckSwitchConfirmMessage({
        activeTab: "host",
        targetName: "Party",
        hasGameInProgress: false,
        hasActiveClip: false,
      }),
    ).toBeNull();

    expect(
      deckSwitchConfirmMessage({
        activeTab: "decks",
        targetName: "Party",
        hasGameInProgress: false,
        hasActiveClip: false,
      }),
    ).toBeNull();
  });
});
