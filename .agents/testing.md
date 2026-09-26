# Tests

Unit tests use Vitest: `npm test`. Coverage beyond shell navigation includes share-link helpers, canonical share payloads, bingo card generation, card verification scoring, deck readiness, and the host display-state transform.

Playwright smoke: `npm run test:e2e`. It loads the live GitHub Pages app at https://miquelt9.github.io/bingo-musical/ twice — a mobile viewport (390px, at most 639px) and a desktop viewport (1280px) — and checks that home renders meaningful content. It does not drive game flows.

GitHub Actions workflow `.github/workflows/ci.yml` runs the unit tests and that smoke on pull requests and on pushes to `main`.
