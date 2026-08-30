import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Group, Radio, Window, Modal, type DesktopTheme } from "@miquelt9/pc-ui";
import { useAuth } from "../state/AuthContext";
import { useDeck } from "../state/DeckContext";
import { useTheme } from "../state/ThemeContext";
import { useToast } from "../state/ToastContext";
import { SAMPLE_POP_HITS_DECK } from "../lib/storage/mockDeck";
import { saveStoredDecks } from "../lib/storage/decks";
import { APP_NAME, GITHUB_REPO_URL } from "../lib/app/meta";
import {
  ListMusic,
  Check,
  ExternalLink,
  ShieldCheck,
  RotateCcw,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Code,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
} from "lucide-react";

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isConfigured, isAuthenticated, login, logout, error } = useAuth();
  const { decks, exportDeck, importDeck, refreshDecks } = useDeck();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [showResetModal, setShowResetModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;

    try {
      const imported = await importDeck(file);
      showToast({
        title: "Deck imported",
        icon: <Check className="w-3.5 h-3.5" />,
        message: `"${imported.name}" was added to your decks.`,
        duration: 5000,
      });
      navigate(`/deck/${imported.id}`);
    } catch (err) {
      showToast({
        title: "JSON import failed",
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        message: (err as Error).message,
        duration: 10000,
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Window title="App Settings">
        <p className="text-sm mb-2">Appearance, integrations, and local data options.</p>
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

      {isConfigured && (
        <Window
          title={
            <span className="inline-flex items-center gap-2">
              <ListMusic className="w-4 h-4" />
              Spotify
            </span>
          }
        >
          <p className="text-xs mb-3">
            {isAuthenticated ? "Connected" : "Not connected"} — import playlists you own or collaborate on.
            Playback still uses YouTube; Spotify is metadata only.
          </p>

          <div className="pc-bevel-inset p-3 text-xs space-y-2 mb-4">
            <p>
              While the app is in Spotify Development Mode, only allowlisted Spotify accounts can connect.
              If login fails, ask the site maintainer to add your Spotify email to the app.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAuthenticated ? (
              <Button type="button" onClick={logout}>
                <LogOut className="w-4 h-4" />
                Disconnect Spotify
              </Button>
            ) : (
              <Button type="button" onClick={() => login()}>
                <LogIn className="w-4 h-4" />
                Connect with Spotify
              </Button>
            )}
          </div>

          {error && <div className="pc-bevel-inset p-3 text-xs mt-4">{error}</div>}
        </Window>
      )}

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

      <Window
        title={
          <button
            type="button"
            className="inline-flex items-center gap-2 bg-transparent border-0 p-0 text-inherit font-inherit cursor-pointer w-full text-left"
            onClick={() => setShowAdvanced((open) => !open)}
            aria-expanded={showAdvanced}
          >
            {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Advanced options
          </button>
        }
      >
        {showAdvanced ? (
          <div className="space-y-4">
            <p className="text-xs">
              Most people share decks with a link from the Share button. Use JSON files only when you need a
              manual backup or offline transfer.
            </p>

            <Group legend="Import JSON deck">
              <p className="text-xs mb-3">
                Add a deck from a <code className="text-xs">.json</code> file. For short share links, open the
                link directly instead.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => void handleImportFile(e.target.files?.[0])}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4" />
                  Choose JSON file
                </Button>
                <Link to="/import" className="pc-link text-xs">
                  Open full import page
                </Link>
              </div>
            </Group>

            <Group legend="Export JSON deck">
              {decks.length === 0 ? (
                <p className="text-xs">No decks to export yet.</p>
              ) : (
                <ul className="space-y-2">
                  {decks.map((deck) => (
                    <li
                      key={deck.id}
                      className="flex items-center justify-between gap-3 pc-bevel-inset p-2 text-xs"
                    >
                      <span className="truncate">{deck.name}</span>
                      <Button type="button" onClick={() => exportDeck(deck)}>
                        <Download className="w-4 h-4" />
                        Export
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Group>
          </div>
        ) : (
          <p className="text-xs">JSON import and export for manual deck transfer.</p>
        )}
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
            {APP_NAME} runs in your web browser with no backend of its own. Your decks, embed cache,
            theme, and Spotify tokens (if connected) are stored in <strong>localStorage</strong> on
            your device and are not sent to us. Active host games and card-print settings are kept
            in <strong>sessionStorage</strong> until you close the browser tab.
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
