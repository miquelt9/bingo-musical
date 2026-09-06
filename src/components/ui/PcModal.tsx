import React, { useEffect } from "react";
import { Overlay, Window } from "@miquelt9/pc-ui";
import { twMerge } from "tailwind-merge";

interface PcModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export const PcModal: React.FC<PcModalProps> = ({
  title,
  onClose,
  children,
  className = "",
}) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <Overlay className="print:hidden" onClick={onClose}>
      <Window
        title={title}
        onClose={onClose}
        className={twMerge("w-full max-w-lg", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Window>
    </Overlay>
  );
};
