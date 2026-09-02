import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Group, Radio, Window, Modal, type DesktopTheme } from "@miquelt9/pc-ui";
import { BackButton } from "../components/ui/BackButton";
import { useDeck } from "../state/DeckContext";
import { useTheme } from "../state/ThemeContext";
import { useToast } from "../state/ToastContext";
import { useIsMobile } from "../hooks/useMediaQuery";
import { SAMPLE_POP_HITS_DECK } from "../lib/storage/mockDeck";
import { saveStoredDecks } from "../lib/storage/decks";
import { APP_NAME, GITHUB_REPO_URL } from "../lib/app/meta";
import {
  Check,
  ExternalLink,
  RotateCcw,
  Monitor,
  Moon,
  Sun,
  Code,
  Info,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
} from "lucide-react";

interface CollapsibleSectionProps {
  title: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  open,
  onToggle,
  children,
  className,
}) => (
  <div className={className}>
    <button
      type="button"
      className="inline-flex items-center gap-2 bg-transparent border-0 p-0 text-inherit font-inherit cursor-pointer w-full text-left text-sm font-semibold"
      onClick={onToggle}
      aria-expanded={open}
    >
      {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
      {title}
    </button>
    {open && <div className="mt-3">{children}</div>}
  </div>
);

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { decks, exportDeck, importDeck, refreshDecks } = useDeck();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [showResetModal, setShowResetModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(!isMobile);
  const [dataNotesOpen, setDataNotesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAboutOpen(!isMobile);
  }, [isMobile]);

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

  const aboutContent = (
    <>
      <p className="text-xs leading-relaxed">
        {APP_NAME} is a free personal hobby project, released under the{" "}
        <a
          href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
          target="_blank"
          rel="noreferrer"
          className="pc-link inline-flex items-center gap-0.5"
        >
          MIT license
          <ExternalLink className="w-3 h-3" />
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
    </>
  );

  const dataNotesContent = (
    <div className="text-xs leading-relaxed space-y-2">
      <p>
        Your decks stay in this browser. We don&apos;t run accounts or keep your song lists on a server.
      </p>
      <p>
        Clips play through YouTube embeds you choose. Search and matching may call public music APIs
        and YouTube-related services. YouTube may show its own ads — that&apos;s normal for embedded
        playback.
      </p>
      <p>
        Not affiliated with YouTube, Google, or any music platform. A hobby tool for casual games at
        home.
      </p>
      <p className="text-muted">
        Share links may log anonymous usage counts (no personal data). Questions?{" "}
        <a
          href={`${GITHUB_REPO_URL}/issues`}
          target="_blank"
          rel="noreferrer"
          className="pc-link inline-flex items-center gap-0.5"
        >
          GitHub issues
          <ExternalLink className="w-3 h-3" />
        </a>
        .
      </p>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <BackButton fallbackTo="/" fallbackLabel="All decks" />
      <Window title="App Settings">
        <p className="text-sm mb-4">Appearance, integrations, and local data options.</p>

        <div className="space-y-6">
          <Group
            legend={
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

          <Group
            legend={
              <span className="inline-flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                Local Storage & Sample Decks
              </span>
            }
          >
            <div className="flex flex-col gap-4 pc-bevel-inset p-3">
              <div>
                <h4 className="text-sm font-semibold">Reset all data to sample deck</h4>
                <p className="text-xs mt-0.5">
                  Deletes every deck in local storage and restores only the 30-track Sample Pop Hits
                  deck. This cannot be undone.
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setShowResetModal(true)} className="w-full sm:w-auto">
                  Reset All Data
                </Button>
              </div>
            </div>
          </Group>

          <Group
            legend={
              <button
                type="button"
                className="inline-flex items-center gap-2 bg-transparent border-0 p-0 text-inherit font-inherit cursor-pointer w-full text-left"
                onClick={() => setShowAdvanced((open) => !open)}
                aria-expanded={showAdvanced}
              >
                {showAdvanced ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                Advanced options
              </button>
            }
          >
            {showAdvanced ? (
              <div className="space-y-4">
                <p className="text-xs">
                  Most people share decks with a link from the Share button. Use JSON files only when
                  you need a manual backup or offline transfer.
                </p>

                <div>
                  <p className="text-xs font-bold mb-2">Import JSON deck</p>
                  <p className="text-xs mb-3">
                    Add a deck from a <code className="text-xs">.json</code> file. For short share
                    links, open the link directly instead.
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
                </div>

                <div>
                  <p className="text-xs font-bold mb-2">Export JSON deck</p>
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
                </div>
              </div>
            ) : (
              <p className="text-xs">JSON import and export for manual deck transfer.</p>
            )}
          </Group>

          {isMobile ? (
            <>
              <CollapsibleSection
                title={
                  <span className="inline-flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    About &amp; Open Source
                  </span>
                }
                open={aboutOpen}
                onToggle={() => setAboutOpen((open) => !open)}
                className="pt-2 border-t border-[var(--pc-border)]"
              >
                {aboutContent}
              </CollapsibleSection>

              <CollapsibleSection
                title={
                  <span className="inline-flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Data &amp; playback
                  </span>
                }
                open={dataNotesOpen}
                onToggle={() => setDataNotesOpen((open) => !open)}
              >
                {dataNotesContent}
              </CollapsibleSection>
            </>
          ) : (
            <>
              <Group
                legend={
                  <span className="inline-flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    About &amp; Open Source
                  </span>
                }
              >
                {aboutContent}
              </Group>

              <CollapsibleSection
                title={
                  <span className="inline-flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Data &amp; playback
                  </span>
                }
                open={dataNotesOpen}
                onToggle={() => setDataNotesOpen((open) => !open)}
                className="pt-2 border-t border-[var(--pc-border)]"
              >
                {dataNotesContent}
              </CollapsibleSection>
            </>
          )}
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
    </div>
  );
};
