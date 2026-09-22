import React, { createContext, useContext } from "react";
import { NavLink } from "react-router-dom";
import { twMerge } from "tailwind-merge";
import { phoneSectionTabs, type ShellTab } from "../../lib/nav/shellNav";

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
  activeTab: ShellTab | null;
  links: MobileNavLinkItem[];
  backgroundTask: MobileNavBackgroundTask | null;
  onBlockedNav: (reason: string | undefined) => void;
}

interface MobileNavContextValue {
  enabled: boolean;
  model: MobileNavModel;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

function useMobileNavContext(): MobileNavContextValue | null {
  return useContext(MobileNavContext);
}

export const MobileNavProvider: React.FC<{
  enabled: boolean;
  model: MobileNavModel;
  children: React.ReactNode;
}> = ({ enabled, model, children }) => {
  return (
    <MobileNavContext.Provider value={{ enabled, model }}>
      {children}
    </MobileNavContext.Provider>
  );
};

function sectionLinksFor(model: MobileNavModel): MobileNavLinkItem[] {
  const tabs = phoneSectionTabs(model.activeTab);
  if (tabs.length === 0) return [];
  const byId = new Map(model.links.map((link) => [link.id, link]));
  return tabs
    .map((tab) => byId.get(tab))
    .filter((link): link is MobileNavLinkItem => Boolean(link));
}

export const MobileSectionNav: React.FC<{ className?: string }> = ({ className }) => {
  const ctx = useMobileNavContext();
  if (!ctx?.enabled) return null;

  const links = sectionLinksFor(ctx.model);
  if (links.length === 0) return null;

  return (
    <nav
      aria-label="Sections"
      className={twMerge("pc-mobile-section-nav pc-page-header-sections", className)}
    >
      {links.map((link) => {
        if (!link.enabled) {
          const reason = link.blockReason ?? "This action is not available for the current deck.";
          return (
            <button
              key={link.id}
              type="button"
              className="pc-button pc-mobile-section-item"
              aria-disabled="true"
              title={reason}
              aria-label={`${link.label}. ${reason}`}
              onClick={() => ctx.model.onBlockedNav(link.blockReason)}
            >
              <span className="pc-mobile-section-icon" aria-hidden="true">
                {link.icon}
              </span>
            </button>
          );
        }

        return (
          <NavLink
            key={link.id}
            to={link.to}
            end={link.end}
            title={link.label}
            aria-label={link.label}
            className={() => "pc-button pc-mobile-section-item"}
          >
            <span className="pc-mobile-section-icon" aria-hidden="true">
              {link.icon}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
};

export const MobileBackgroundTaskStatus: React.FC<{ className?: string }> = ({ className }) => {
  const ctx = useMobileNavContext();
  if (!ctx?.enabled) return null;

  const task = ctx.model.backgroundTask;
  if (!task) return null;

  return (
    <p
      className={twMerge("pc-mobile-section-status", className)}
      role="status"
      aria-live="polite"
    >
      {task.label} ({task.completed}/{task.total})
    </p>
  );
};
