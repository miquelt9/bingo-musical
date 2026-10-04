import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DisplayPage } from "./DisplayPage";
import { makeDeck, makeTrack } from "../test/fixtures";

vi.mock("@miquelt9/pc-ui", () => ({
  Window: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <section>
      <div>{title}</div>
      {children}
    </section>
  ),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

const deckApi = vi.hoisted(() => ({
  decks: [] as ReturnType<typeof makeDeck>[],
  isLoading: false,
  loadDeck: vi.fn(),
  createDeck: vi.fn(),
}));

vi.mock("../state/DeckContext", () => ({
  useDeck: () => deckApi,
}));

vi.mock("../state/ThemeContext", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("../components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderDisplay(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/deck/:id/display" element={<DisplayPage />} />
        <Route path="/" element={<h1>Home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("display missing deck", () => {
  beforeEach(() => {
    deckApi.decks = [];
    deckApi.isLoading = false;
    deckApi.loadDeck.mockReset();
    deckApi.createDeck.mockReset();
  });

  it("stays on Deck not found and can go home", async () => {
    const user = userEvent.setup();
    renderDisplay("/deck/missing/display");

    expect(screen.getByRole("heading", { level: 2, name: "Deck not found" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Home" })).toBeNull();

    await user.click(screen.getByRole("link", { name: "Go to decks" }));

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
  });

  it("does not show Deck not found while decks are still loading", () => {
    deckApi.isLoading = true;
    renderDisplay("/deck/missing/display");

    expect(screen.queryByText("Deck not found")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Home" })).toBeNull();
  });

  it("still shows the audience display when the deck exists", () => {
    deckApi.decks = [makeDeck([makeTrack({ id: "song-1" })], { id: "deck-party", name: "Party" })];
    renderDisplay("/deck/deck-party/display");

    expect(screen.getByRole("heading", { name: "Party" })).toBeInTheDocument();
    expect(screen.getByText("Waiting for host…")).toBeInTheDocument();
    expect(screen.queryByText("Deck not found")).toBeNull();
  });
});
