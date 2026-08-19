"use client";

import { useRef, useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Post } from "@/lib/types";
import { getThumbnailUrl } from "@/lib/image";
import ImageLightbox from "@/components/ImageLightbox";
import DefaultAvatar from "@/components/DefaultAvatar";

interface PostTagCardProps {
  post: Post;
  style?: CSSProperties;
  showAuthorAvatar?: boolean;
  imageTagsInOverlay?: boolean;
}

function getPlainText(content?: string): string {
  if (!content) return "";
  return content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[*_~`#>|-]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAllImages(content?: string): string[] {
  if (!content) return [];
  const matches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
  return [...matches].map((m) => m[1]).filter((url) => !url.startsWith("private://"));
}

export default function PostTagCard({ post, style, showAuthorAvatar, imageTagsInOverlay = false }: PostTagCardProps) {
  const router = useRouter();
  const cp = post as unknown as Record<string, unknown>;
  const content = (cp.content as string) || "";
  const contentImages = getAllImages(content);
  const rawCoverUrl = cp.cover_url as string | undefined;
  const coverUrl = rawCoverUrl && !rawCoverUrl.startsWith("private://") ? rawCoverUrl : undefined;
  const allImages = coverUrl && !contentImages.includes(coverUrl)
    ? [coverUrl, ...contentImages]
    : contentImages;
  const hasImage = allImages.length > 0;
  const plainText = getPlainText(content);
  const tags = (post.tags || []) as Array<string | { name: string }>;

  // 图片卡片使用单图 Stage 展示，多图通过箭头和 Markers 切换
  const [activeImage, setActiveImage] = useState(0);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [isTagsOverflow, setIsTagsOverflow] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Overflow detection for tags horizontal scroll
  useEffect(() => {
    const el = tagsRef.current;
    if (!el) return;
    const check = () => {
      const overflow = el.scrollWidth > el.clientWidth + 1;
      setIsTagsOverflow(overflow);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tags]);

  // 系列上下文
  const seriesName = cp.series_name as string | null;
  const chapterNumber = cp.chapter_number as number | null | undefined;
  const seriesContext = seriesName ? (chapterNumber ? `${seriesName} · 第${chapterNumber}章` : seriesName) : null;
  const rawImageTitle = post.title?.trim() || "";
  const imageTitle = ["图片分享", "Image Title"].includes(rawImageTitle) ? "" : rawImageTitle;
  const hasImageCopy = Boolean(imageTitle || plainText || (imageTagsInOverlay && tags.length > 0));
  const isRejected = cp.review_status === "rejected";
  const targetHref = isRejected ? `/create?editPost=${post.id}` : `/read/${post.id}`;
  const navigateCard = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("a, button")) return;
    if (!target.closest(".card-title, .card-summary")) return;
    router.push(targetHref);
  };

  const authorAvatar = showAuthorAvatar && post.author ? (
    <div className="card-author">
      <div className="card-author-avatar">
        {post.author.avatar_url ? (
          <img src={post.author.avatar_url} alt={post.author.nickname} />
        ) : (
          <DefaultAvatar name={post.author.nickname || "?"} />
        )}
      </div>
    </div>
  ) : null;

  if (hasImage) {
    const hasMultipleImages = allImages.length > 1;
    return (
      <div className={`tag-card image${isRejected ? " review-rejected" : ""}`} data-type="image" style={style} onClick={navigateCard} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") router.push(targetHref); }}>
        {seriesContext && (
          <Link href={`/${post.post_type === "serial" ? "series" : "collection"}/${encodeURIComponent(seriesName || "")}`} className="card-series-badge">
            <i className="fa-solid fa-layer-group"></i> {seriesContext}
          </Link>
        )}
        <div className="card-image-stage">
          {isRejected && <Link href={targetHref} className="profile-review-badge"><i className="fa-solid fa-circle-exclamation" /> 需修改</Link>}
          <button type="button" className="card-image-link" onClick={() => setLightboxOpen(true)} aria-label={`查看${allImages.length}张图片`}>
            <div className="card-image-placeholder">
              {allImages[activeImage] ? (
                <img
                  src={getThumbnailUrl(allImages[activeImage], { width: 400, height: 400, resize: "cover" })}
                  alt=""
                  loading="lazy"
                  onLoad={(event) => event.currentTarget.classList.add("loaded")}
                  onError={(event) => event.currentTarget.classList.add("load-error")}
                />
              ) : (
                <i className="fa-solid fa-image" />
              )}
            </div>
          </button>
          {hasImageCopy && (
            <div className="card-image-overlay">
              <Link href={targetHref} className="no-underline card-image-copy">
                {imageTitle && <div className="card-image-title">{imageTitle}</div>}
                {plainText && <div className="card-summary clamp-2">{plainText}</div>}
              </Link>
              {imageTagsInOverlay && tags.length > 0 && (
                <div className={`card-tags card-image-tags${isTagsOverflow ? " has-overflow" : ""}`} ref={tagsRef}>
                  {tags.map((tag) => {
                    const tagName = typeof tag === "string" ? tag : tag.name;
                    return <Link key={tagName} href={`/tag/${encodeURIComponent(tagName)}`} className="card-tag">{tagName}</Link>;
                  })}
                </div>
              )}
            </div>
          )}
          {hasMultipleImages && (
            <span className="card-image-count" aria-label={`共 ${allImages.length} 张图片`}>
              <i className="fa-regular fa-images" /> {allImages.length}
            </span>
          )}
          {hasMultipleImages && !imageTagsInOverlay && (
            <div className="card-image-dots" aria-label={`共 ${allImages.length} 张图片，当前第 ${activeImage + 1} 张`}>
              {allImages.map((_, idx) => (
                <span key={idx} className={idx === activeImage ? "active" : ""} />
              ))}
            </div>
          )}
          {hasMultipleImages && !imageTagsInOverlay && (
            <>
              <button
                type="button"
                className="card-image-arrow prev"
                aria-label="上一张图片"
                onClick={() => setActiveImage((current) => (current + allImages.length - 1) % allImages.length)}
              >
                <i className="fa-solid fa-chevron-left" />
              </button>
              <button
                type="button"
                className="card-image-arrow next"
                aria-label="下一张图片"
                onClick={() => setActiveImage((current) => (current + 1) % allImages.length)}
              >
                <i className="fa-solid fa-chevron-right" />
              </button>
            </>
          )}
        </div>
        {!imageTagsInOverlay && tags.length > 0 && (
          <div className={`card-tags${isTagsOverflow ? " has-overflow" : ""}`} ref={tagsRef}>
            {tags.map((tag) => {
              const tagName = typeof tag === "string" ? tag : tag.name;
              return (
                <Link key={tagName} href={`/tag/${encodeURIComponent(tagName)}`} className="card-tag">
                  {tagName}
                </Link>
              );
            })}
          </div>
        )}
        <div className="card-footer">
          <div className="card-stats">
            <span className="card-stat"><i className="fa-regular fa-heart" /> {post.like_count || 0}</span>
            <span className="card-stat"><i className="fa-regular fa-comment" /> {post.comment_count || 0}</span>
            <span className="card-stat"><i className="fa-regular fa-bookmark" /> {post.bookmark_count || 0}</span>
          </div>
          {authorAvatar}
        </div>
        {lightboxOpen && <ImageLightbox post={post} images={allImages} initialIndex={activeImage} onClose={() => setLightboxOpen(false)} />}
      </div>
    );
  }

  return (
    <div className={`tag-card single${isRejected ? " review-rejected" : ""}`} data-type="single" style={style} onClick={navigateCard} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") router.push(targetHref); }}>
      {seriesContext && (
        <Link href={`/${post.post_type === "serial" ? "series" : "collection"}/${encodeURIComponent(seriesName || "")}`} className="card-series-badge">
          <i className="fa-solid fa-layer-group"></i> {seriesContext}
        </Link>
      )}
      {isRejected && <Link href={targetHref} className="profile-review-badge profile-review-badge--inline"><i className="fa-solid fa-circle-exclamation" /> 需修改</Link>}
      <Link href={targetHref} className="no-underline">
        <div className="card-title">{post.title || "无标题"}</div>
      </Link>
      <div className="card-summary clamp-2">{plainText}</div>
      {tags.length > 0 && (
        <div className={`card-tags${isTagsOverflow ? " has-overflow" : ""}`} ref={tagsRef}>
          {tags.map((tag) => {
            const tagName = typeof tag === "string" ? tag : tag.name;
            return (
              <Link key={tagName} href={`/tag/${encodeURIComponent(tagName)}`} className="card-tag">
                {tagName}
              </Link>
            );
          })}
        </div>
      )}
      <div className="card-footer">
        <div className="card-stats">
          <span className="card-stat"><i className="fa-regular fa-heart" /> {post.like_count || 0}</span>
          <span className="card-stat"><i className="fa-regular fa-comment" /> {post.comment_count || 0}</span>
          <span className="card-stat"><i className="fa-regular fa-bookmark" /> {post.bookmark_count || 0}</span>
        </div>
        {authorAvatar}
      </div>
    </div>
  );
}
