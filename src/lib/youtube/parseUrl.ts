export function parseYoutubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Raw 11-char ID (letters, numbers, hyphens, underscores)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle various URL patterns
  try {
    // Check if it looks like a URL or starts with domain
    const urlStr = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    // youtu.be/<id>
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    // youtube.com, m.youtube.com, music.youtube.com
    if (host.includes("youtube.com")) {
      // ?v=<id>
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      // /embed/<id>, /v/<id>, /shorts/<id>
      const pathParts = url.pathname.split("/").filter(Boolean);
      const prefixIndex = pathParts.findIndex((p) => ["embed", "v", "shorts"].includes(p));
      if (prefixIndex !== -1 && pathParts[prefixIndex + 1]) {
        const id = pathParts[prefixIndex + 1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    // If URL parsing throws, regex fallback
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

export function getYoutubeThumbnailUrl(
  videoId: string,
  quality: "default" | "mqdefault" | "hqdefault" | "sddefault" | "maxresdefault" = "hqdefault"
): string {
  if (!videoId) return "";
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export function parseYoutubePlaylistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  if (/^(PL|OL|UU|RD|FL)[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const urlStr =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("youtube.com") || host === "youtu.be") {
      const list = url.searchParams.get("list");
      if (list && list.length >= 10) return list;
    }
  } catch {
    const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function getYoutubeWatchUrl(videoId: string, startTime?: number): string {
  if (!videoId) return "";
  if (startTime && startTime > 0) {
    return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(startTime)}`;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}
