# Musical Bingo Creator 🎵 🎱

A desktop-first static SPA for creating, editing, printing, and hosting interactive Musical Bingo games.
Built with **Vite, React, TypeScript, Tailwind CSS, jsPDF, and the YouTube IFrame API**.

Hosted serverless on GitHub Pages with zero backend dependencies and no Google or Spotify Premium requirement.

---

## ✨ Features

- 🎧 **Search or paste to build a deck:**
  - Search a song or artist with public catalog autocomplete (iTunes, then Deezer/MusicBrainz).
  - Selecting a song searches YouTube with `Artist Title official audio`.
  - Paste a YouTube video or playlist URL if you already have the clip.
  - Connect Spotify to import playlists you own or collaborate on (YouTube matching runs automatically).
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

### 2. Create a deck

1. Search a song or artist (autocomplete from iTunes/Deezer), pick the title, then choose the YouTube clip, or
2. Paste a bulk song list (`Artist - Title`, one per line), or
3. Connect Spotify on the home page and import one of your playlists, or
4. Import a previously exported JSON deck / use the sample deck.

Then open **Editor**, trim clips if needed, print cards, and host the game. Spotify imports auto-start YouTube matching.

### 3. Spotify (optional, for deployers)

End users do **not** need a Spotify Developer account. The site maintainer configures Spotify once:

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add your site redirect URI (e.g. `https://<user>.github.io/bingo-musical/` for GitHub Pages).
3. Set `VITE_SPOTIFY_CLIENT_ID` in `.env` locally or as a GitHub Actions secret for production builds.
4. While the app is in Development Mode, add each user's Spotify email under **Users and Access**.

Users then click **Connect with Spotify** on the home page and pick a playlist. Playback still uses YouTube only.

### 4. Run Development Server
```bash
npm run dev
```

Visit [http://127.0.0.1:5173](http://127.0.0.1:5173) in your desktop browser.

### 5. Build for Production
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

---

## License

This project is released under the [MIT License](LICENSE).

## Disclaimer

Musical Bingo Creator is a free personal hobby project. It is **not affiliated** with YouTube, Google, Spotify, Apple, Deezer, or MusicBrainz. Playback uses the YouTube embedded player only — the app does not host or download music. It is intended for private or social games at home; bars, ticketed events, or commercial venues may require music performance licenses in your country (e.g. SGAE in Spain), which is the organizer's responsibility.

## Privacy

Decks and preferences stay in your browser (`localStorage`). When you search or play clips, your browser may contact YouTube, public Invidious/Piped instances, catalog APIs (iTunes, Deezer, MusicBrainz), noembed.com, Spotify (if connected), and GitHub Pages hosting. There is no analytics or user accounts on our side. See **Settings → Privacy** in the app for the full notice.

## Third-party services

- **YouTube** — embedded playback via the IFrame Player API
- **Invidious / Piped** — public instances for YouTube search and metadata (no official YouTube API key)
- **iTunes, Deezer, MusicBrainz** — song title autocomplete
- **Spotify** (optional) — playlist metadata import only
