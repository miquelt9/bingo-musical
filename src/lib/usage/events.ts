import { getShareApiUrl, isShareApiConfigured } from "../share/sharedDecksApi";
import { getTrafficAudience } from "./audience";

export type ProductEvent =
  | "host_started"
  | "cards_printed"
  | "deck_imported"
  | "page_view";

export type RouteLabel =
  | "home"
  | "editor"
  | "cards"
  | "host"
  | "import"
  | "share"
  | "settings";

export type UsageOutput = "browser" | "pdf";

export interface UsageEventContext {
  output?: UsageOutput;
}

export function trackEvent(
  event: ProductEvent,
  route?: RouteLabel,
  context?: UsageEventContext
): void {
  if (!isShareApiConfigured()) return;

  const body: {
    event: ProductEvent;
    route?: RouteLabel;
    audience: ReturnType<typeof getTrafficAudience>;
    output?: UsageOutput;
  } = {
    event,
    audience: getTrafficAudience(),
  };
  if (route) {
    body.route = route;
  }
  if (context?.output) {
    body.output = context.output;
  }

  const apiUrl = getShareApiUrl();
  void fetch(`${apiUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // Fire-and-forget; ignore network errors.
  });
}
