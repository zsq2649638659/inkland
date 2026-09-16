"use client";
import SiteIcon from "@/components/SiteIcon";

import Link from "next/link";
import DefaultAvatar from "@/components/DefaultAvatar";
import type { Post } from "@/lib/types";
import { getThumbnailUrl } from "@/lib/image";

interface PostCardGridProps {
  post: Post;
  /** 是否展示作者信息，默认 true。个人主页场景设为 false 展示热度数据 */
  showAuthor?: boolean;
}

function getTextPreview(content?: string): string {
  if (!content) return "";
  return content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[#*`~>_\-|]/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function getFirstImage(content?: string): string | null {
  if (!content) return null;
  const match = content.match(/!\[.*?\]\((.*?)\)/);
  return match && !match[1].startsWith("private://") ? match[1] : null;
}

function getAllImages(content?: string): string[] {
  if (!content) return [];
  const matches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
  return [...matches].map((m) => m[1]).filter((url) => !url.startsWith("private://"));
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
    <div className="rounded-[16px] bg-card border border-rule overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col group aspect-square">
      {hasImage ? (
        <Link href={`/read/${post.id}`} className="block relative flex-1 min-h-0 overflow-hidden bg-rule no-underline">
          <img
            src={getThumbnailUrl(firstImage, { width: 400, height: 400, resize: "cover" })}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={(event) => event.currentTarget.classList.add("load-error")}
            onLoad={(event) => event.currentTarget.classList.remove("load-error")}
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
              <SiteIcon name="fa-images" variant="solid" className="text-[0.6rem] text-white/80" />
              <span className="text-[0.6rem] text-white/80">{imageCount}</span>
            </div>
          )}
        </Link>
      ) : (
        <Link href={`/read/${post.id}`} className="block flex-1 min-h-0 p-4 bg-gradient-to-br from-rule/60 to-rule/20 no-underline flex flex-col justify-start overflow-hidden">
          <h3 className="font-semibold text-sm text-warm mb-2 line-clamp-2">
            {seriesLabel}
            {post.title || "无标题"}
          </h3>
          {textPreview && (
            <p className="text-xs text-muted line-clamp-4 min-w-0 break-words">{textPreview}</p>
          )}
        </Link>
      )}

      {/* 底部信息栏 */}
      <div className="px-3 py-2 flex flex-col gap-1">
        {/* 第一行：头像+昵称 */}
        {showAuthor && (
          <div className="flex items-center gap-1.5 min-w-0">
            <Link href={`/user/${post.user_id}`}>
              <span className="rounded-full overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity inline-flex" style={{ width: "var(--ink-avatar-size-sm)", height: "var(--ink-avatar-size-sm)" }}>
                {author?.avatar_url ? <img src={author.avatar_url} className="w-full h-full object-cover" alt="" /> : <DefaultAvatar name={avatarChar} style={{ width:"100%", height:"100%" }} />}
              </span>
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
                  className="tag tag--site site-card__tag"
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
              <SiteIcon name="fa-heart" variant="solid" className="text-[0.6rem] text-red-400" />
              {post.like_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <SiteIcon name="fa-comment" variant="solid" className="text-[0.6rem]" />
              {post.comment_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <SiteIcon name="fa-bookmark" variant="solid" className="text-[0.6rem]" />
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
