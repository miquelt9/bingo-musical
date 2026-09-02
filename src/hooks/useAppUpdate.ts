import { useEffect, useRef } from "react";
import { applyAppUpdate, checkForAppUpdate } from "../lib/version/checkForAppUpdate";

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

interface UseAppUpdateOptions {
  onUpdateAvailable: (buildId: string) => void;
}

export function useAppUpdate({ onUpdateAvailable }: UseAppUpdateOptions): void {
  const notifiedRef = useRef(false);

  useEffect(() => {
    const notifyIfUpdateAvailable = async () => {
      const update = await checkForAppUpdate();
      if (!update || notifiedRef.current) return;

      notifiedRef.current = true;
      onUpdateAvailable(update.buildId);
    };

    void notifyIfUpdateAvailable();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void notifyIfUpdateAvailable();
      }
    };

    const intervalId = window.setInterval(() => {
      void notifyIfUpdateAvailable();
    }, UPDATE_CHECK_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [onUpdateAvailable]);
}

export { applyAppUpdate };
