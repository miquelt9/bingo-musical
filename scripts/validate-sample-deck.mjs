#!/usr/bin/env node
/**
 * CI check: every youtubeVideoId in the sample deck must pass embed validation.
 * Primary: noembed.com. Fallback: YouTube oEmbed when noembed returns transient errors.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mockDeckPath = join(root, "src/lib/storage/mockDeck.ts");
const src = readFileSync(mockDeckPath, "utf8");

const tracks = [...src.matchAll(/title:\s*"([^"]+)"[\s\S]*?youtubeVideoId:\s*"([^"]+)"/g)].map(
  (m) => ({ title: m[1], videoId: m[2] })
);

const REQUEST_TIMEOUT_MS = 10_000;
const INTER_TRACK_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** noembed occasionally returns Perl/YAML internal errors — treat as retryable. */
function isTransientNoembedError(reason) {
  if (!reason) return false;
  const r = String(reason).toLowerCase();
  return (
    r.includes("hash ref") ||
    r.includes("strict refs") ||
    r.includes("internal server") ||
    r.includes("bad gateway") ||
    r.includes("service unavailable") ||
    r.includes("gateway timeout") ||
    r.includes("timeout") ||
    r.includes("econnreset") ||
    r.includes("fetch failed") ||
    r.includes("network")
  );
}

function hasIframeEmbed(data) {
  return Boolean(data?.html && String(data.html).includes("iframe"));
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: res.ok, status: res.status, data: null, parseError: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function checkWithNoembed(videoId, retries = 5) {
  const url = `https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { ok, status, data, parseError } = await fetchJson(url);

      if (!ok) {
        const reason = `HTTP ${status}`;
        if (attempt < retries && (status >= 500 || status === 429)) {
          await sleep(500 * attempt);
          continue;
        }
        return { embeddable: false, reason, transient: status >= 500 || status === 429 };
      }

      if (!data) {
        const reason = parseError ? `Invalid JSON: ${parseError}` : "Invalid JSON response";
        if (attempt < retries) {
          await sleep(500 * attempt);
          continue;
        }
        return { embeddable: false, reason, transient: true };
      }

      if (data.error) {
        const reason = String(data.error);
        if (attempt < retries && isTransientNoembedError(reason)) {
          await sleep(500 * attempt);
          continue;
        }
        return {
          embeddable: false,
          reason,
          transient: isTransientNoembedError(reason),
        };
      }

      if (hasIframeEmbed(data)) {
        return { embeddable: true, source: "noembed" };
      }

      return { embeddable: false, reason: "No iframe in oEmbed response", transient: false };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Request failed";
      if (attempt < retries) {
        await sleep(500 * attempt);
        continue;
      }
      return { embeddable: false, reason, transient: isTransientNoembedError(reason) };
    }
  }

  return { embeddable: false, reason: "Unknown error", transient: true };
}

async function checkWithYoutubeOEmbed(videoId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;

  try {
    const { ok, status, data } = await fetchJson(url);
    if (!ok) {
      return { embeddable: false, reason: `YouTube oEmbed HTTP ${status}` };
    }
    if (hasIframeEmbed(data)) {
      return { embeddable: true, source: "youtube-oembed" };
    }
    return { embeddable: false, reason: "No iframe in YouTube oEmbed response" };
  } catch (err) {
    return {
      embeddable: false,
      reason: err instanceof Error ? err.message : "YouTube oEmbed request failed",
    };
  }
}

async function checkEmbeddable(videoId) {
  const noembed = await checkWithNoembed(videoId);
  if (noembed.embeddable) return noembed;

  if (noembed.transient) {
    const fallback = await checkWithYoutubeOEmbed(videoId);
    if (fallback.embeddable) {
      return { ...fallback, note: `noembed failed (${noembed.reason}); used YouTube oEmbed` };
    }
    return {
      embeddable: false,
      reason: `noembed: ${noembed.reason}; YouTube oEmbed: ${fallback.reason}`,
    };
  }

  return noembed;
}

let failed = 0;
for (let i = 0; i < tracks.length; i++) {
  const { title, videoId } = tracks[i];
  const result = await checkEmbeddable(videoId);
  if (result.embeddable) {
    const suffix = result.note ? `  (${result.note})` : "";
    console.log(`OK  ${videoId}  ${title}${suffix}`);
  } else {
    console.error(`FAIL ${videoId}  ${title}  — ${result.reason}`);
    failed++;
  }
  if (i < tracks.length - 1) {
    await sleep(INTER_TRACK_DELAY_MS);
  }
}

if (failed > 0) {
  console.error(`\n${failed} sample track(s) failed embed validation.`);
  process.exit(1);
}

console.log(`\nAll ${tracks.length} sample tracks passed embed validation.`);
