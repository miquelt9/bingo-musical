import React from "react";
import { ArrowLeft } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useCanGoBack, useNavigateBack } from "../../hooks/useNavigateBack";

export interface BackNavTarget {
  fallbackTo: string;
  fallbackLabel: string;
}

export interface BackButtonProps extends BackNavTarget {
  className?: string;
  labelClassName?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
  fallbackTo,
  fallbackLabel,
  className,
  labelClassName,
}) => {
  const canGoBack = useCanGoBack();
  const navigateBack = useNavigateBack();
  const label = canGoBack ? "Back" : fallbackLabel;

  return (
    <button
      type="button"
      onClick={() => navigateBack(fallbackTo)}
      className={twMerge("pc-button", className)}
    >
      <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className={labelClassName}>{label}</span>
    </button>
  );
};
