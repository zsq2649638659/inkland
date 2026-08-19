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
  // Compact mode: used for comments etc.
  if (compact) {
    return (
      <div className="text-center py-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rule mb-5">
          <i className={`fa-solid ${icon} text-2xl text-muted/40`} />
        </div>
        <p className="text-sm text-muted mb-1">{title}</p>
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
      </div>
    );
  }

  // Full mode: animated ring pattern matching home-empty.html
  return (
    <div className="feed-empty-state">
      <div className="feed-empty-illustration">
        <div className="feed-empty-tag-ring">
          <div className="feed-empty-ring-outer"></div>
          <div className="feed-empty-ring-inner">
            <i className={`fa-solid ${icon}`}></i>
          </div>
        </div>
      </div>
      <h2 className="feed-empty-title">{title}</h2>
      {description && <p className="feed-empty-desc">{description}</p>}
      {actionLabel && (
        actionHref ? (
          <Link href={actionHref} className="feed-empty-action">
            {actionLabel}
          </Link>
        ) : actionOnClick ? (
          <button onClick={actionOnClick} className="feed-empty-action">
            {actionLabel}
          </button>
        ) : null
      )}
    </div>
  );
}