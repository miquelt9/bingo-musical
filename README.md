# Musical Bingo Creator 🎵 🎱

A desktop-first static SPA for creating, editing, printing, and hosting interactive Musical Bingo games.
Built with **Vite, React, TypeScript, Tailwind CSS, jsPDF, and the YouTube IFrame API**.

Hosted serverless on GitHub Pages with zero backend dependencies, no Google API keys, and Spotify OAuth via client-side PKCE.

---

## ✨ Features

- 🎧 **Spotify Playlist Ingest:**
  - Connect via Spotify Authorization Code with PKCE (no client secret needed).
  - Paste any Spotify Playlist URL or pick from your user library.
  - Automatically loads tracks, metadata, album art, and configures default 15-second snippet windows (`0:30` – `0:45`).
- 🔍 **Smart YouTube Matcher:**
  - Automated fallback search across public Invidious & Piped instances (no YouTube API token required).
  - Direct 1-click manual YouTube link or Video ID override with instant thumbnail validation.
- ✂️ **Interactive Track & Snippet Editor:**
  - Customizable start/end timestamps per track.
  - Built-in singleton YouTube preview player with precision pause-at-end bounding.
- 🗄️ **Local Persistence & JSON Deck Portability:**
  - Save full decks in browser `localStorage`.
  - Export decks as portable `.json` files.
  - Import JSON decks with instant schema validation and pre-matched YouTube IDs.
  - Built-in Offline Sample Deck for testing without Spotify.
- 🖨️ **Printable Bingo Cards & High-Resolution Vector PDF:**
  - Randomized 5x5 cards with center "FREE SPACE" (Fisher-Yates 24-track random sampling).
  - Clean browser print layout (`@media print`).
  - Crisp vector PDF generator powered by `jsPDF` for multi-card batch downloads.
- 🎙️ **Interactive Host Game Dashboard:**
  - "Call Next Song" randomized non-repeating shuffle bag.
  - Snippet playback controller (auto-pauses when clip ends).
  - Answer reveal card with countdown/clip-finished trigger or manual toggle.
  - Live history log of called songs, verification, and celebratory Bingo confetti.

---

## 🚀 Setup & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Spotify Developer App Configuration

Spotify requires every environment URL to be registered exactly as a Redirect URI:

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an application (e.g. *Musical Bingo Creator*).
3. Under **App Settings -> Redirect URIs**, add:
   - `http://127.0.0.1:5173/` (for local development)
   - `https://miquelt9.github.io/bingo-musical/` (for this project's GitHub Pages deployment)
4. Copy your **Client ID**.

You can provide your Client ID in two ways:
- In `.env` file: `VITE_SPOTIFY_CLIENT_ID=your_client_id_here`
- Or directly in the app via the **Settings** page (stored securely in browser `localStorage`).

### 3. Run Development Server
```bash
npm run dev
```

Visit [http://127.0.0.1:5173](http://127.0.0.1:5173) in your desktop browser.

### 4. Build for Production
```bash
npm run build
```

---

## 🛠️ Tech Stack

- **Framework:** React 18 + TypeScript + Vite
- **Routing:** React Router DOM (HashRouter for foolproof GitHub Pages + OAuth query handling)
- **Styling:** Tailwind CSS + Lucide Icons
- **PDF Generation:** jsPDF
- **Audio/Video Playback:** YouTube IFrame Player API
- **Persistence:** Browser `localStorage` + JSON Import/Export
