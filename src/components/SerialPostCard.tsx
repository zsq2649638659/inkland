"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";

export interface SerialPostCardData {
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  content: string;
  seriesName: string;
  seriesDescription: string;
  seriesCover: string | null;
  seriesTags: string[];
  seriesStatus: string;
  seriesType: string;
  authorId: string;
  authorNickname: string;
  authorAvatar: string | null;
  likeCount: number;
  commentCount: number;
  bookmarkCount: number;
  createdAt: string;
}

function stripMarkdown(content?: string, maxLen = 120): string {
  if (!content) return "";
  let text = content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[*_~`#>|-]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen) + "...";
  return text;
}

export default function SerialPostCard({ data }: { data: SerialPostCardData }) {
  const supabase = createClient();
  const { user } = useAuth();
  const router = useRouter();

  const plainExcerpt = useMemo(() => stripMarkdown(data.content), [data.content]);
  const avatarChar = data.authorNickname?.[0] || "?";
  const seriesCover = data.seriesCover;

  const goToLogin = () => router.push("/login");

  const handleShare = async () => {
    const url = `${window.location.origin}/read/${data.chapterId}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("链接已复制到剪贴板");
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      alert("链接已复制到剪贴板");
    }
  };

  return (
    <article className="card p-4">
      <div className="flex items-start gap-3">
        {/* 头像 */}
        <Link href={`/user/${data.authorId}`} className="flex-shrink-0">
          <img
            src={data.authorAvatar || `https://placehold.co/40x40/f5e6d3/b8752e?text=${encodeURIComponent(avatarChar)}`}
            className="w-10 h-10 rounded-full object-cover hover:opacity-80 transition-opacity"
            alt=""
          />
        </Link>

        <div className="flex-1 min-w-0">
          {/* 用户信息 */}
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/user/${data.authorId}`} className="font-medium text-sm text-warm no-underline hover:text-accent">
              {data.authorNickname || "匿名用户"}
            </Link>
            <span className="text-xs text-muted">
              {new Date(data.createdAt).toLocaleDateString("zh-CN")}
            </span>
          </div>

          {/* 章节标题 - 外卡片 */}
          <h2 className="mb-2">
            <Link
              href={`/read/${data.chapterId}`}
              className="text-base font-bold text-warm no-underline hover:text-accent leading-snug line-clamp-2"
            >
              第{data.chapterNumber}章 {data.chapterTitle || "无标题"}
            </Link>
          </h2>

          {/* 章节摘要 */}
          {plainExcerpt && (
            <p className="text-sm text-muted leading-relaxed line-clamp-3 mb-3">
              {plainExcerpt}
            </p>
          )}

          {/* 内卡片 - 连载信息 */}
          <Link
            href={`/series/${encodeURIComponent(data.seriesName)}`}
            className="block rounded-lg border border-rule bg-paper p-3 mb-3 no-underline hover:border-accent/40 transition-colors"
          >
            <div className="flex gap-3">
              {/* 连载封面 */}
              <div className="w-16 h-20 rounded-md overflow-hidden bg-accent-light flex-shrink-0">
                {seriesCover ? (
                  <img src={seriesCover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-light/60 to-accent-light/20">
                    <i className="fa-solid fa-book text-xl text-accent/30" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-warm truncate">{data.seriesName}</span>
                  <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    data.seriesStatus === "ongoing"
                      ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
                      : "bg-gray-50 dark:bg-gray-800 text-muted border border-gray-200 dark:border-gray-700"
                  }`}>
                    {data.seriesStatus === "ongoing" ? "连载中" : "已完结"}
                  </span>
                </div>

                {data.seriesTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {data.seriesTags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-[0.6rem] text-accent bg-accent-light/30 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                    {data.seriesTags.length > 4 && (
                      <span className="text-[0.6rem] text-muted">+{data.seriesTags.length - 4}</span>
                    )}
                  </div>
                )}

                {data.seriesDescription && (
                  <p className="text-xs text-muted line-clamp-1">{data.seriesDescription}</p>
                )}
              </div>
            </div>
          </Link>

          {/* 互动按钮 */}
          <div className="flex items-center gap-3 text-sm">
            <LikeButton postId={data.chapterId} initialCount={data.likeCount} onLogin={goToLogin} />
            <Link href={`/read/${data.chapterId}#comments`} className="interact-btn no-underline">
              <i className="fa-regular fa-comment mr-1" />{data.commentCount || 0}
            </Link>
            <BookmarkButton postId={data.chapterId} initialCount={data.bookmarkCount} onLogin={goToLogin} />
            <div className="ml-auto relative">
              <button className="interact-btn" onClick={handleShare}>
                <i className="fa-regular fa-share-from-square" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}