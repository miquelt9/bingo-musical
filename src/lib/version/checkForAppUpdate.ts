const APP_BUILD_ID = import.meta.env.VITE_BUILD_ID;

export interface AppUpdateInfo {
  buildId: string;
}

export function applyAppUpdate(buildId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_v", buildId);
  window.location.replace(url.toString());
}

/** Returns update info when the deployed build is newer than this bundle. */
export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!APP_BUILD_ID || import.meta.env.DEV) return null;

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json?${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { buildId?: string };
    if (payload.buildId && payload.buildId !== APP_BUILD_ID) {
      return { buildId: payload.buildId };
    }
    return null;
  } catch {
    return null;
  }
}
