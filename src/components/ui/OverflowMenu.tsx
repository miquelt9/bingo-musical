import React, { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { twMerge } from "tailwind-merge";

export interface OverflowMenuItem {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  ariaLabel?: string;
  className?: string;
  align?: "left" | "right";
}

export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  items,
  ariaLabel = "More actions",
  className,
  align = "right",
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className={twMerge("pc-overflow-menu", className)}>
      <button
        type="button"
        className="pc-button pc-overflow-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={twMerge(
            "pc-overflow-menu-panel",
            align === "left" ? "pc-overflow-menu-panel--left" : "pc-overflow-menu-panel--right",
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={twMerge(
                "pc-overflow-menu-item",
                item.destructive && "pc-overflow-menu-item--destructive",
                item.disabled && "pc-overflow-menu-item--disabled",
              )}
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              title={item.title}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon && <span className="pc-overflow-menu-item-icon">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
