import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DeckNotFoundPage } from "./DeckNotFoundPage";

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
  decks: [] as unknown[],
  createDeck: vi.fn(),
}));

vi.mock("../state/DeckContext", () => ({
  useDeck: () => deckApi,
}));

function renderMissingDeck(path = "/deck/missing") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/deck/:id" element={<DeckNotFoundPage />} />
        <Route path="/" element={<h1>Home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("missing deck", () => {
  beforeEach(() => {
    deckApi.decks = [];
    deckApi.createDeck.mockReset();
  });

  it("shows a control that goes home", async () => {
    const user = userEvent.setup();
    renderMissingDeck();

    expect(screen.getByRole("heading", { level: 2, name: "Deck not found" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All decks" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Go to decks" }));

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
  });
});
