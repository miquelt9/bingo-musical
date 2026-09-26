import { describe, expect, it, vi } from "vitest";
import type { Deck } from "../../types/deck";
import {
  buildShareMessage,
  buildSharedDeckUrl,
  getHomePageUrl,
  getImportPageUrl,
  getPlatformShareUrls,
  isNativeShareAvailable,
  shareDeckNative,
} from "./deckShare";

const deck = { name: "Friday Night" } as Deck;
const shareUrl = "https://example.test/bingo#/share/abc";

describe("deck share links", () => {
  it("builds hash routes for home, import, and a shared deck", () => {
    expect(getHomePageUrl().endsWith("/")).toBe(true);
    expect(getImportPageUrl()).toContain("#/import");
    expect(buildSharedDeckUrl("id 1")).toContain("#/share/id%201");
    expect(buildSharedDeckUrl("id 1").startsWith(getHomePageUrl())).toBe(true);
  });

  it("uses the share URL as the message and encodes platform links", () => {
    expect(buildShareMessage(deck, shareUrl)).toBe(shareUrl);
    expect(buildShareMessage(deck)).toBe("");

    const urls = getPlatformShareUrls(deck, shareUrl);
    expect(urls.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`);
    expect(urls.telegram).toContain(`url=${encodeURIComponent(shareUrl)}`);
    expect(urls.email).toContain(encodeURIComponent("Musical Bingo: Friday Night"));
    expect(urls.email).toContain(encodeURIComponent(shareUrl));
  });

  it("reports when the native share sheet is missing", async () => {
    expect(isNativeShareAvailable()).toBe(false);
    await expect(shareDeckNative(deck, shareUrl)).resolves.toBe(false);
  });

  it("treats a completed or dismissed share sheet as success", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });

    try {
      await expect(shareDeckNative(deck, shareUrl)).resolves.toBe(true);
      expect(share).toHaveBeenCalledWith({ url: shareUrl });

      share.mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
      await expect(shareDeckNative(deck, shareUrl)).resolves.toBe(true);

      canShare.mockReturnValueOnce(false);
      await expect(shareDeckNative(deck, shareUrl)).resolves.toBe(false);

      share.mockRejectedValueOnce(new Error("unsupported"));
      canShare.mockReturnValue(true);
      await expect(shareDeckNative(deck, shareUrl)).resolves.toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
