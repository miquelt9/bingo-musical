export type TrafficAudience = "public" | "tester";

const TRAFFIC_AUDIENCE_STORAGE_KEY = "bingo.trafficAudience";
const TRAFFIC_AUDIENCE_QUERY_KEY = "traffic";

function isTrafficAudience(value: string | null): value is TrafficAudience {
  return value === "public" || value === "tester";
}

function readStoredAudience(): TrafficAudience {
  try {
    const stored = window.localStorage.getItem(TRAFFIC_AUDIENCE_STORAGE_KEY);
    return isTrafficAudience(stored) ? stored : "public";
  } catch {
    return "public";
  }
}

function persistAudience(audience: TrafficAudience): void {
  try {
    window.localStorage.setItem(TRAFFIC_AUDIENCE_STORAGE_KEY, audience);
  } catch {
    // Storage can be disabled; the current URL still controls this visit.
  }
}

/**
 * Reads the optional ?traffic=tester|public switch and persists the choice.
 * This intentionally uses localStorage rather than cookies or a visitor id.
 */
export function getTrafficAudience(): TrafficAudience {
  if (typeof window === "undefined") return "public";

  const queryAudience = new URLSearchParams(window.location.search).get(TRAFFIC_AUDIENCE_QUERY_KEY);
  if (isTrafficAudience(queryAudience)) {
    persistAudience(queryAudience);
    return queryAudience;
  }

  return readStoredAudience();
}

export function getTrafficAudienceHeader(): Record<string, string> {
  return { "X-Bingo-Audience": getTrafficAudience() };
}
