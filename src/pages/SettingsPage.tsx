import React, { useState } from "react";
import { Button, Group, Input, Radio, Window, type DesktopTheme } from "@miquelt9/pc-ui";
import { useAuth } from "../state/AuthContext";
import { useDeck } from "../state/DeckContext";
import { useTheme } from "../state/ThemeContext";
import { getRedirectUri } from "../lib/spotify/auth";
import { SAMPLE_POP_HITS_DECK } from "../lib/storage/mockDeck";
import { saveStoredDecks } from "../lib/storage/decks";
import {
  Key,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  RotateCcw,
  LogIn,
  LogOut,
  Info,
  Monitor,
  Moon,
  Sun,
  Code,
} from "lucide-react";

const GITHUB_REPO_URL = "https://github.com/miquelt9/bingo-musical";

export const SettingsPage: React.FC = () => {
  const { clientId, updateClientId, isAuthenticated, login, logout, error } = useAuth();
  const { refreshDecks } = useDeck();
  const { theme, setTheme } = useTheme();

  const [inputClientId, setInputClientId] = useState(clientId);
  const [copiedUri, setCopiedUri] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const redirectUri = getRedirectUri();

  const handleSaveClientId = (e: React.FormEvent) => {
    e.preventDefault();
    updateClientId(inputClientId);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleCopyUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2500);
  };

  const handleResetSampleDeck = () => {
    if (confirm("Reset local storage and restore the default Sample Pop Hits Deck?")) {
      saveStoredDecks([SAMPLE_POP_HITS_DECK]);
      refreshDecks();
      alert("Sample deck restored!");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Window title="App Settings & Integrations">
        <p className="text-sm mb-2">Configure your Spotify Client ID and local app options.</p>
      </Window>

      <Window
        title={
          <span className="inline-flex items-center gap-2">
            {theme === "light" ? (
              <Sun className="w-4 h-4" />
            ) : theme === "dark" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
            Appearance
          </span>
        }
      >
        <p className="text-xs mb-3">
          Classic teal desktop, Night Win9x dark, or follow the operating system. Printed bingo
          cards stay white.
        </p>
        <Group legend="Color scheme">
          <div className="flex flex-col gap-2">
            {(
              [
                ["light", "Light — classic teal desktop"],
                ["dark", "Dark — Night Win9x"],
                ["system", "System — match OS light or dark"],
              ] as const satisfies ReadonlyArray<readonly [DesktopTheme, string]>
            ).map(([value, label]) => (
              <Radio
                key={value}
                name="pc-theme"
                checked={theme === value}
                onChange={() => setTheme(value)}
                label={label}
              />
            ))}
          </div>
        </Group>
      </Window>

      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <Key className="w-4 h-4" />
            Spotify PKCE Authentication
          </span>
        }
      >
        <p className="text-xs mb-3">
          {isAuthenticated ? "Connected" : "Not Connected"} — Direct browser Authorization Code flow with
          PKCE (no client secret needed).
        </p>

        <div className="pc-bevel-inset p-3 text-xs space-y-2 mb-4">
          <p className="font-semibold">Spotify is optional and blocked for most personal apps.</p>
          <p>
            Spotify requires a Premium developer account and limits new apps to 5 allowlisted users. Use a
            pasted song list or a YouTube playlist instead.
          </p>
        </div>

        <div className="pc-bevel-inset p-3 text-xs space-y-3 mb-4">
          <div className="flex items-center gap-2 font-bold">
            <Info className="w-4 h-4" />
            Optional Spotify Client ID (Premium required):
          </div>
          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>
              Go to the{" "}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="pc-link inline-flex items-center gap-0.5"
              >
                Spotify Developer Dashboard
                <ExternalLink className="w-3 h-3" />
              </a>{" "}
              and log in.
            </li>
            <li>
              Click <strong>Create app</strong> (name it e.g. <em>Musical Bingo Creator</em>).
            </li>
            <li>
              Under <strong>Redirect URIs</strong> in your Spotify app settings, add the exact URI below.
            </li>
            <li>
              Copy the <strong>Client ID</strong> and paste it into the field below.
            </li>
          </ol>
        </div>

        <label className="block text-xs font-bold mb-1.5">
          Your Spotify App Redirect URI (Must match exactly in Spotify Dashboard):
        </label>
        <div className="flex items-center gap-2 mb-4">
          <Input type="text" readOnly value={redirectUri} className="flex-1 font-mono text-xs" />
          <Button type="button" onClick={handleCopyUri}>
            {copiedUri ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedUri ? "Copied!" : "Copy URI"}
          </Button>
        </div>

        <form onSubmit={handleSaveClientId} className="space-y-4">
          <label className="block text-xs font-bold">
            Custom Spotify Client ID
            <Input
              type="text"
              className="w-full mt-1 font-mono"
              value={inputClientId}
              onChange={(e) => setInputClientId(e.target.value)}
              placeholder="e.g. 3a7b9c1d2e5f8a4b6c0d..."
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary">
                Save Client ID
              </Button>
              {savedSuccess && (
                <span className="text-xs font-semibold inline-flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  Saved to localStorage!
                </span>
              )}
            </div>
            {isAuthenticated ? (
              <Button type="button" onClick={logout}>
                <LogOut className="w-4 h-4" />
                Log Out from Spotify
              </Button>
            ) : (
              <Button type="button" onClick={() => login()}>
                <LogIn className="w-4 h-4" />
                Connect with Spotify
              </Button>
            )}
          </div>

          {error && <div className="pc-bevel-inset p-3 text-xs">{error}</div>}
        </form>
      </Window>

      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Local Storage & Sample Decks
          </span>
        }
      >
        <div className="flex items-center justify-between gap-4 pc-bevel-inset p-3">
          <div>
            <h4 className="text-sm font-semibold">Reset Default Pop Classics Deck</h4>
            <p className="text-xs mt-0.5">
              Restores the 30-track classic sample deck with pre-matched YouTube clips.
            </p>
          </div>
          <Button type="button" onClick={handleResetSampleDeck}>
            Reset Sample Deck
          </Button>
        </div>
      </Window>

      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Zero-Backend & Client-Side Privacy
          </span>
        }
      >
        <p className="text-xs leading-relaxed">
          Musical Bingo Creator runs 100% locally in your web browser. Your Spotify tokens, custom decks,
          and game progress never leave your device. YouTube video playback uses standard embed controls
          with zero API secrets.
        </p>
      </Window>

      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <Code className="w-4 h-4" />
            Open Source
          </span>
        }
      >
        <p className="text-xs leading-relaxed">
          Musical Bingo Creator is free and open source. View the code, report issues, or contribute on
          GitHub.
        </p>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="pc-link inline-flex items-center gap-1 mt-2 text-xs font-semibold"
        >
          miquelt9/bingo-musical
          <ExternalLink className="w-3 h-3" />
        </a>
      </Window>
    </div>
  );
};
