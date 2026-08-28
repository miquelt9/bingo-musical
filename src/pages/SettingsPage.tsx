import React, { useState, useEffect } from "react";
import { Button, Group, Input, Radio, Window, Modal, type DesktopTheme } from "@miquelt9/pc-ui";
import { useAuth } from "../state/AuthContext";
import { useDeck } from "../state/DeckContext";
import { useTheme } from "../state/ThemeContext";
import { useToast } from "../state/ToastContext";
import { getRedirectUri } from "../lib/spotify/auth";
import { SAMPLE_POP_HITS_DECK } from "../lib/storage/mockDeck";
import { saveStoredDecks } from "../lib/storage/decks";
import { APP_NAME, GITHUB_REPO_URL } from "../lib/app/meta";
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
  AlertCircle,
} from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { clientId, updateClientId, isAuthenticated, login, logout, error } = useAuth();
  const { refreshDecks } = useDeck();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [inputClientId, setInputClientId] = useState(clientId);
  const [copiedUri, setCopiedUri] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    setInputClientId(clientId);
  }, [clientId]);

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
    saveStoredDecks([SAMPLE_POP_HITS_DECK]);
    refreshDecks();
    setShowResetModal(false);
    showToast({
      title: "Data reset",
      icon: <Check className="w-3.5 h-3.5" />,
      message: "All decks were replaced with the default Sample Pop Hits deck.",
      duration: 8000,
    });
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
            <h4 className="text-sm font-semibold">Reset all data to sample deck</h4>
            <p className="text-xs mt-0.5">
              Deletes every deck in local storage and restores only the 30-track Sample Pop Hits deck.
              This cannot be undone.
            </p>
          </div>
          <Button type="button" onClick={() => setShowResetModal(true)}>
            Reset All Data
          </Button>
        </div>
      </Window>

      {showResetModal && (
        <Modal
          open
          variant="danger"
          title="Reset all data to sample deck?"
          confirmLabel="Reset all data"
          cancelLabel="Cancel"
          onConfirm={handleResetSampleDeck}
          onCancel={() => setShowResetModal(false)}
        >
          <p className="text-sm">
            This will permanently delete <strong>all of your decks</strong> and replace them with the
            default Sample Pop Hits deck. Custom decks, matched songs, and game progress stored in this
            browser will be lost.
          </p>
        </Modal>
      )}

      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <Code className="w-4 h-4" />
            About &amp; Open Source
          </span>
        }
      >
        <p className="text-xs leading-relaxed">
          {APP_NAME} is a free personal hobby project, released under the{" "}
          <a
            href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
            className="pc-link"
          >
            MIT license
          </a>
          . View the source, report issues, or contribute on GitHub.
        </p>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="pc-link inline-flex items-center gap-1 mt-2 text-xs font-semibold"
        >
          {GITHUB_REPO_URL}
          <ExternalLink className="w-3 h-3" />
        </a>
      </Window>

      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Disclaimer
          </span>
        }
      >
        <ul className="text-xs leading-relaxed space-y-2 list-disc list-inside">
          <li>
            Not affiliated with YouTube, Google, Spotify, Apple, Deezer, or MusicBrainz.
          </li>
          <li>
            Playback uses the YouTube embedded player only. This app does not host, download, or
            redistribute music.
          </li>
          <li>
            Intended for private or social games at home with family and friends.
          </li>
          <li>
            Bars, ticketed events, or commercial venues may require music performance licenses
            (e.g. SGAE in Spain). That is the organizer&apos;s responsibility, not this app&apos;s.
          </li>
          <li>
            Song titles on printed cards are factual. You choose which YouTube videos to link.
          </li>
        </ul>
      </Window>

      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Privacy
          </span>
        }
      >
        <div className="text-xs leading-relaxed space-y-3">
          <p>
            {APP_NAME} runs in your web browser with no backend of its own. Your decks, game
            progress, embed cache, and preferences are stored in <strong>localStorage</strong> on
            your device and are not sent to us. If you connect Spotify, your tokens stay in
            localStorage too.
          </p>
          <p>
            When you use certain features, your browser may contact third parties directly:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>
              <strong>YouTube</strong> — iframe playback (may set cookies when you play a video)
            </li>
            <li>
              <strong>Invidious / Piped</strong> — public instances used for YouTube search and
              metadata
            </li>
            <li>
              <strong>iTunes, Deezer, MusicBrainz</strong> — song autocomplete
            </li>
            <li>
              <strong>noembed.com</strong> — embed permission checks
            </li>
            <li>
              <strong>Spotify</strong> — only if you choose to connect
            </li>
            <li>
              <strong>GitHub Pages</strong> — hosting; see the{" "}
              <a
                href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement"
                target="_blank"
                rel="noreferrer"
                className="pc-link inline-flex items-center gap-0.5"
              >
                GitHub Privacy Statement
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
          </ul>
          <p>We do not run analytics or user accounts.</p>
          <p>
            Questions or privacy requests: open an issue on{" "}
            <a
              href={`${GITHUB_REPO_URL}/issues`}
              target="_blank"
              rel="noreferrer"
              className="pc-link inline-flex items-center gap-0.5"
            >
              GitHub
              <ExternalLink className="w-3 h-3" />
            </a>
            .
          </p>
        </div>
      </Window>
    </div>
  );
};
