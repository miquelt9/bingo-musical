# Musical Bingo Creator 🎵 🎱

A desktop-first static SPA for creating, editing, printing, and hosting interactive Musical Bingo games.
Built with **Vite, React, TypeScript, Tailwind CSS, jsPDF, and the YouTube IFrame API**.

Hosted serverless on GitHub Pages with zero backend dependencies and no Google or Spotify Premium requirement.

---

## ✨ Features

- 🎧 **Search or paste to build a deck:**
  - Search a song name, paste a YouTube video, or paste a playlist URL.
  - Pick the best match from the results before adding it.
  - Optional bulk paste of `Artist - Title` lines still works.
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
  - Built-in sample deck for testing without any external account.
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

### 2. Create a deck (no Spotify needed)

1. Search a song name or paste a YouTube video/playlist URL, then pick the match, or
2. Paste a bulk song list (`Artist - Title`, one per line), or
3. Import a previously exported JSON deck / use the sample deck.

Then open **Editor**, run **Auto-match YouTube**, trim clips, print cards, and host the game.

Spotify Web API is optional. New personal Spotify apps require Premium and are capped at 5 allowlisted users, so it is not the default path.

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
