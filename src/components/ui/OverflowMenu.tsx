import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;

function computeMenuPosition(
  triggerRect: DOMRect,
  panelRect: DOMRect,
  align: "left" | "right",
): { top: number; left: number } {
  const spaceAbove = triggerRect.top - VIEWPORT_MARGIN;
  const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_MARGIN;

  let top: number;
  if (spaceAbove >= panelRect.height + MENU_GAP) {
    top = triggerRect.top - panelRect.height - MENU_GAP;
  } else if (spaceBelow >= panelRect.height + MENU_GAP) {
    top = triggerRect.bottom + MENU_GAP;
  } else if (spaceBelow >= spaceAbove) {
    top = Math.min(
      triggerRect.bottom + MENU_GAP,
      window.innerHeight - panelRect.height - VIEWPORT_MARGIN,
    );
  } else {
    top = Math.max(VIEWPORT_MARGIN, triggerRect.top - panelRect.height - MENU_GAP);
  }

  let left = align === "right" ? triggerRect.right - panelRect.width : triggerRect.left;
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, window.innerWidth - panelRect.width - VIEWPORT_MARGIN),
  );

  return { top, left };
}

export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  items,
  ariaLabel = "More actions",
  className,
  align = "right",
}) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current || !panelRef.current) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();
      setMenuPosition(computeMenuPosition(triggerRect, panelRect, align));
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
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

  const menuPanel = open ? (
    <div
      id={menuId}
      ref={panelRef}
      role="menu"
      className="pc-overflow-menu-panel pc-overflow-menu-panel--floating"
      style={{
        position: "fixed",
        top: menuPosition?.top ?? -9999,
        left: menuPosition?.left ?? -9999,
        visibility: menuPosition ? "visible" : "hidden",
      }}
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
  ) : null;

  return (
    <div ref={containerRef} className={twMerge("pc-overflow-menu", className)}>
      <button
        ref={triggerRef}
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
      {menuPanel && createPortal(menuPanel, document.body)}
    </div>
  );
};
