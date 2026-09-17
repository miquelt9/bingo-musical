const APP_BUILD_ID = import.meta.env.VITE_BUILD_ID;

function isCommitHash(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

/** Reads the currently published build marker for update checks. */
export async function getPublishedBuildId(): Promise<string | null> {
  if (import.meta.env.DEV || !APP_BUILD_ID || !isCommitHash(APP_BUILD_ID)) return null;

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json?${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { buildId?: unknown };
    return typeof payload.buildId === "string" && isCommitHash(payload.buildId)
      ? payload.buildId
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads the version marker from the site currently serving this bundle.
 * A matching SHA proves that this build's artifact is available on Pages.
 */
export async function getVerifiedPublishedBuildId(): Promise<string | null> {
  const publishedBuildId = await getPublishedBuildId();
  return publishedBuildId === APP_BUILD_ID ? publishedBuildId : null;
}
