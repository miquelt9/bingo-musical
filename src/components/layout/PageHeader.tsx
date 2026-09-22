import React from "react";
import { twMerge } from "tailwind-merge";
import { BackButton, type BackNavTarget } from "../ui/BackButton";
import { OverflowMenu, OverflowMenuItem } from "../ui/OverflowMenu";
import { MobileBackgroundTaskStatus, MobileSectionNav } from "./MobileNav";

export type { OverflowMenuItem };

interface PageHeaderProps {
  back: BackNavTarget;
  title?: string;
  primaryAction?: React.ReactNode;
  overflowItems?: OverflowMenuItem[];
  className?: string;
  titleClassName?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  back,
  title,
  primaryAction,
  overflowItems,
  className,
  titleClassName,
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
        {title && <h1 className={twMerge("pc-page-header-title", titleClassName)}>{title}</h1>}
        <MobileSectionNav />
      </div>
      {hasActions && (
        <div className="pc-page-header-actions">
          {primaryAction}
          {overflowItems && overflowItems.length > 0 && (
            <OverflowMenu items={overflowItems} ariaLabel="More page actions" />
          )}
        </div>
      )}
      <MobileBackgroundTaskStatus />
    </header>
  );
};
