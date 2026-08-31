import { getShareApiUrl, isShareApiConfigured } from "../share/sharedDecksApi";

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

export function trackEvent(event: ProductEvent, route?: RouteLabel): void {
  if (!isShareApiConfigured()) return;

  const body: { event: ProductEvent; route?: RouteLabel } = { event };
  if (route) {
    body.route = route;
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
