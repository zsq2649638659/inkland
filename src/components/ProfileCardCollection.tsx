"use client";

import { useMemo, useState } from "react";
import type { Post } from "@/lib/types";
import ProfileWorkCard, { type ProfileCardMode, type ProfileSeriesCard } from "@/components/ProfileWorkCard";

type FilterType = "all" | "single" | "image" | "series";
type StatusFilter = "all" | "published" | "draft" | "rejected";
type SortMode = "latest" | "created" | "hot";

type Item =
  | { kind: "post"; post: Post; time: number; createdTime: number; score: number }
  | { kind: "series"; series: ProfileSeriesCard; time: number; createdTime: number; score: number };

function isImage(post: Post): boolean {
  const raw = post as unknown as Record<string, unknown>;
  return Boolean(raw.cover_url) || /!\[.*?\]\(.*?\)/.test((raw.content as string) || "");
}

function matchesStatus(item: Item, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (item.kind === "series") return status === "published";
  const raw = item.post as unknown as Record<string, unknown>;
  if (status === "draft") return raw.status === "draft";
  if (status === "rejected") return raw.review_status === "rejected" || raw.status === "rejected";
  return raw.status === "published" || !raw.status;
}

export default function ProfileCardCollection({
  posts,
  series,
  filter,
  query,
  status,
  sort,
  limit = 12,
}: {
  posts: Post[];
  series: ProfileSeriesCard[];
  filter: FilterType;
  query: string;
  status: StatusFilter;
  sort: SortMode;
  limit?: number;
}) {
  const [mobileLayout, setMobileLayout] = useState<"full" | "square">("full");
  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const postItems: Item[] = posts
      .filter((post) => filter === "all" || (filter === "image" ? isImage(post) : filter === "single" ? !isImage(post) : false))
      .filter((post) => matchesStatus({ kind: "post", post, time: 0, createdTime: 0, score: 0 }, status))
      .filter((post) => {
        if (!normalized) return true;
        return `${post.title || ""} ${post.content || ""}`.toLocaleLowerCase().includes(normalized);
      })
      .map((post) => ({
        kind: "post" as const,
        post,
        time: new Date(post.published_at || post.created_at || "").getTime(),
        createdTime: new Date(post.created_at || "").getTime(),
        score: (post.like_count || 0) + (post.comment_count || 0) * 2 + (post.bookmark_count || 0),
      }));
    const seriesItems: Item[] = series
      .filter(() => filter === "all" || filter === "series")
      .filter((item) => matchesStatus({ kind: "series", series: item, time: 0, createdTime: 0, score: 0 }, status))
      .filter((item) => !normalized || `${item.name} ${item.description} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(normalized))
      .map((item) => ({
        kind: "series" as const,
        series: item,
        time: new Date(item.interaction_at || item.created_at || "").getTime(),
        createdTime: new Date(item.created_at || "").getTime(),
        score: (item.like_count || 0) + (item.comment_count || 0) * 2 + (item.bookmark_count || 0),
      }));
    return [...postItems, ...seriesItems]
      .sort((a, b) => sort === "hot" ? b.score - a.score || b.time - a.time : sort === "created" ? b.createdTime - a.createdTime : b.time - a.time)
      .slice(0, limit);
  }, [filter, posts, query, series, status, sort, limit]);

  if (!items.length) {
    return (
      <div className="empty-state profile-filter-empty">
        <h2 className="empty-title">没有符合条件的作品</h2>
        <p className="empty-desc">换一个搜索词或筛选条件再试试。</p>
      </div>
    );
  }

  const renderCards = (mode: ProfileCardMode) => (
    <div className="card-device__cards">
      {items.map((item) => item.kind === "series"
        ? <ProfileWorkCard key={`series-${item.series.id}`} series={item.series} mode={mode} />
        : <ProfileWorkCard key={`post-${item.post.id}`} post={item.post} mode={mode} />)}
    </div>
  );

  return (
    <>
      <div className="profile-card-device profile-card-device--pc card-device-grid" data-card-variant="profile-types">
        <div className="card-device-frame card-device card-device--pc">{renderCards("pc")}</div>
      </div>
      <div className="profile-mobile-layout-switcher">
        <button type="button" className="profile-mobile-layout-placeholder" onClick={() => setMobileLayout((current) => current === "full" ? "square" : "full")} aria-label="切换移动端卡片排列" aria-pressed={mobileLayout === "square"}>
          {mobileLayout === "full" ? "一行一个" : "一行三个"}
        </button>
      </div>
      <div className={`profile-card-device profile-card-device--mobile-full card-device-grid${mobileLayout === "full" ? " is-active" : ""}`} data-card-variant="profile-mobile-full">
        <div className="card-device-frame card-device card-device--mobile">{renderCards("mobile-full")}</div>
      </div>
      <div className={`profile-card-device profile-card-device--mobile-square card-device-grid${mobileLayout === "square" ? " is-active" : ""}`} data-card-variant="profile-mobile-square">
        <div className="card-device-frame card-device card-device--profile-square">{renderCards("mobile-square")}</div>
      </div>
    </>
  );
}
