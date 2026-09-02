# Musical Bingo Creator 🎵 🎱

A desktop-first static SPA for creating, editing, printing, and hosting interactive Musical Bingo games.
Built with **Vite, React, TypeScript, Tailwind CSS, [@miquelt9/pc-ui](https://github.com/miquelt9/pc-ui), jsPDF, and the YouTube IFrame API**.

Hosted serverless on GitHub Pages with zero backend dependencies and no Google account requirement.

---

## ✨ Features

- 🎧 **Search or paste to build a deck:**
  - Search a song or artist with public catalog autocomplete (iTunes, then Deezer/MusicBrainz).
  - Selecting a song searches YouTube with `Artist Title official audio`.
  - Paste a YouTube video or playlist URL if you already have the clip.
  - Paste a bulk song list (`Artist - Title`, one per line) and match clips in the editor.
  - Decks auto-save as you add songs from search.
- 🔍 **Smart YouTube Matcher:**
  - Automated fallback search across public Invidious & Piped instances (no YouTube API token required).
  - Direct 1-click manual YouTube link or Video ID override with instant thumbnail validation.
  - Cancellable batch auto-match and embed validation.
  - **Fix all songs** for blocked videos — finds and replaces restricted clips from the deck or taskbar notice.
- 🛡️ **Playability gating:**
  - Verifies YouTube embed permissions (via noembed.com) before hosting or printing cards.
  - Surfaces blocked or unmatched tracks with a filterable list in the editor.
- ✂️ **Interactive Track & Snippet Editor:**
  - Customizable start/end timestamps per track.
  - Built-in singleton YouTube preview player with precision pause-at-end bounding.
- 🗄️ **Local Persistence & Deck Portability:**
  - Save full decks in browser `localStorage`.
  - Export decks as portable `.json` files.
  - Import JSON decks with instant schema validation and pre-matched YouTube IDs.
  - **Share decks** via a short link (`#/share/abc123`) or the native share sheet; JSON file export remains as a fallback.
  - Dedicated **Import** page (`#/import`) for `.json` files and **Shared deck** page (`#/share/:id`) for links.
  - Built-in sample deck for testing without any external account.
  - Empty decks created by mistake are discarded automatically when you navigate away.
- 🖨️ **Printable Bingo Cards & High-Resolution Vector PDF:**
  - Configurable **3×3 to 6×6** grids with adjustable **bingo percent** (how much of the deck appears on each card).
  - Leftover squares become dark blocked tiles — no fixed center free space required.
  - Clean browser print layout (`@media print`).
  - Crisp vector PDF generator powered by `jsPDF` for multi-card batch downloads.
  - Export generated card sets as JSON for reuse.
- 🎙️ **Interactive Host Game Dashboard:**
  - "Call Next Song" randomized non-repeating shuffle bag.
  - Snippet playback controller (auto-pauses when clip ends).
  - Inline video panel with optional draggable floating window.
  - Crossfade overlap between songs, hide-answer mode (default), and auto-call-next chaining.
  - **Display mode** (`#/deck/:id/display`) — audience-facing progress view for a projector; syncs with the host via BroadcastChannel. Mirror the display window, not the full host UI.
  - Answer reveal card with countdown/clip-finished trigger or manual toggle.
  - Live searchable history log of called songs, verification, and celebratory Bingo confetti.
  - **Space** toggles play/pause or calls the next song during a live game.
  - Host session state persists in `sessionStorage` across page refreshes.
- 🖥️ **Classic desktop UI:**
  - Win9x-inspired shell via `@miquelt9/pc-ui` with light, dark (Night Win9x), or system theme.

---

## 🚀 Setup & Development

### 1. Install Dependencies

```bash
npm install
```

`@miquelt9/pc-ui` is installed from [GitHub](https://github.com/miquelt9/pc-ui) automatically. To develop against a local checkout of `pc-ui`, clone it elsewhere and run `npm link @miquelt9/pc-ui` from this project after linking in `pc-ui`.

### 2. Create a deck

1. Search a song or artist (autocomplete from iTunes/Deezer), pick the title, then choose the YouTube clip, or
2. Paste a bulk song list (`Artist - Title`, one per line), or
3. Import a previously exported JSON deck / use the sample deck.

Then open **Deck**, trim clips if needed, resolve any blocked songs, print cards, and host the game.

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your desktop browser.

### 4. Build for Production

```bash
npm run build
```

### 5. Deploy to GitHub Pages

Pushes to `main` build and deploy via GitHub Actions (`.github/workflows/deploy.yml`). Set repository secrets as needed:

- `VITE_SHARE_API_URL` — Cloudflare Worker URL for short deck share links (see `worker/README.md`)
- `VITE_CF_WEB_ANALYTICS_TOKEN` — Cloudflare Web Analytics site token (see below)

### 6. Deploy the share API (optional)

Short deck links use a Cloudflare Worker + KV. See **[worker/README.md](worker/README.md)** for setup (`wrangler login`, KV namespace, `npm run worker:deploy`).

### 7. Web Analytics (optional)

For cookieless traffic metrics (visitors, page views, Core Web Vitals):

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Web Analytics** → **Add a site**.
2. Register hostname **`miquelt9.github.io`** and choose **manual** JS snippet setup.
3. Copy the site token into GitHub secret `VITE_CF_WEB_ANALYTICS_TOKEN` (and local `.env` for production builds).

The beacon loads only in production builds and does not use cookies.

---

## 📤 Sharing a deck

1. Open a deck (or use the share button on the home page deck list).
2. Click **Share** — the app resolves a short link like `…/bingo-musical/#/share/xYz12Ab3Cd` from the deck content. Identical decks (same name and songs/clips) always get the same id.
3. The app checks whether that deck is already on the server (read-only) before uploading. Only the first share of a given deck writes to KV; later shares reuse the existing snapshot.
4. Send the link on WhatsApp, Telegram, or email (no JSON file required).
5. Recipients open the link, preview the songs, and click **Add to my decks** to copy it locally.

Older random share links (`#/share/…`) keep working until they expire.

Run `npm run compute:sample-share-id` to print the stable share id for the built-in sample deck.

If link sharing is not configured, the share dialog falls back to downloading a `.json` file and the `#/import` flow.

---

## 🛠️ Tech Stack

- **Framework:** React 18 + TypeScript + Vite
- **UI:** [@miquelt9/pc-ui](https://github.com/miquelt9/pc-ui) (Win9x desktop shell) + Tailwind CSS + Lucide Icons
- **Routing:** React Router DOM (HashRouter for GitHub Pages)
- **PDF Generation:** jsPDF
- **Audio/Video Playback:** YouTube IFrame Player API
- **Persistence:** Browser `localStorage` (decks, preferences, embed cache) + `sessionStorage` (host game & card settings) + JSON import/export
- **Effects:** canvas-confetti

---

## License

This project is released under the [MIT License](LICENSE).

## Disclaimer

Playback uses the YouTube embedded player only — the app does not host or download music. **YouTube may show ads before or during embedded clips**; this app cannot remove them. Hosts signed in with YouTube Premium in the same browser may see fewer or no ads, but ad-free playback is not guaranteed. It is intended for private or social games at home; bars, ticketed events, or commercial venues may require music performance licenses in your country, which is the organizer's responsibility.

## Privacy

Decks, theme, and embed cache stay in your browser (`localStorage`). Active host games and card-print settings use `sessionStorage` until you close the tab. When you search or play clips, your browser may contact YouTube, public Invidious/Piped instances, catalog APIs (iTunes, Deezer, MusicBrainz), noembed.com, and GitHub Pages hosting. We use cookieless Cloudflare Web Analytics for aggregate traffic and anonymous feature-usage counts via our share Worker. There are no user accounts. See **Settings → Privacy** in the app for the full notice.

## Third-party services

- **YouTube** — embedded playback via the IFrame Player API (ads may appear during clips)
- **Invidious / Piped** — public instances for YouTube search and metadata (no official YouTube API key)
- **iTunes, Deezer, MusicBrainz** — song title autocomplete
- **noembed.com** — YouTube embed permission checks
