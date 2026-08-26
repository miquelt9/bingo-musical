import React, { useState } from "react";
import { useAuth } from "../state/AuthContext";
import { useDeck } from "../state/DeckContext";
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
} from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { clientId, updateClientId, isAuthenticated, login, logout, error } = useAuth();
  const { refreshDecks } = useDeck();

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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white">App Settings & Integrations</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Configure your Spotify Client ID and local app options.
        </p>
      </div>

      {/* Spotify Developer Integration Card */}
      <section className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1DB954]/10 text-[#1DB954] flex items-center justify-center border border-[#1DB954]/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Spotify PKCE Authentication</h2>
              <p className="text-xs text-zinc-400">
                Direct browser Authorization Code flow with PKCE (no client secret needed).
              </p>
            </div>
          </div>

          <div>
            {isAuthenticated ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Connected</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 text-xs font-semibold">
                <span>Not Connected</span>
              </span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-100 space-y-2">
          <p className="font-semibold text-amber-300">Spotify is optional and blocked for most personal apps.</p>
          <p className="text-amber-200/80">
            Spotify requires a Premium developer account and limits new apps to 5 allowlisted users. Use a pasted song list or a YouTube playlist instead.
          </p>
        </div>

        {/* Setup Instructions */}
        <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 text-xs text-zinc-300 space-y-3">
          <div className="flex items-center gap-2 font-bold text-zinc-100">
            <Info className="w-4 h-4 text-emerald-400" />
            <span>Optional Spotify Client ID (Premium required):</span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-zinc-400 pl-1">
            <li>
              Go to the{" "}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline font-semibold inline-flex items-center gap-0.5"
              >
                <span>Spotify Developer Dashboard</span>
                <ExternalLink className="w-3 h-3" />
              </a>{" "}
              and log in.
            </li>
            <li>Click <strong>Create app</strong> (name it e.g. <em>Musical Bingo Creator</em>).</li>
            <li>
              Under <strong>Redirect URIs</strong> in your Spotify app settings, add the exact URI below.
            </li>
            <li>Copy the <strong>Client ID</strong> and paste it into the field below.</li>
          </ol>
        </div>

        {/* Redirect URI Display */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
            Your Spotify App Redirect URI (Must match exactly in Spotify Dashboard):
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={redirectUri}
              className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-400 select-all outline-none"
            />
            <button
              type="button"
              onClick={handleCopyUri}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors border border-zinc-700 shrink-0"
            >
              {copiedUri ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedUri ? "Copied!" : "Copy URI"}</span>
            </button>
          </div>
        </div>

        {/* Client ID Input Form */}
        <form onSubmit={handleSaveClientId} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Custom Spotify Client ID
            </label>
            <input
              type="text"
              value={inputClientId}
              onChange={(e) => setInputClientId(e.target.value)}
              placeholder="e.g. 3a7b9c1d2e5f8a4b6c0d..."
              className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 font-mono text-sm text-white placeholder-zinc-600 outline-none transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                Save Client ID
              </button>
              {savedSuccess && (
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 animate-in fade-in">
                  <Check className="w-4 h-4" />
                  Saved to localStorage!
                </span>
              )}
            </div>

            {/* Login / Logout Action */}
            <div>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 text-xs font-semibold border border-zinc-700 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out from Spotify</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => login()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#1DB954] hover:bg-[#1aa34a] text-white text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Connect with Spotify</span>
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-400">
              {error}
            </div>
          )}
        </form>
      </section>

      {/* Local Storage & Cache Management */}
      <section className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
          <div className="w-10 h-10 rounded-2xl bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-700">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Local Storage & Sample Decks</h2>
            <p className="text-xs text-zinc-400">
              Manage cached bingo decks stored in your browser's local storage.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800">
          <div>
            <h4 className="text-sm font-semibold text-zinc-200">Reset Default Pop Classics Deck</h4>
            <p className="text-xs text-zinc-500 mt-0.5">
              Restores the 30-track classic sample deck with pre-matched YouTube clips.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetSampleDeck}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold border border-zinc-700 transition-colors"
          >
            Reset Sample Deck
          </button>
        </div>
      </section>

      {/* Security & Privacy Card */}
      <section className="bg-zinc-900/40 border border-zinc-800/60 rounded-3xl p-6 text-xs text-zinc-400 space-y-2">
        <div className="flex items-center gap-2 text-zinc-200 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero-Backend & Client-Side Privacy</span>
        </div>
        <p className="text-zinc-500 leading-relaxed">
          Musical Bingo Creator runs 100% locally in your web browser. Your Spotify tokens, custom decks, and game progress never leave your device. YouTube video playback uses standard embed controls with zero API secrets.
        </p>
      </section>
    </div>
  );
};
