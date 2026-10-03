import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CallNextControls, type HostGameOutlook } from "./CallNextControls";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
});

vi.mock("@miquelt9/pc-ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Window: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

const outlook: HostGameOutlook = {
  songsLeft: 27,
  line: { expectedDraws: 8.2, estimatedSeconds: 120 },
  fullCard: { expectedDraws: 22.5, estimatedSeconds: 3600 },
};

function renderControls(hostOutlook: HostGameOutlook | null) {
  render(
    <CallNextControls
      onCallNext={() => {}}
      onReplayCurrent={() => {}}
      onTogglePlayPause={() => {}}
      onStop={() => {}}
      onToggleMute={() => {}}
      onVolumeChange={() => {}}
      onToggleVideo={() => {}}
      showVideo={false}
      playerState={null}
      isPlaying={false}
      currentTrack={null}
      remainingCount={27}
      totalCount={28}
      calledCount={1}
      hostOutlook={hostOutlook}
      autoCallNextOnEnd
      onToggleAutoCallNext={() => {}}
      autoRevealOnEnd
      onToggleAutoReveal={() => {}}
      crossfadeOverlapMs={1500}
      onCrossfadeOverlapChange={() => {}}
      gameStarted
      supportsVideoPreview={false}
    />
  );
}

describe("Host controls outlook", () => {
  it("shows songs left and the first-line and full-card figures", () => {
    renderControls(outlook);
    expect(screen.getByText("songs left")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(screen.getByText("First line")).toBeInTheDocument();
    expect(screen.getByText("2 min")).toBeInTheDocument();
    expect(screen.getByText("· 8.2 songs called")).toBeInTheDocument();
    expect(screen.getByText("Full card")).toBeInTheDocument();
    expect(screen.getByText("1 hr")).toBeInTheDocument();
    expect(screen.getByText("· 22.5 songs called")).toBeInTheDocument();
  });

  it("hides songs left and the estimate when the deck cannot be hosted", () => {
    renderControls(null);
    expect(screen.getByText("songs called")).toBeInTheDocument();
    expect(screen.queryByText("songs left")).not.toBeInTheDocument();
    expect(screen.queryByText("First line")).not.toBeInTheDocument();
    expect(screen.queryByText("Full card")).not.toBeInTheDocument();
  });
});
