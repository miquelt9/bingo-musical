const LAST_BACKEND_KEY = "bingo.yt.lastBackend";
const DIRECTORY_TTL_MS = 10 * 60 * 1000;

export const INVIDIOUS_INSTANCES = [
  "https://invidious.materialio.us",
  "https://invidious.private.coffee",
  "https://invidious.nerdvpn.de",
  "https://inv.tux.pizza",
  "https://invidious.protokolla.fi",
  "https://invidious.tiekoetter.com",
  "https://invidious.f5.si",
  "https://yt.chocolatemoo53.com",
];

export const PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.ducks.party",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.orangenet.cc",
  "https://pipedapi.owo.si",
  "https://pipedapi.drgns.space",
  "https://pipedapi.adminforge.de",
  "https://piped-api.codespace.cz",
  "https://pipedapi-libre.kavin.rocks",
  "https://pipedapi.darkness.services",
];

export interface YoutubeBackends {
  invidious: string[];
  piped: string[];
}

let discovered: YoutubeBackends | null = null;
let discoveredAt = 0;
let refreshInFlight: Promise<void> | null = null;

function isPublicHttpsHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith(".onion") || host.endsWith(".i2p")) return false;
    if (host.includes("ygg") || host.endsWith(".ygg")) return false;
    return true;
  } catch {
    return false;
  }
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.trim().replace(/\/+$/, "");
    if (!url.startsWith("https://")) continue;
    if (!isPublicHttpsHost(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

function readLastBackend(): { kind: "invidious" | "piped"; url: string } | null {
  try {
    const raw = localStorage.getItem(LAST_BACKEND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { kind?: string; url?: string };
    if ((parsed.kind === "invidious" || parsed.kind === "piped") && parsed.url) {
      return { kind: parsed.kind, url: parsed.url.replace(/\/+$/, "") };
    }
  } catch {
    // ignore
  }
  return null;
}

export function getLastYoutubeBackend(): { kind: "invidious" | "piped"; url: string } | null {
  return readLastBackend();
}

export function rememberYoutubeBackend(kind: "invidious" | "piped", url: string): void {
  try {
    localStorage.setItem(LAST_BACKEND_KEY, JSON.stringify({ kind, url: url.replace(/\/+$/, ""), at: Date.now() }));
  } catch {
    // ignore
  }
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs = 4500,
  externalSignal?: AbortSignal,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  if (externalSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", ...extraHeaders },
    });
  } finally {
    clearTimeout(id);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

export async function raceFirstSuccess<T>(
  tasks: Array<(signal: AbortSignal) => Promise<T | null>>,
  options?: { parentSignal?: AbortSignal; concurrency?: number }
): Promise<T | null> {
  const parent = options?.parentSignal;
  if (parent?.aborted) return null;
  const concurrency = Math.max(1, options?.concurrency ?? 6);
  if (tasks.length === 0) return null;

  const controller = new AbortController();
  const stop = () => controller.abort();
  parent?.addEventListener("abort", stop);

  return await new Promise<T | null>((resolve) => {
    let settled = false;
    let next = 0;
    let inFlight = 0;
    let remaining = tasks.length;

    const settle = (value: T | null) => {
      if (settled) return;
      settled = true;
      parent?.removeEventListener("abort", stop);
      if (value) controller.abort();
      resolve(value);
    };

    parent?.addEventListener("abort", () => settle(null), { once: true });

    const launch = () => {
      if (settled) return;
      while (inFlight < concurrency && next < tasks.length) {
        const task = tasks[next++];
        inFlight++;
        Promise.resolve()
          .then(() => task(controller.signal))
          .then((result) => {
            inFlight--;
            remaining--;
            if (result != null && !settled) {
              settle(result);
              return;
            }
            if (remaining === 0) settle(null);
            else launch();
          })
          .catch(() => {
            inFlight--;
            remaining--;
            if (remaining === 0) settle(null);
            else launch();
          });
      }
    };

    launch();
  });
}

async function fetchPipedDirectory(signal?: AbortSignal): Promise<string[]> {
  const res = await fetchWithTimeout(
    "https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md",
    4000,
    signal
  );
  if (!res.ok) return [];
  const md = await res.text();
  const matches = md.match(/https:\/\/(?:pipedapi(?:-libre)?|api\.piped|piped-api)[a-zA-Z0-9._-]*/gi) || [];
  return uniqueUrls(matches);
}

async function fetchInvidiousDirectory(signal?: AbortSignal): Promise<string[]> {
  const res = await fetchWithTimeout("https://api.invidious.io/instances.json?sort_by=type,users", 4000, signal);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  const urls: string[] = [];
  for (const row of data) {
    const meta = Array.isArray(row) ? row[1] : row;
    if (!meta || typeof meta !== "object") continue;
    if (meta.type !== "https") continue;
    if (meta.api === false) continue;
    if (typeof meta.uri === "string") urls.push(meta.uri);
  }
  return uniqueUrls(urls);
}

async function refreshYoutubeBackends(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const [piped, invidious] = await Promise.all([
      fetchPipedDirectory().catch(() => [] as string[]),
      fetchInvidiousDirectory().catch(() => [] as string[]),
    ]);
    discovered = {
      piped: uniqueUrls([...PIPED_INSTANCES, ...piped]),
      invidious: uniqueUrls([...INVIDIOUS_INSTANCES, ...invidious]),
    };
    discoveredAt = Date.now();
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function preferLast(kind: "invidious" | "piped", urls: string[]): string[] {
  const last = readLastBackend();
  if (!last || last.kind !== kind) return urls;
  return uniqueUrls([last.url, ...urls]);
}

export function getYoutubeBackends(): YoutubeBackends {
  if (!discovered || Date.now() - discoveredAt > DIRECTORY_TTL_MS) {
    void refreshYoutubeBackends();
  }
  const piped = preferLast("piped", discovered?.piped ?? PIPED_INSTANCES);
  const invidious = preferLast("invidious", discovered?.invidious ?? INVIDIOUS_INSTANCES);
  return { piped, invidious };
}

void refreshYoutubeBackends();
