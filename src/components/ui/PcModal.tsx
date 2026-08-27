import React from "react";
import { Overlay, Window } from "@miquelt9/pc-ui";

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
  return (
    <Overlay className="print:hidden" onClick={onClose}>
      <Window
        title={title}
        onClose={onClose}
        className={`w-full max-w-lg ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Window>
    </Overlay>
  );
};
