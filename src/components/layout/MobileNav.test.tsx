import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  MobileBackgroundTaskStatus,
  MobileNavProvider,
  MobileSectionNav,
  type MobileNavModel,
} from "./MobileNav";
import type { ShellTab } from "../../lib/nav/shellNav";

function model(overrides: Partial<MobileNavModel> = {}): MobileNavModel {
  return {
    activeTab: "editor",
    links: [
      { id: "editor", label: "Deck", to: "/deck/one", end: true, enabled: true, icon: <span>E</span> },
      {
        id: "cards",
        label: "Cards",
        to: "/deck/one/cards",
        enabled: false,
        blockReason: "Need at least 24 songs for bingo cards",
        icon: <span>C</span>,
      },
      { id: "host", label: "Host", to: "/deck/one/play", enabled: true, icon: <span>H</span> },
      { id: "settings", label: "Settings", to: "/settings", enabled: true, icon: <span>S</span> },
    ],
    backgroundTask: null,
    onBlockedNav: () => {},
    ...overrides,
  };
}

function renderNav(current: MobileNavModel = model(), path = "/deck/one") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNavProvider enabled model={current}>
        <MobileSectionNav />
        <MobileBackgroundTaskStatus />
      </MobileNavProvider>
    </MemoryRouter>,
  );
}

describe("MobileSectionNav", () => {
  it("shows Cards, Host, and Settings on the editor and omits Deck", () => {
    renderNav(model({ activeTab: "editor" }));

    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Host" })).toHaveAttribute("href", "/deck/one/play");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: /Cards/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Deck" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Decks" })).toBeNull();
    expect(document.querySelector(".pc-taskbar")).toBeNull();
  });

  it("shows Deck, Host, and Settings on the cards page", () => {
    renderNav(model({ activeTab: "cards" }), "/deck/one/cards");

    expect(screen.getByRole("link", { name: "Deck" })).toHaveAttribute("href", "/deck/one");
    expect(screen.getByRole("link", { name: "Host" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cards/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Cards" })).toBeNull();
  });

  it("shows Deck, Cards, and Settings on the host page", () => {
    renderNav(
      model({
        activeTab: "host",
        links: model().links.map((link) =>
          link.id === "cards" ? { ...link, enabled: true, blockReason: undefined } : link,
        ),
      }),
      "/deck/one/play",
    );

    expect(screen.getByRole("link", { name: "Deck" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cards" })).toHaveAttribute("href", "/deck/one/cards");
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Host" })).toBeNull();
  });

  it("shows only Settings on the decks list", () => {
    renderNav(model({ activeTab: "decks" }), "/");

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("link", { name: "Deck" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Host" })).toBeNull();
  });

  it("hides section icons on settings and non-shell routes", () => {
    const { rerender } = renderNav(model({ activeTab: "settings" }), "/settings");
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();

    rerender(
      <MemoryRouter initialEntries={["/import"]}>
        <MobileNavProvider enabled model={model({ activeTab: null })}>
          <MobileSectionNav />
        </MobileNavProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
  });

  it("explains disabled Cards with a toast callback", async () => {
    const user = userEvent.setup();
    const onBlockedNav = vi.fn();
    renderNav(model({ activeTab: "editor", onBlockedNav }));

    const cards = screen.getByRole("button", { name: /Cards/ });
    expect(cards).toHaveAttribute("aria-disabled", "true");
    await user.click(cards);
    expect(onBlockedNav).toHaveBeenCalledWith("Need at least 24 songs for bingo cards");
  });

  it("shows background task status under the section row", () => {
    renderNav(
      model({
        activeTab: "editor" as ShellTab,
        backgroundTask: { label: "Matching", completed: 3, total: 10 },
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Matching (3/10)");
  });
});
