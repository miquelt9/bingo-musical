import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

function getHistoryIndex(): number | undefined {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === "number" ? state.idx : undefined;
}

/** True when the browser history stack has a prior in-app entry. */
export function useCanGoBack(): boolean {
  const idx = getHistoryIndex();
  return typeof idx === "number" && idx > 0;
}

/** Go back in history when possible; otherwise navigate to `fallbackTo`. */
export function useNavigateBack() {
  const navigate = useNavigate();

  return useCallback(
    (fallbackTo: string) => {
      const idx = getHistoryIndex();
      if (typeof idx === "number" && idx > 0) {
        navigate(-1);
      } else {
        navigate(fallbackTo);
      }
    },
    [navigate],
  );
}
