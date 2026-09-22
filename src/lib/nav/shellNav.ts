export type ShellTab = "settings" | "cards" | "host" | "editor" | "decks";

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function activeTabFromPath(pathname: string): ShellTab | null {
  const path = normalizePath(pathname);
  if (path === "/settings") return "settings";
  if (/\/cards$/.test(path)) return "cards";
  if (/\/play$/.test(path)) return "host";
  if (/^\/deck\/[^/]+$/.test(path)) return "editor";
  if (path === "/") return "decks";
  return null;
}

export function routeDeckIdFromPath(pathname: string): string | undefined {
  return pathname.match(/^\/deck\/([^/]+)/)?.[1];
}

export function isDesktopTaskbarVisible(isMobile: boolean): boolean {
  return !isMobile;
}

/**
 * Phone header section icons for the current tab.
 * Omits Decks (Back covers it) and the active page. Home only exposes Settings.
 */
export function phoneSectionTabs(activeTab: ShellTab | null): ShellTab[] {
  switch (activeTab) {
    case "editor":
      return ["cards", "host", "settings"];
    case "cards":
      return ["editor", "host", "settings"];
    case "host":
      return ["editor", "cards", "settings"];
    case "decks":
      return ["settings"];
    default:
      return [];
  }
}

export function deckSwitchConfirmMessage(input: {
  activeTab: ShellTab | null;
  targetName: string;
  hasGameInProgress: boolean;
  hasActiveClip: boolean;
}): string | null {
  const { activeTab, targetName, hasGameInProgress, hasActiveClip } = input;
  const needsConfirm =
    activeTab === "editor" ||
    activeTab === "cards" ||
    (activeTab === "host" && (hasGameInProgress || hasActiveClip));

  if (!needsConfirm) return null;

  return activeTab === "host"
    ? `Switch to "${targetName}"? You'll leave the current host session.`
    : `Switch to "${targetName}"? You'll leave the current deck.`;
}
