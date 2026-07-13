import Link from "next/link";

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  actionOnClick?: () => void;
  compact?: boolean;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  actionOnClick,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`text-center ${compact ? "py-3" : "py-16"}`}>
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rule mb-5">
        <i className={`fa-solid ${icon} text-2xl text-muted/40`} />
      </div>
      <p className={`${compact ? "text-sm" : "text-base"} text-muted mb-1`}>{title}</p>
      {description && (
        <p className="text-xs text-muted/60 mb-5">{description}</p>
      )}
      {actionLabel && (
        actionHref ? (
          <Link href={actionHref} className="btn-accent no-underline inline-flex items-center gap-1.5 text-sm">
            <i className="fa-solid fa-pen-to-square text-xs" />
            {actionLabel}
          </Link>
        ) : actionOnClick ? (
          <button onClick={actionOnClick} className="btn-accent inline-flex items-center gap-1.5 text-sm">
            <i className="fa-solid fa-pen-to-square text-xs" />
            {actionLabel}
          </button>
        ) : null
      )}
      {!actionLabel && !compact && <div className="h-5" />}
    </div>
  );
}