import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router-dom";
import { twMerge } from "tailwind-merge";

export interface MobileNavDeckOption {
  id: string;
  name: string;
  trackCount: number;
}

export interface MobileNavLinkItem {
  id: string;
  label: string;
  to: string;
  icon: React.ReactNode;
  enabled: boolean;
  blockReason?: string;
  end?: boolean;
}

export interface MobileNavBackgroundTask {
  label: string;
  completed: number;
  total: number;
}

export interface MobileNavModel {
  activeTab: string | null;
  links: MobileNavLinkItem[];
  decks: MobileNavDeckOption[];
  currentDeckId: string;
  showDeckSelector: boolean;
  backgroundTask: MobileNavBackgroundTask | null;
  /** Return true when the deck change is applied immediately and the menu should close. */
  onDeckChange: (deckId: string) => boolean;
  onBlockedNav: (reason: string | undefined) => void;
}

interface MobileNavContextValue {
  enabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  panelId: string;
  triggerRef: React.RefObject<HTMLButtonElement>;
  model: MobileNavModel;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

function useMobileNavContext(): MobileNavContextValue | null {
  return useContext(MobileNavContext);
}

const VIEWPORT_MARGIN = 8;

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
}

export const MobileNavProvider: React.FC<{
  enabled: boolean;
  model: MobileNavModel;
  children: React.ReactNode;
}> = ({ enabled, model, children }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const location = useLocation();
  const pathWhenOpened = useRef(location.pathname);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      pathWhenOpened.current = location.pathname;
      if (wasOpen.current) {
        wasOpen.current = false;
        triggerRef.current?.focus();
      }
      return;
    }
    wasOpen.current = true;
    if (pathWhenOpened.current !== location.pathname) {
      setOpen(false);
    }
  }, [open, location.pathname]);

  const value: MobileNavContextValue = {
    enabled,
    open,
    setOpen,
    panelId,
    triggerRef,
    model,
  };

  return (
    <MobileNavContext.Provider value={value}>
      {children}
      {enabled && open ? <MobileNavPanel /> : null}
    </MobileNavContext.Provider>
  );
};

export const MobileNavTrigger: React.FC<{ className?: string }> = ({ className }) => {
  const ctx = useMobileNavContext();
  if (!ctx?.enabled) return null;

  const { open, setOpen, panelId, triggerRef, model } = ctx;
  const task = model.backgroundTask;
  const label = task
    ? `Menu, ${task.label} ${task.completed} of ${task.total}`
    : "Menu";

  return (
    <button
      ref={triggerRef}
      type="button"
      className={twMerge("pc-button pc-mobile-nav-trigger pc-page-header-menu", className)}
      aria-label={label}
      aria-expanded={open}
      aria-controls={panelId}
      aria-haspopup="true"
      onClick={() => setOpen(!open)}
    >
      <span>Menu</span>
      {task ? (
        <span className="pc-mobile-nav-task" aria-hidden="true">
          {task.completed}/{task.total}
        </span>
      ) : null}
    </button>
  );
};

const MobileNavPanel: React.FC = () => {
  const ctx = useMobileNavContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const didFocus = useRef(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!ctx?.open || !panelRef.current) return;

    const update = () => {
      const panel = panelRef.current;
      const trigger = ctx.triggerRef.current;
      if (!panel) return;
      const panelRect = panel.getBoundingClientRect();
      const triggerRect = trigger?.getBoundingClientRect();
      const width = panelRect.width;
      let left = triggerRect ? triggerRect.right - width : VIEWPORT_MARGIN;
      left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN));
      let top = triggerRect ? triggerRect.bottom + 6 : VIEWPORT_MARGIN;
      if (top + panelRect.height > window.innerHeight - VIEWPORT_MARGIN) {
        const above = triggerRect ? triggerRect.top - panelRect.height - 6 : VIEWPORT_MARGIN;
        top = above > VIEWPORT_MARGIN ? above : VIEWPORT_MARGIN;
      }
      setPosition({ top, left });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [ctx]);

  useLayoutEffect(() => {
    if (didFocus.current || !panelRef.current || !position) return;
    focusableElements(panelRef.current)[0]?.focus();
    didFocus.current = true;
  }, [position]);

  useEffect(() => {
    if (!ctx?.open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (ctx.triggerRef.current?.contains(target)) return;
      ctx.setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        ctx.setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = focusableElements(panelRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ctx, ctx?.open]);

  if (!ctx?.open) return null;

  const { model, panelId, setOpen } = ctx;
  const currentDeck = model.decks.find((deck) => deck.id === model.currentDeckId);

  const panel = (
    <div
      id={panelId}
      ref={panelRef}
      role="navigation"
      aria-label="Pages"
      className="pc-mobile-nav-panel print:hidden"
      style={{
        top: position?.top ?? VIEWPORT_MARGIN,
        left: position?.left ?? VIEWPORT_MARGIN,
      }}
    >
      {model.showDeckSelector && model.decks.length > 0 && (
        <div className="pc-mobile-nav-deck">
          <label className="pc-mobile-nav-deck-label" htmlFor={`${panelId}-deck`}>
            Active deck
            <span className="pc-mobile-nav-deck-current">
              {currentDeck ? `${currentDeck.name} (${currentDeck.trackCount})` : "Choose a deck"}
            </span>
          </label>
          <select
            id={`${panelId}-deck`}
            className="pc-select pc-mobile-nav-deck-select"
            value={model.currentDeckId}
            aria-label="Active deck"
            onChange={(event) => {
              const shouldClose = model.onDeckChange(event.target.value);
              if (shouldClose) setOpen(false);
            }}
          >
            {model.decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} ({deck.trackCount})
              </option>
            ))}
          </select>
        </div>
      )}

      <ul className="pc-mobile-nav-links">
        {model.links.map((link) => {
          const active = model.activeTab === link.id;
          if (!link.enabled) {
            const reason = link.blockReason ?? "This action is not available for the current deck.";
            return (
              <li key={link.id}>
                <button
                  type="button"
                  className="pc-mobile-nav-link"
                  aria-disabled="true"
                  title={reason}
                  aria-label={`${link.label}. ${reason}`}
                  onClick={() => model.onBlockedNav(link.blockReason)}
                >
                  <span className="pc-mobile-nav-link-icon" aria-hidden="true">{link.icon}</span>
                  <span className="pc-mobile-nav-link-copy">
                    <span>{link.label}</span>
                    <span className="pc-mobile-nav-reason">{reason}</span>
                  </span>
                </button>
              </li>
            );
          }

          return (
            <li key={link.id}>
              <NavLink
                to={link.to}
                end={link.end}
                className={() => twMerge("pc-mobile-nav-link", active && "active")}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="pc-mobile-nav-link-icon" aria-hidden="true">{link.icon}</span>
                <span>{link.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>

      {model.backgroundTask && (
        <p className="pc-mobile-nav-status" role="status">
          {model.backgroundTask.label} ({model.backgroundTask.completed}/{model.backgroundTask.total})
        </p>
      )}
    </div>
  );

  return createPortal(panel, document.body);
};
