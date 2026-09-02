# Share API (Cloudflare Worker + KV)

Stores shared Musical Bingo decks as read-only snapshots and serves them via short ids.

## One-time Cloudflare setup

1. Sign in at [cloudflare.com](https://www.cloudflare.com/) and install Wrangler if needed (`npm install` in the repo root already adds it).
2. Log in:

   ```bash
   npx wrangler login
   ```

3. Create KV namespaces:

   ```bash
   npx wrangler kv namespace create SHARED_DECKS
   npx wrangler kv namespace create SHARED_DECKS --preview
   ```

4. Copy the `id` values into `worker/wrangler.toml` (`id` and `preview_id`).
5. Update `ALLOWED_ORIGINS` in `worker/wrangler.toml` if your site URL differs from `https://miquelt9.github.io`.

## Local development

1. Add to your root `.env`:

   ```env
   VITE_SHARE_API_URL=http://localhost:8787
   ```

2. In one terminal, run the worker:

   ```bash
   npm run worker:dev
   ```

3. In another terminal, run the app:

   ```bash
   npm run dev
   ```

4. Share a deck — the link should look like `http://localhost:5173/#/share/xYz12Ab3Cd`. The id is derived from the deck content, so sharing the same deck twice does not create duplicate KV entries.

## Deploy the worker

```bash
npm run worker:deploy
```

Wrangler prints the worker URL (for example `https://bingo-musical-share.<account>.workers.dev`).

Set that URL in:

- Local `.env` as `VITE_SHARE_API_URL`
- GitHub repository secret `VITE_SHARE_API_URL` for production builds

Rebuild/redeploy the frontend after setting the secret.

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/decks` | Store deck export JSON if not already present. Returns `{ "shareId": "..." }` with `201` on first write or `200` when content already exists (no KV write). |
| `GET` | `/api/decks/:shareId` | Fetch stored deck export JSON |
| `POST` | `/api/events` | Record anonymous usage event (returns `204`) |
| `GET` | `/api/health` | Health check |

Share ids are the first 10 characters of a SHA-256 hash (base64url) of a canonical JSON payload: deck name plus each song’s title, artist, optional album, YouTube video id, and clip start/end. Volatile fields such as `exportedAt` and local track ids are excluded. Legacy random ids remain valid until TTL expiry.

Shared decks expire after 1 year (KV TTL).

## Usage analytics (Workers Analytics Engine)

The worker writes anonymous, aggregate events to the `bingo_musical_usage` dataset (configured in `wrangler.toml`). No cookies, IPs, or user identifiers are stored.

**Server-side events** (automatic):

| Event | Trigger |
|-------|---------|
| `share_created` | Successful `POST /api/decks` that wrote a new KV entry |
| `share_deduplicated` | Successful `POST /api/decks` when identical content was already stored (no write) |
| `share_opened` | Successful `GET /api/decks/:shareId` |
| `share_not_found` | `GET /api/decks/:shareId` returns 404 |

**Client-side events** (via `POST /api/events` from the app):

| Event | When |
|-------|------|
| `page_view` | Route change (with route label: `home`, `editor`, `cards`, `host`, etc.) |
| `host_started` | Host game session ready |
| `deck_imported` | JSON deck import succeeds |
| `cards_printed` | Browser print or PDF export |

View data in the Cloudflare dashboard → **Workers Analytics Engine** → SQL, for example:

```sql
SELECT blob1 AS event, COUNT() AS count
FROM bingo_musical_usage
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY event
ORDER BY count DESC
```

Page views by route:

```sql
SELECT blob2 AS route, COUNT() AS count
FROM bingo_musical_usage
WHERE blob1 = 'page_view'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY route
ORDER BY count DESC
```

**Note:** Analytics Engine bindings do not work in `wrangler dev` locally. Events appear after deploying the worker.

KV dashboard metrics (reads/writes) show infrastructure usage for shares and rate limiting — not full-site visitor counts. For traffic metrics, use Cloudflare Web Analytics (see root `README.md`).
