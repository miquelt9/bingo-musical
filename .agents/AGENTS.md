# Working in bingo-musical

Desktop-first static SPA for creating, editing, printing, and hosting Musical Bingo games. This file is how to change the repo. Install, features, and deploy stay in [README.md](../README.md).

## Scope

- Change app behavior in `src/`, and the share API in `worker/`, when the task needs it.
- Leave Windows 9x chrome to `@miquelt9/pc-ui`. Do not restyle the shell, invent a second palette, or rearrange layout unless the task asks.
- Do not move routing, decks, playback, cards, or sharing into the pc-ui package.
- Do not bump the pinned `@miquelt9/pc-ui` commit SHA unless the task says so.

## Docs

| File | What it is |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | App shape, routes, persistence, Worker |
| [DESIGN.md](./DESIGN.md) | Look intent |
| [testing.md](./testing.md) | What `npm test` and the Playwright smoke lock |
| [../README.md](../README.md) | Features, setup, and deploy |
| [../worker/README.md](../worker/README.md) | Share API setup and routes |

Link those files. Do not paste the feature list or the Worker route table into a new note.

## Changes

- UI uses the pc-ui components already on the page (`Window`, `Button`, `Taskbar`, `ContentModal`, `OverflowMenu`) and the Tailwind layout utilities already in the shell. New chrome belongs in pc-ui.
- `npm run build` typechecks and builds the GitHub Pages app (asset base `/bingo-musical/`). `npm run build:worker` builds the static Worker (asset base `/`).
- The share API is `worker/` (`bingo-musical-share`, `worker/wrangler.toml`). The static site Worker is the root `wrangler.jsonc` (`bingo-musical`). Keep those configs separate.

## Verify

`npm test` runs Vitest. `npm run test:e2e` is the Playwright smoke against the live GitHub Pages app. CI (`.github/workflows/ci.yml`) runs both on pull requests and on pushes to `main`, on Node 22. Details: [testing.md](./testing.md).
