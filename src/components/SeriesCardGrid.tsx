"use client";

import Link from "next/link";
import { getThumbnailUrl } from "@/lib/image";
import DefaultAvatar from "@/components/DefaultAvatar";

interface SeriesCardGridProps {
  series: {
    id: string;
    name: string;
    cover_url: string | null;
    description: string;
    series_type: string;
    tags: string[];
    status: string;
    created_at: string;
    latestChapterId: string | null;
    latestChapterNumber: number | null;
    latestChapterTitle: string | null;
    latestChapterCreatedAt: string | null;
    totalChapters: number;
    user_id?: string;
    author?: { nickname: string; avatar_url: string | null };
  };
  /** 是否展示作者信息 */
  showAuthor?: boolean;
}

export default function SeriesCardGrid({ series, showAuthor = false }: SeriesCardGridProps) {
  const author = series.author;
  const avatarUrl = author?.avatar_url;

  return (
    <div className="rounded-xl bg-card border border-rule overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col group aspect-square">
      {/* 封面区 */}
      <Link
        href={`/series/${encodeURIComponent(series.name)}`}
        className="block relative flex-1 min-h-0 overflow-hidden bg-rule no-underline"
      >
        {series.cover_url ? (
          <img
            src={getThumbnailUrl(series.cover_url, { width: 400, height: 400, resize: "cover" })}
            alt={series.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-rule/60 to-rule/20 p-4">
            <i className="fa-solid fa-book-open text-4xl text-muted/30 mb-2" />
            <span className="text-xs text-muted/50 line-clamp-3 text-center">{series.name}</span>
          </div>
        )}

        {/* 悬停遮罩 */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-start p-3">
          <h3 className="font-semibold text-sm text-white line-clamp-2 mb-1">{series.name}</h3>
          {series.description && (
            <p className="text-xs text-white/70 line-clamp-3">{series.description}</p>
          )}
        </div>

        {/* 类型角标 */}
        <div className="absolute bottom-2 right-2">
          <span className="inline-block px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-white text-[0.6rem]">
            {series.series_type === "fanfic" ? "同人" : "原创"}
          </span>
        </div>
      </Link>

      {/* 底部信息 */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* 作者信息 */}
        {showAuthor && author && (
          <div className="flex items-center gap-1.5">
            <Link href={series.user_id ? `/user/${series.user_id}` : "#"} className="flex-shrink-0">
              <span className="w-5 h-5 rounded-full overflow-hidden inline-flex hover:opacity-80 transition-opacity">
                {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <DefaultAvatar name={author.nickname || "?"} style={{ width:"100%", height:"100%" }} />}
              </span>
            </Link>
            <Link href={series.user_id ? `/user/${series.user_id}` : "#"} className="text-xs text-muted hover:text-accent no-underline truncate">
              {author.nickname || "匿名用户"}
            </Link>
          </div>
        )}

        {/* 标签 */}
        {series.tags && series.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {series.tags.map((tag) => (
              <Link
                key={tag}
                href={`/tag/${encodeURIComponent(tag)}`}
                className="inline-block px-1.5 py-0.5 text-[0.6rem] rounded-full bg-accent-light/40 text-accent/70 hover:bg-accent-light/60 no-underline"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {/* 热度数据 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-heart text-[0.6rem] text-red-400" />
              0
            </span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-comment text-[0.6rem]" />
              0
            </span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-bookmark text-[0.6rem]" />
              0
            </span>
          </div>
          <span className="text-[0.6rem] text-muted">
            {series.created_at ? new Date(series.created_at).toLocaleDateString("zh-CN") : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
