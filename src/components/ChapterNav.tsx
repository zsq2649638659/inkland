"use client";

import { type MouseEvent, useState } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SiteIcon from "@/components/SiteIcon";

const MOBILE_MEDIA_QUERY = "(max-width: 900px)";

interface ChapterNavItem {
  id: string;
  title: string;
}

interface ChapterNavProps {
  postType?: string;
  seriesName: string;
  seriesId?: string | null;
  previous: ChapterNavItem | null;
  next: ChapterNavItem | null;
}

export default function ChapterNav({ postType, seriesName, seriesId, previous, next }: ChapterNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleNavigation = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (typeof window === "undefined" || !window.matchMedia(MOBILE_MEDIA_QUERY).matches) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (pendingHref) return;
    setProgress(8);
    setPendingHref(href);
    window.requestAnimationFrame(() => router.push(href));
  };

  useEffect(() => {
    if (!pendingHref || pathname === pendingHref) return;

    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(88, current + Math.max(1, Math.round((88 - current) * 0.12))));
    }, 80);

    return () => window.clearInterval(timer);
  }, [pendingHref, pathname]);

  useEffect(() => {
    if (!pendingHref || pathname !== pendingHref) return;

    const timer = window.setTimeout(() => {
      setPendingHref(null);
      setProgress(0);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [pendingHref, pathname]);

  const collectionHref = `/${postType === "serial" ? "series" : "collection"}/${encodeURIComponent(seriesId || seriesName)}`;
  const isLoading = Boolean(pendingHref);
  const visibleProgress = pendingHref && pathname === pendingHref ? 100 : progress;

  return (
    <div className={`chapter-nav${isLoading ? " is-loading" : ""}`} aria-busy={isLoading}>
      {isLoading && (
        <div
          className="chapter-nav-progress"
          role="progressbar"
          aria-label="正在加载下一篇"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={visibleProgress}
        >
          <span
            key={pendingHref}
            className="chapter-nav-progress-fill"
            style={{ width: `${visibleProgress}%` }}
          />
        </div>
      )}

      {previous ? (
        <Link
          href={`/read/${previous.id}`}
          className="chapter-nav-btn prev"
          aria-disabled={isLoading}
          onClick={(event) => handleNavigation(event, `/read/${previous.id}`)}
        >
          <span className="chapter-nav-label"><SiteIcon name="fa-chevron-left" variant="solid" /> 上一篇</span>
        </Link>
      ) : (
        <span className="chapter-nav-btn prev disabled" aria-disabled="true" title="已经是第一篇">
          <span className="chapter-nav-label"><SiteIcon name="fa-chevron-left" variant="solid" /> 上一篇</span>
        </span>
      )}

      <Link href={collectionHref} className="chapter-nav-btn back">
        <span className="chapter-nav-label">{postType === "serial" ? "目录" : "返回合集"}</span>
      </Link>

      {next ? (
        <Link
          href={`/read/${next.id}`}
          className="chapter-nav-btn next"
          aria-disabled={isLoading}
          onClick={(event) => handleNavigation(event, `/read/${next.id}`)}
        >
          <span className="chapter-nav-label">下一篇 <SiteIcon name="fa-chevron-right" variant="solid" /></span>
        </Link>
      ) : (
        <span className="chapter-nav-btn next disabled" aria-disabled="true" title="已经是最后一篇">
          <span className="chapter-nav-label">下一篇 <SiteIcon name="fa-chevron-right" variant="solid" /></span>
        </span>
      )}
    </div>
  );
}
