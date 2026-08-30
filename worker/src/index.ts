export interface Env {
  SHARED_DECKS: KVNamespace;
  /** Comma-separated browser origins allowed for CORS (e.g. https://user.github.io). */
  ALLOWED_ORIGINS?: string;
}

const SHARE_ID_PATTERN = /^[a-zA-Z0-9_-]{6,12}$/;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SONGS = 150;
const SHARE_TTL_SECONDS = 60 * 60 * 24 * 365;
const SHARE_KEY_PREFIX = "share:";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://miquelt9.github.io",
];

const SHARE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function getAllowedOrigins(env: Env): string[] {
  const configured = env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && getAllowedOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function jsonResponse(
  request: Request,
  env: Env,
  body: unknown,
  status = 200
): Response {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(request: Request, env: Env, message: string, status: number): Response {
  return jsonResponse(request, env, { error: message }, status);
}

function generateShareId(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += SHARE_ALPHABET[bytes[i] % SHARE_ALPHABET.length];
  }
  return id;
}

function isValidSharePayload(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;
  if (obj.format !== "bingo-musical-deck") {
    return false;
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return false;
  }

  const songs = Array.isArray(obj.songs) ? obj.songs : null;
  const tracks = Array.isArray(obj.tracks) ? obj.tracks : null;
  const songCount = songs?.length ?? tracks?.length ?? 0;
  return songCount > 0 && songCount <= MAX_SONGS;
}

async function handleCreateDeck(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(request, env, "Deck payload is too large.", 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, env, "Invalid JSON body.", 400);
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_BODY_BYTES) {
    return errorResponse(request, env, "Deck payload is too large.", 413);
  }

  if (!isValidSharePayload(payload)) {
    return errorResponse(request, env, "Invalid deck payload.", 400);
  }

  const shareId = generateShareId();
  await env.SHARED_DECKS.put(`${SHARE_KEY_PREFIX}${shareId}`, serialized, {
    expirationTtl: SHARE_TTL_SECONDS,
  });

  return jsonResponse(request, env, { shareId }, 201);
}

async function handleGetDeck(request: Request, env: Env, shareId: string): Promise<Response> {
  if (!SHARE_ID_PATTERN.test(shareId)) {
    return errorResponse(request, env, "Invalid share id.", 400);
  }

  const stored = await env.SHARED_DECKS.get(`${SHARE_KEY_PREFIX}${shareId}`);
  if (!stored) {
    return errorResponse(request, env, "Shared deck not found.", 404);
  }

  try {
    const payload = JSON.parse(stored);
    return jsonResponse(request, env, payload, 200);
  } catch {
    return errorResponse(request, env, "Stored deck is corrupted.", 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (url.pathname === "/api/decks" && request.method === "POST") {
      return handleCreateDeck(request, env);
    }

    const match = url.pathname.match(/^\/api\/decks\/([^/]+)$/);
    if (match && request.method === "GET") {
      return handleGetDeck(request, env, decodeURIComponent(match[1]));
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse(request, env, { ok: true }, 200);
    }

    return errorResponse(request, env, "Not found.", 404);
  },
};
