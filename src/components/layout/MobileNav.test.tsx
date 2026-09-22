import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MobileNavProvider, MobileNavTrigger, type MobileNavModel } from "./MobileNav";

function model(overrides: Partial<MobileNavModel> = {}): MobileNavModel {
  return {
    activeTab: "decks",
    links: [
      { id: "decks", label: "Decks", to: "/", end: true, enabled: true, icon: <span>D</span> },
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
    decks: [
      { id: "one", name: "Friday", trackCount: 30 },
      { id: "two", name: "Party", trackCount: 12 },
    ],
    currentDeckId: "one",
    showDeckSelector: true,
    backgroundTask: null,
    onDeckChange: () => true,
    onBlockedNav: () => {},
    ...overrides,
  };
}

function renderNav(current: MobileNavModel = model()) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <MobileNavProvider enabled model={current}>
        <MobileNavTrigger />
      </MobileNavProvider>
    </MemoryRouter>,
  );
}

describe("MobileNav", () => {
  it("opens from the Menu control and closes on Escape and outside click", async () => {
    const user = userEvent.setup();
    renderNav();

    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".pc-taskbar")).toBeNull();

    await user.click(trigger);
    const menu = screen.getByRole("navigation", { name: "Pages" });
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Active deck" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });

  it("marks the active route and explains disabled Cards and Host actions", async () => {
    const user = userEvent.setup();
    const onBlockedNav = vi.fn();
    renderNav(model({ activeTab: "decks", onBlockedNav }));

    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute("aria-current", "page");

    const cards = screen.getByRole("button", { name: /Cards/ });
    expect(cards).toHaveAttribute("aria-disabled", "true");
    expect(cards).toHaveTextContent("Need at least 24 songs for bingo cards");
    await user.click(cards);
    expect(onBlockedNav).toHaveBeenCalledWith("Need at least 24 songs for bingo cards");
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
  });

  it("keeps the menu open when a deck switch needs confirmation", async () => {
    const user = userEvent.setup();
    const onDeckChange = vi.fn(() => false);
    renderNav(model({ onDeckChange }));

    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByText("Friday (30)", { selector: ".pc-mobile-nav-deck-current" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Active deck" }), "two");
    expect(onDeckChange).toHaveBeenCalledWith("two");
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
  });

  it("closes after a deck switch that applies immediately", async () => {
    const user = userEvent.setup();
    const onDeckChange = vi.fn(() => true);
    renderNav(model({ onDeckChange }));

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Active deck" }), "two");
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });
});
