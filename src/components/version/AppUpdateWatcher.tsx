import { RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { applyAppUpdate, useAppUpdate } from "../../hooks/useAppUpdate";
import { useToast } from "../../state/ToastContext";

/** Runs update checks for every route, including host display. */
export function AppUpdateWatcher(): null {
  const { showToast } = useToast();

  const onUpdateAvailable = useCallback(
    (buildId: string) => {
      showToast({
        title: "Update available",
        icon: <RefreshCw className="w-3.5 h-3.5" />,
        message:
          "A new version is ready. Reload when your game is finished to get the latest changes.",
        actions: [
          {
            id: "reload",
            label: "Reload now",
            variant: "primary",
            onClick: () => applyAppUpdate(buildId),
          },
        ],
      });
    },
    [showToast]
  );

  useAppUpdate({ onUpdateAvailable });
  return null;
}
