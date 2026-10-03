# Architecture

bingo-musical is a Vite + React + TypeScript SPA. There is no app server. Decks live in the browser. A Cloudflare Worker stores shared snapshots, collaborative playlists, and catalog proxies.

## Client

| Piece | Where | Role |
| --- | --- | --- |
| Entry | `src/main.tsx` | Imports `@miquelt9/pc-ui/pc-ui.css` and `src/index.css`. |
| Routes | `src/App.tsx` | `HashRouter`. Display (`/deck/:id/display`) renders outside `AppShell`. Every other route sits in the shell. |
| Shell | `src/components/layout/` | pc-ui `Desktop`, `Workspace`, `Window`, and `Taskbar`. The taskbar is desktop-only. Phone section links are `MobileSectionNav` in `PageHeader`. |
| State | `src/state/` | Decks, theme, toasts, and player UI. |
| Domain | `src/lib/` | Deck storage, bingo cards and PDF, YouTube and Deezer playback, share helpers, host session. |
| Pages | `src/pages/` | Home, editor, cards, host, display, settings, import, shared deck, collaborative playlist. |

Public URLs use the hash, for example `/bingo-musical/#/deck/:id`. Router paths are `/`, `/deck/:id`, `/deck/:id/cards`, `/deck/:id/play`, `/deck/:id/display`, `/import`, `/share/:shareId`, `/collab/:collaborationId`, and `/settings`.

`localStorage` holds decks (`bingo-musical:decks`), the theme, card-print settings, and caches. `sessionStorage` holds the live host session. Host and display sync through `BroadcastChannel` in `src/lib/host/session.ts`. JSON import and export do not need the Worker. YouTube and Deezer engines mount from `AppShell` so a clip can keep playing across routes.

GitHub Pages production assets use base `/bingo-musical/`. Workers Builds and `npm run build:worker` use `/`. `@miquelt9/pc-ui` is pinned to a commit SHA in `package.json`.

## Share Worker

`worker/` (`bingo-musical-share`) is the API: immutable deck shares, collaborative playlists, anonymous usage events, and Deezer/YouTube metadata. Share ids are computed with `src/lib/share/deckCanonical.ts`, which the Worker imports. Setup and routes: [worker/README.md](../worker/README.md).

The root `wrangler.jsonc` (`bingo-musical`) publishes the Vite `dist/` as a static site.
