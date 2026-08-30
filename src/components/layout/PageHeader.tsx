import React from "react";
import { twMerge } from "tailwind-merge";
import { BackButton, type BackNavTarget } from "../ui/BackButton";
import { OverflowMenu, OverflowMenuItem } from "../ui/OverflowMenu";

export type { OverflowMenuItem };

interface PageHeaderProps {
  back: BackNavTarget;
  title?: string;
  primaryAction?: React.ReactNode;
  overflowItems?: OverflowMenuItem[];
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  back,
  title,
  primaryAction,
  overflowItems,
  className,
}) => {
  const hasActions = Boolean(primaryAction) || Boolean(overflowItems?.length);

  return (
    <header className={twMerge("pc-page-header print:hidden", className)}>
      <div className="pc-page-header-leading">
        <BackButton
          {...back}
          className="pc-page-header-back"
          labelClassName="pc-page-header-back-label"
        />
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
