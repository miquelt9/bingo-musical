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

4. Share a deck — the link should look like `http://localhost:5173/#/share/Ab12Cd34`.

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
| `POST` | `/api/decks` | Store deck export JSON, returns `{ "shareId": "..." }` |
| `GET` | `/api/decks/:shareId` | Fetch stored deck export JSON |
| `GET` | `/api/health` | Health check |

Shared decks expire after 1 year (KV TTL).
