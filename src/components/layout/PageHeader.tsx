import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { OverflowMenu, OverflowMenuItem } from "../ui/OverflowMenu";

export type { OverflowMenuItem };

interface PageHeaderProps {
  backLink: { to: string; label: string };
  title?: string;
  primaryAction?: React.ReactNode;
  overflowItems?: OverflowMenuItem[];
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  backLink,
  title,
  primaryAction,
  overflowItems,
  className,
}) => {
  const hasActions = Boolean(primaryAction) || Boolean(overflowItems?.length);

  return (
    <header className={twMerge("pc-page-header print:hidden", className)}>
      <div className="pc-page-header-leading">
        <Link to={backLink.to} className="pc-button pc-page-header-back">
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="pc-page-header-back-label">{backLink.label}</span>
        </Link>
        {title && <h1 className="pc-page-header-title">{title}</h1>}
      </div>
      {hasActions && (
        <div className="pc-page-header-actions">
          {primaryAction}
          {overflowItems && overflowItems.length > 0 && (
            <OverflowMenu items={overflowItems} ariaLabel="More page actions" />
          )}
        </div>
      )}
    </header>
  );
};
