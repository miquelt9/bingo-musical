import React, { useEffect, useMemo, useState } from "react";

interface AlbumArtProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

function artworkCandidates(src: string): string[] {
  const trimmed = src.trim();
  if (!trimmed) return [];

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (hostname === "cdn-images.dzcdn.net") {
      return [trimmed, trimmed.replace(url.hostname, "e-cdns-images.dzcdn.net")];
    }
    if (hostname === "e-cdns-images.dzcdn.net") {
      return [trimmed, trimmed.replace(url.hostname, "cdn-images.dzcdn.net")];
    }
  } catch {
    // Keep non-URL artwork sources usable as-is.
  }

  return [trimmed];
}

/** Deezer artwork with a fallback for mobile networks that cannot reach its primary CDN host. */
export const AlbumArt: React.FC<AlbumArtProps> = ({ src, onError, ...props }) => {
  const candidates = useMemo(() => artworkCandidates(src), [src]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [src]);

  const currentSrc = candidates[candidateIndex];
  if (!currentSrc) return null;

  return (
    <img
      {...props}
      src={currentSrc}
      referrerPolicy="no-referrer"
      onError={(event) => {
        onError?.(event);
        setCandidateIndex((index) => Math.min(index + 1, candidates.length));
      }}
    />
  );
};
