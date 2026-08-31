#!/usr/bin/env node
/**
 * CI check: every youtubeVideoId in the sample deck must pass noembed.
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

async function checkEmbeddable(videoId, retries = 3) {
  const url = `https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        return { embeddable: false, reason: `HTTP ${res.status}` };
      }
      const data = await res.json();
      if (data.error) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        return { embeddable: false, reason: data.error };
      }
      if (data.html && String(data.html).includes("iframe")) {
        return { embeddable: true };
      }
      return { embeddable: false, reason: "No iframe in oEmbed response" };
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      return { embeddable: false, reason: err instanceof Error ? err.message : "Request failed" };
    }
  }
  return { embeddable: false, reason: "Unknown error" };
}

let failed = 0;
for (const { title, videoId } of tracks) {
  const result = await checkEmbeddable(videoId);
  if (result.embeddable) {
    console.log(`OK  ${videoId}  ${title}`);
  } else {
    console.error(`FAIL ${videoId}  ${title}  — ${result.reason}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} sample track(s) failed embed validation.`);
  process.exit(1);
}

console.log(`\nAll ${tracks.length} sample tracks passed embed validation.`);
