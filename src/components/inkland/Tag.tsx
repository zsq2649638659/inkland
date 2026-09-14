"use client";

import type { MouseEvent, ReactNode } from "react";
import { InklandIcon } from "./iconRegistry";

export type InklandTagVariant = "site" | "outline" | "status-active" | "status-complete";

export interface InklandTagProps {
  children: ReactNode;
  variant?: InklandTagVariant;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  removeLabel?: string;
  disabled?: boolean;
  className?: string;
}

export default function Tag({
  children,
  variant = "site",
  removable = false,
  onRemove,
  onClick,
  removeLabel,
  disabled = false,
  className,
}: InklandTagProps) {
  const classes = [
    "ink-tag",
    `ink-tag--${variant}`,
    removable ? "ink-tag--removable" : "",
    onClick && !removable ? "ink-tag--selectable" : "",
    className || "",
  ].filter(Boolean).join(" ");
  if (!removable && onClick) {
    return <button type="button" className={classes} onClick={onClick} disabled={disabled}>{children}</button>;
  }
  if (!removable) return <span className={classes}>{children}</span>;
  const handleRemovableClick = (event: MouseEvent<HTMLSpanElement>) => {
    if (!onRemove || disabled) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    onRemove();
  };
  return (
    <span className={classes} onClick={handleRemovableClick}>
      <span className="ink-tag__label">{children}</span>
      <button
        type="button"
        className="ink-tag__remove"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel || "移除标签"}
      >
        <InklandIcon name="fa-tag-remove" size={10} aria-hidden="true" />
      </button>
    </span>
  );
}
