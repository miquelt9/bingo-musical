# Musical Bingo Creator 🎵 🎱

A desktop-first static SPA for creating, editing, printing, and hosting interactive Musical Bingo games.
Built with **Vite, React, TypeScript, Tailwind CSS, [@miquelt9/pc-ui](https://github.com/miquelt9/pc-ui), jsPDF, the YouTube IFrame API, and Deezer preview metadata**.

Hosted serverless on GitHub Pages with zero backend dependencies and no Google account requirement.

---

## ✨ Features

- 🎧 **Search or paste to build a deck:**
  - Search a song or artist with public catalog autocomplete (iTunes, then Deezer/MusicBrainz).
  - Selecting a song searches YouTube with `Artist Title official audio`.
  - Paste a YouTube video or playlist URL if you already have the clip.
  - Create provider-specific YouTube or Deezer decks. Deezer uses only the catalog’s short preview (normally 30 seconds), with no Deezer login.
  - Paste a bulk song list (`Artist - Title`, one per line) and match clips in the editor.
  - Decks auto-save as you add songs from search.
- 🔍 **Smart YouTube Matcher:**
  - YouTube search/metadata via the share Worker (curated Piped/Invidious backends server-side; narrow client fallback only if the Worker is down).
  - Direct 1-click manual YouTube link or Video ID override with instant thumbnail validation.
  - Cancellable batch auto-match and embed validation.
  - **Fix all songs** for blocked videos — finds and replaces restricted clips from the deck or taskbar notice.
  - Deezer tracks without a preview remain visible but cannot be added as playable tracks.
- 🛡️ **Playability gating:**
  - Verifies YouTube embed permissions (via noembed.com) before hosting or printing cards.
  - Surfaces blocked or unmatched tracks with a filterable list in the editor.
- ✂️ **Interactive Track & Snippet Editor:**
  - Customizable start/end timestamps per track.
  - Built-in singleton YouTube preview player with precision pause-at-end bounding.
  - Hidden dual-slot HTML audio playback for Deezer previews, including pause/resume, chaining, and crossfade fallback.
- 🗄️ **Local Persistence & Deck Portability:**
  - Save full decks in browser `localStorage`.
  - Export decks as portable `.json` files.
  - Import JSON decks with instant schema validation and pre-matched YouTube IDs.
  - **Share decks** via an immutable short link (`#/share/abc123`) or the native share sheet; JSON file export remains a fallback.
  - **Collaborate on playlists** through a separate permanent link (`#/collab/<random-id>`); anyone with the link can edit the playlist, check for updates, and safely merge changes.
  - Shared decks retain their provider and can be converted into a new YouTube or Deezer copy with review for ambiguous matches.
  - Dedicated **Import** page (`#/import`) for `.json` files and **Shared deck** page (`#/share/:id`) for links.
  - Built-in Deezer starter deck for testing without an external account; previews are matched automatically when the Worker is configured.
  - Empty decks created by mistake are discarded automatically when you navigate away.
- 🖨️ **Printable Bingo Cards & High-Resolution Vector PDF:**
  - Configurable **3×3 to 6×6** grids with adjustable **bingo percent** (how much of the deck appears on each card).
  - Leftover squares become dark blocked tiles — no fixed center free space required.
  - Clean browser print layout (`@media print`).
  - Every printed card includes a local verification QR in the top-right corner; the host can scan it to verify a horizontal line or Bingo without storing cards in Cloudflare KV.
  - A compact card code is printed with the verification QR for camera-less host devices.
  - Optional deck-sharing QR on each bingo card, with explanatory printed text; it is separate from verification.
  - Printed cards explain that blank cells are ignored, lines are horizontal only, all filled cells count for Bingo, and only one line prize is awarded.
  - Crisp vector PDF generator powered by `jsPDF` for multi-card batch downloads.
  - Export generated card sets as JSON for reuse.
- 🎙️ **Interactive Host Game Dashboard:**
  - "Call Next Song" randomized non-repeating shuffle bag.
  - Snippet playback controller (auto-pauses when clip ends).
  - Inline video panel with optional draggable floating window.
  - Crossfade overlap between songs, hide-answer mode (default), and auto-call-next chaining.
  - **Display mode** (`#/deck/:id/display`) — audience-facing progress view for a projector; syncs with the host via BroadcastChannel. Mirror the display window, not the full host UI.
  - Answer reveal card with countdown/clip-finished trigger or manual toggle.
  - Live searchable history log of called songs, local card verification by camera or card code, and celebratory Bingo confetti.
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

`@miquelt9/pc-ui` is installed from [GitHub](https://github.com/miquelt9/pc-ui) and pinned to a full commit SHA in `package.json` because pc-ui has no tags or releases. To bump it, update that SHA in `package.json` and `package-lock.json` to the desired pc-ui commit and reinstall. To develop against a local checkout, clone `pc-ui` elsewhere and run `npm link @miquelt9/pc-ui` from this project after linking in `pc-ui`.

### 2. Create a deck

1. Search a song or artist (autocomplete from iTunes/Deezer), pick the title, then choose the YouTube clip, or
2. Paste a bulk song list (`Artist - Title`, one per line), or
3. Import a previously exported JSON deck / use the starter deck.

Then open **Deck**, trim clips if needed, resolve any blocked songs, print cards, and host the game.

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your desktop browser. YouTube works without a Worker; Deezer search/resolution requires `VITE_SHARE_API_URL` pointing at the configured Worker.

### 4. Build for Production

```bash
npm run build
```

### 5. Deploy to GitHub Pages

Pushes to `main` build and deploy via GitHub Actions (`.github/workflows/deploy.yml`). Set repository secrets as needed:

- `VITE_SHARE_API_URL` — Cloudflare Worker URL for short deck share links (see `worker/README.md`)
- `VITE_CF_WEB_ANALYTICS_TOKEN` — Cloudflare Web Analytics site token (see below)

### 6. Deploy the share API (optional)

Short deck links use a Cloudflare Worker + KV. See **[worker/README.md](worker/README.md)** for setup (`wrangler login`, KV namespace, `npm run worker:deploy`). That Worker is `bingo-musical-share` (`worker/wrangler.toml`). The `bingo-musical` Workers Builds project publishes the Vite `dist/` through the root `wrangler.jsonc` (`npx wrangler versions upload`, no `--config`).

### 7. Web Analytics (optional)

For cookieless traffic metrics (visitors, page views, Core Web Vitals):

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Web Analytics** → **Add a site**.
2. Register hostname **`miquelt9.github.io`** and choose **manual** JS snippet setup.
3. Copy the site token into GitHub secret `VITE_CF_WEB_ANALYTICS_TOKEN` (and local `.env` for production builds).

The beacon loads only in production builds and does not use cookies.

---

## 📤 Sharing and collaboration

### Immutable share link

1. Open a deck (or use the share button on the home page deck list).
2. Click **Share** — the app resolves a short link like `…/bingo-musical/#/share/xYz12Ab3Cd` from the deck content. Identical decks (same name and songs/clips) always get the same id.
3. The app checks whether that deck is already on the server (read-only) before uploading. Only the first share of a given deck writes to KV; later shares reuse the existing snapshot.
4. Send the link on WhatsApp, Telegram, or email (no JSON file required). On the Cards page, the optional **Show deck sharing QR code** setting adds the same deck link to every printed bingo card. This QR opens the deck online; it does not verify a card.
5. Recipients open the link, preview the songs, and click **Add to my decks** to copy it locally.

### Collaborative link

1. Open a non-empty deck and choose **Collaborate**.
2. The app creates a separate random link like `…/bingo-musical/#/collab/7Rk9xV2mQpL4sN8dTzY3`.
3. Anyone with the link can add songs; no account or roles are required.
4. Users can click **Check for updates** to fetch the latest revision. Before every edit, the app fetches the latest revision and publishes the requested change with optimistic revision checks. If a sync cannot be completed, the page keeps the current view and offers retry/reload actions.
5. Collaborative snapshots are stored under `collab:` KV keys without an expiration TTL.

Older random share links (`#/share/…`) keep working until they expire.

Run `npm run compute:sample-share-id` to print the stable share id for the built-in starter deck.

If link sharing is not configured, the share dialog falls back to downloading a `.json` file and the `#/import` flow. Printed card verification is separate: the host must load the same unchanged deck version, then use **Verify Line / Bingo** to scan a card QR or enter its printed code. Changing the songs, order, titles, artists, or other card-source data after printing produces a deck-version mismatch; re-open the original shared snapshot or restore the deck used to print.

---

## 🛠️ Tech Stack

- **Framework:** React 18 + TypeScript + Vite
- **UI:** [@miquelt9/pc-ui](https://github.com/miquelt9/pc-ui) (Win9x desktop shell) + Tailwind CSS + Lucide Icons
- **Routing:** React Router DOM (HashRouter for GitHub Pages)
- **PDF Generation:** jsPDF
- **Audio/Video Playback:** YouTube IFrame Player API and Deezer preview URLs through hidden HTML audio elements
- **Persistence:** Browser `localStorage` (decks, preferences, embed cache) + `sessionStorage` (host game & card settings) + JSON import/export
- **Effects:** canvas-confetti

---

## License

This project is released under the [MIT License](LICENSE).

## Disclaimer

Playback uses YouTube embeds and Deezer’s short preview URLs only — the app does not host, proxy, or download music and never requests full-length Deezer audio. **YouTube may show ads before or during embedded clips**; this app cannot remove them. Deezer previews are limited to the available short snippet (normally the first 30 seconds), may be unavailable or affected by [provider CORS behavior](https://en.deezercommunity.com/other-devices-49/api-access-control-allow-origin-80021), and must be used in accordance with [Deezer’s developer terms](https://developers.deezer.com/termsofuse) ([PDF](https://cdn-content.dzcdn.net/pdf/CGU-developers.pdf)). Under those terms, Deezer previews are for **non-commercial private / family / home** use only. Bars, ticketed events, or commercial venues may also require music performance licenses in your country and are outside that private-use scope — the organizer's responsibility.

## Privacy

Decks, theme, and embed cache stay in your browser (`localStorage`). Active host games and card-print settings use `sessionStorage` until you close the tab. When you search or play clips, your browser may contact YouTube, catalog APIs (iTunes, Deezer, MusicBrainz), the configured share Worker, noembed.com, Deezer preview hosts, and GitHub Pages hosting. YouTube and Deezer metadata requests go through the share Worker when configured; a narrow Piped/Invidious fallback may be used only if the Worker is unavailable. The browser loads Deezer short preview URLs and YouTube embeds directly. We use cookieless Cloudflare Web Analytics for aggregate traffic and anonymous feature-usage counts via our share Worker. There are no user accounts. See **Settings → Privacy** in the app for the full notice.

## Third-party services

- **YouTube** — embedded playback via the IFrame Player API (ads may appear during clips); search/metadata via the share Worker, with a narrow Piped/Invidious client fallback only if the Worker is down
- **Deezer** — catalog metadata via the Worker and short preview URLs (normally 30 seconds; no full-track playback)
- **Share Worker** — deck sharing, Deezer metadata, and YouTube search/metadata (server-side Piped/Invidious race)
- **iTunes, Deezer, MusicBrainz** — song title autocomplete
- **noembed.com** — YouTube embed permission checks
