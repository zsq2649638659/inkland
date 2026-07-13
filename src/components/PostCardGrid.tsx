"use client";

import Link from "next/link";
import type { Post } from "@/lib/types";

interface PostCardGridProps {
  post: Post;
  /** 是否展示作者信息，默认 true。个人主页场景设为 false 展示热度数据 */
  showAuthor?: boolean;
}

function getTextPreview(content?: string, maxLen = 100): string {
  if (!content) return "";
  const plain = content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[#*`~>_\-|]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + "..." : plain;
}

function getFirstImage(content?: string): string | null {
  if (!content) return null;
  const match = content.match(/!\[.*?\]\((.*?)\)/);
  return match ? match[1] : null;
}

function getAllImages(content?: string): string[] {
  if (!content) return [];
  const matches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
  return [...matches].map((m) => m[1]);
}

export default function PostCardGrid({ post, showAuthor = true }: PostCardGridProps) {
  const firstImage = (post as unknown as Record<string, unknown>).cover_url as string || getFirstImage(post.content);
  const hasImage = !!firstImage;
  const contentImages = getAllImages(post.content);
  const allImages = [firstImage, ...contentImages.filter((img) => img !== firstImage)].filter(Boolean);
  const imageCount = allImages.length;
  const textPreview = getTextPreview(post.content);
  const author = post.author;
  const avatarChar = author?.nickname?.[0] || author?.username?.[0] || "?";

  const seriesLabel = (post as unknown as Record<string, unknown>).series_name && (post as unknown as Record<string, unknown>).chapter_number ? (
    <span className="text-[0.6rem] text-accent/80 mr-1">
      [{(post as unknown as Record<string, unknown>).series_name as string}·第{(post as unknown as Record<string, unknown>).chapter_number as number}章]
    </span>
  ) : null;

  return (
    <div className="rounded-xl bg-white border border-rule overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col group aspect-square">
      {hasImage ? (
        <Link href={`/read/${post.id}`} className="block relative flex-1 min-h-0 overflow-hidden bg-accent-light no-underline">
          <img
            src={firstImage}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          {/* 悬停遮罩层 */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-start p-3">
            <h3 className="font-semibold text-sm text-white line-clamp-2 mb-1">
              {seriesLabel}
              {post.title || "无标题"}
            </h3>
            {textPreview && (
              <p className="text-xs text-white/70 line-clamp-3">{textPreview}</p>
            )}
          </div>
          {/* 图片数量角标 */}
          {imageCount > 1 && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded-full px-2 py-0.5">
              <i className="fa-solid fa-images text-[0.6rem] text-white/80" />
              <span className="text-[0.6rem] text-white/80">{imageCount}</span>
            </div>
          )}
        </Link>
      ) : (
        <Link href={`/read/${post.id}`} className="block flex-1 min-h-0 p-4 bg-gradient-to-br from-accent-light/40 to-accent-light/10 no-underline flex flex-col justify-start overflow-hidden">
          <h3 className="font-semibold text-sm text-warm mb-2 line-clamp-2">
            {seriesLabel}
            {post.title || "无标题"}
          </h3>
          {textPreview && (
            <p className="text-xs text-muted overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: "unset", WebkitBoxOrient: "vertical" }}>{textPreview}</p>
          )}
        </Link>
      )}

      {/* 底部信息栏 */}
      <div className="px-3 py-2 flex flex-col gap-1">
        {/* 第一行：头像+昵称 */}
        {showAuthor && (
          <div className="flex items-center gap-1.5 min-w-0">
            <Link href={`/user/${post.user_id}`}>
              <img
                src={author?.avatar_url || `https://placehold.co/20x20/f5e6d3/b8752e?text=${encodeURIComponent(avatarChar)}`}
                className="w-5 h-5 rounded-full object-cover flex-shrink-0 hover:opacity-80 transition-opacity"
                alt=""
              />
            </Link>
            <Link href={`/user/${post.user_id}`} className="text-xs text-muted hover:text-accent no-underline truncate">
              {author?.nickname || author?.username || "匿名用户"}
            </Link>
          </div>
        )}

        {/* 标签行 */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag) => {
              const tagName = typeof tag === "string" ? tag : tag.name;
              return (
                <Link
                  key={tagName}
                  href={`/tag/${encodeURIComponent(tagName)}`}
                  className="inline-block px-1.5 py-0.5 text-[0.6rem] rounded-full bg-accent-light/40 text-accent/70 hover:bg-accent-light/60 no-underline"
                >
                  {tagName}
                </Link>
              );
            })}
          </div>
        )}

        {/* 互动数据行 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-heart text-[0.6rem] text-red-400" />
              {post.like_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-comment text-[0.6rem]" />
              {post.comment_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-bookmark text-[0.6rem]" />
              {post.bookmark_count || 0}
            </span>
          </div>
          {showAuthor ? (
            <span className="text-[0.6rem] text-muted flex-shrink-0">
              {post.created_at ? new Date(post.created_at).toLocaleDateString("zh-CN") : ""}
            </span>
          ) : (
            <span className="text-[0.6rem] text-muted">
              {post.created_at ? new Date(post.created_at).toLocaleDateString("zh-CN") : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}