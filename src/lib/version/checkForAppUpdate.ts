import { getPublishedBuildId } from "./deployedBuild";

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
  const publishedBuildId = await getPublishedBuildId();
  if (publishedBuildId && publishedBuildId !== APP_BUILD_ID) {
    return { buildId: publishedBuildId };
  }
  return null;
}
