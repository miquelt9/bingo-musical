import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { RouteLabel, trackEvent } from "../lib/analytics/trackEvent";

function routeLabelFromPath(pathname: string): RouteLabel {
  if (pathname === "/") return "home";
  if (pathname === "/import") return "import";
  if (pathname === "/settings") return "settings";
  if (pathname.startsWith("/share/")) return "share";
  if (pathname.endsWith("/play")) return "host";
  if (pathname.endsWith("/cards")) return "cards";
  if (pathname.startsWith("/deck/")) return "editor";
  return "home";
}

export function useRouteAnalytics(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    trackEvent("page_view", routeLabelFromPath(pathname));
  }, [pathname]);
}
