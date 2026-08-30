import { createPkcePair, consumeVerifier } from "./pkce";

const AUTH_TOKEN_STORAGE_KEY = "bingo-musical:spotify-auth";
const SPOTIFY_RETURN_STORAGE_KEY = "bingo-musical:spotify-return";
const EXCHANGED_CODE_KEY = "bingo-musical:spotify-exchanged-code";

let exchangeInFlight: Promise<StoredAuthData> | null = null;
let refreshInFlight: Promise<StoredAuthData> | null = null;
const SCOPES =
  "playlist-read-private playlist-read-collaborative user-library-read";

export type SpotifyReturnIntent = "import";

export function setSpotifyReturnIntent(intent: SpotifyReturnIntent): void {
  sessionStorage.setItem(SPOTIFY_RETURN_STORAGE_KEY, intent);
}

export function consumeSpotifyReturnIntent(): SpotifyReturnIntent | null {
  const value = sessionStorage.getItem(SPOTIFY_RETURN_STORAGE_KEY);
  if (value !== "import") return null;
  sessionStorage.removeItem(SPOTIFY_RETURN_STORAGE_KEY);
  return "import";
}

export interface StoredAuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp in ms
}

export function getClientId(): string {
  return (import.meta.env.VITE_SPOTIFY_CLIENT_ID || "").trim();
}

export function isSpotifyConfigured(): boolean {
  return Boolean(getClientId());
}

export function getRedirectUri(): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.startsWith("/") ? base : `/${base}`;
  const origin = window.location.origin;
  return `${origin}${normalizedBase}`;
}

export function getStoredAuth(): StoredAuthData | null {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthData;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: StoredAuthData): void {
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, JSON.stringify(auth));
  } catch (err) {
    if (err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22)) {
      throw new Error("Browser storage is full. Disconnect Spotify or free up space.");
    }
    throw err;
  }
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(EXCHANGED_CODE_KEY);
}

export async function beginLogin(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Spotify is not configured on this deployment.");
  }

  const { challenge } = await createPkcePair();
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("show_dialog", "true");

  setSpotifyReturnIntent("import");
  window.location.assign(url.toString());
}

async function performCodeExchange(code: string): Promise<StoredAuthData> {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Spotify is not configured on this deployment.");
  }

  const verifier = consumeVerifier();
  if (!verifier) {
    throw new Error("Missing PKCE code verifier. Please try logging in again.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error_description || errData.error || `Token exchange failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  const authData: StoredAuthData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60000, // 1 min safety buffer
  };

  saveStoredAuth(authData);
  sessionStorage.setItem(EXCHANGED_CODE_KEY, code);
  return authData;
}

export async function exchangeCode(code: string): Promise<StoredAuthData> {
  const existing = getStoredAuth();
  const exchangedCode = sessionStorage.getItem(EXCHANGED_CODE_KEY);
  if (exchangedCode === code && existing) {
    return existing;
  }

  if (exchangeInFlight) {
    return exchangeInFlight;
  }

  exchangeInFlight = performCodeExchange(code).finally(() => {
    exchangeInFlight = null;
  });
  return exchangeInFlight;
}

async function performTokenRefresh(refreshToken: string): Promise<StoredAuthData> {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Spotify is not configured on this deployment.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    clearStoredAuth();
    throw new Error("Failed to refresh Spotify access token. Please log in again.");
  }

  const data = await res.json();
  const authData: StoredAuthData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 60000,
  };

  saveStoredAuth(authData);
  return authData;
}

export async function refreshAccessToken(refreshToken: string): Promise<StoredAuthData> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = performTokenRefresh(refreshToken).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function getValidAccessToken(): Promise<string | null> {
  const current = getStoredAuth();
  if (!current) return null;

  if (Date.now() < current.expiresAt) {
    return current.accessToken;
  }

  try {
    const refreshed = await refreshAccessToken(current.refreshToken);
    return refreshed.accessToken;
  } catch (err) {
    console.error("Token refresh failed:", err);
    clearStoredAuth();
    return null;
  }
}
