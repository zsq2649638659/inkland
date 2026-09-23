"use client";

import Link from "next/link";
import { useState } from "react";
import SiteIcon from "@/components/SiteIcon";
import LikeButton from "@/components/LikeButton";
import { getThumbnailUrl } from "@/lib/image";
import type { ReadingHistoryPostSnapshot, ReadingHistoryRecord } from "@/lib/readingHistory";

type CardMode = "pc" | "mobile";

function plainText(content?: string | null) {
  return (content || "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[*_~`#>|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function imagesFor(post: ReadingHistoryPostSnapshot) {
  const content = post.content || "";
  const fromContent = [...content.matchAll(/!\[.*?\]\((.*?)\)/g)]
    .map((match) => match[1])
    .filter((url) => Boolean(url) && !url.startsWith("private://"));
  const cover = post.cover_url && !post.cover_url.startsWith("private://") ? post.cover_url : null;
  return cover && !fromContent.includes(cover) ? [cover, ...fromContent] : fromContent;
}

function formatLastRead(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近阅读";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function positionLabel(record: ReadingHistoryRecord) {
  if (record.position_label) return record.position_label;
  if (record.post?.post_type === "serial" && (record.chapter_number || record.post.chapter_number)) {
    return `第${record.chapter_number || record.post.chapter_number}章`;
  }
  return `已读 ${Math.round(record.progress_ratio * 100)}%`;
}

function tagsFor(post: ReadingHistoryPostSnapshot, kind: "single" | "image" | "serial") {
  const tags = (kind === "serial" && post.series_tags?.length ? post.series_tags : post.tags)?.filter(Boolean) || [];
  if (tags.length) return tags;
  return [kind === "image" ? "图片作品" : kind === "serial" ? "长篇连载" : "单篇作品"];
}

function tagLinks(tags: string[], mobile = false) {
  return (
    <div className={`site-card__tags${mobile ? " site-card__search-mobile-tags" : ""}`} aria-label="作品标签">
      {tags.map((tag) => (
        <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`} className="tag tag--site site-card__tag">
          {tag}
        </Link>
      ))}
    </div>
  );
}

function searchMeta(record: ReadingHistoryRecord, mode: CardMode) {
  const author = record.post?.author;
  const nickname = author?.nickname?.trim() || "Inkland 作者";
  const likeCount = record.post?.like_count || 0;
  const avatarChar = Array.from(nickname)[0] || "?";
  return (
    <div className={`site-card__search-meta${mode === "mobile" ? " site-card__search-meta--mobile" : ""}`}>
      <Link className="site-card__avatar-link" href={record.post?.user_id ? `/user/${record.post.user_id}` : "#"} aria-label={`查看${nickname}的作者主页`}>
        <span className="site-card__avatar" aria-hidden="true">
          <span>{avatarChar}</span>
        </span>
      </Link>
      <LikeButton
        postId={record.post?.id || record.post_id}
        initialCount={likeCount}
        initialActive={record.post?.liked_by_me}
        optimistic
        className="site-card__action site-card__search-like"
      />
    </div>
  );
}

function renderImage(
  record: ReadingHistoryRecord,
  mode: CardMode,
  title: string,
  excerpt: string,
  image: string | undefined,
  imageCount: number,
  imageFailed: boolean,
  onImageError: () => void,
) {
  const href = `/read/${record.post_id}`;
  const imageUrl = image && !imageFailed ? getThumbnailUrl(image, { width: 720, height: mode === "mobile" ? 720 : 480, resize: "cover" }) : null;
  if (mode === "mobile") {
    return (
      <div className="site-card__search-mobile-core">
        <Link href={href} className="profile-square__image">
          {imageUrl ? <img src={imageUrl} alt="" loading="lazy" onError={onImageError} /> : <SiteIcon name="fa-image" variant="default" aria-hidden="true" />}
          <span className="site-card__history-image-title">{title}</span>
        </Link>
      </div>
    );
  }
  return (
    <div className="site-card__feed-images-shell">
      <div className="site-card__feed-images">
        <Link href={href} className="site-card__feed-image site-card__feed-image-link" aria-label={`查看图片作品：${title}`}>
          {imageUrl ? <img src={imageUrl} alt="" loading="lazy" onError={onImageError} /> : <SiteIcon name="fa-image" variant="default" aria-hidden="true" />}
          <span className="site-card__feed-image-overlay">
            <strong className="site-card__title">{title}</strong>
            {excerpt && <span className="site-card__excerpt">{excerpt}</span>}
          </span>
        </Link>
      </div>
      {imageCount > 1 && <span className="site-card__feed-image-count" aria-hidden="true"><SiteIcon name="fa-image" variant="default" aria-hidden="true" /><span>{imageCount}</span></span>}
    </div>
  );
}

export default function HistoryWorkCard({ record, mode }: { record: ReadingHistoryRecord; mode: CardMode }) {
  const [imageFailed, setImageFailed] = useState(false);
  const post = record.post;
  const title = post?.title?.trim() || "已删除或暂不可见的作品";
  const excerpt = plainText(post?.content);
  const serialExcerpt = plainText(post?.series_description) || excerpt;
  const isSerial = post?.post_type === "serial";
  const isImage = Boolean(post && (post.post_type === "illustration" || post.post_type === "comic" || post.post_type === "cosplay" || post.post_type === "art" || post.cover_url || imagesFor(post).length));
  const kind = isSerial ? "serial" : isImage ? "image" : "single";
  const images = post ? imagesFor(post) : [];
  const chapterNumber = record.chapter_number || post?.chapter_number;
  const latestTitle = chapterNumber
    ? new RegExp(`^第\\s*${chapterNumber}\\s*章`).test(title)
      ? title
      : `第${chapterNumber}章 ${title}`
    : "章节待发布，敬请期待";
  const seriesHref = post?.series_name ? `/series/${encodeURIComponent(post.series_name)}` : `/read/${record.post_id}`;
  const seriesCompleted = post?.series_status === "completed";

  const body = isImage
    ? renderImage(record, mode, title, excerpt, images[0], images.length, imageFailed, () => setImageFailed(true))
    : isSerial
      ? mode === "mobile" ? (
        <div className="site-card__search-mobile-core">
          <div className="site-card__serial-heading site-card__serial-heading--profile">
            <Link href={seriesHref} className="site-card__title-link"><h3 className="site-card__title">{post?.series_name || title}</h3></Link>
            <span className={`tag tag--status ${seriesCompleted ? "tag--status-complete" : "tag--status-active"} site-card__status`}>{seriesCompleted ? "已完结" : "连载中"}</span>
          </div>
          <p className="site-card__excerpt site-card__serial-intro">{serialExcerpt || "暂无简介"}</p>
          <Link href={`/read/${record.post_id}`} className="tag tag--type tag--type-link site-card__latest-chapter" aria-label={`打开${title}的${latestTitle}`}>
            <SiteIcon name="fa-long-serial" variant="default" aria-hidden="true" />
            <span className="site-card__latest-chapter-title">{latestTitle}</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="site-card__serial-heading site-card__serial-heading--profile">
            <Link href={seriesHref} className="site-card__title-link"><h3 className="site-card__title">{post?.series_name || title}</h3></Link>
            <span className={`tag tag--status ${seriesCompleted ? "tag--status-complete" : "tag--status-active"} site-card__status`}>{seriesCompleted ? "已完结" : "连载中"}</span>
          </div>
          <p className="site-card__excerpt site-card__serial-intro">{serialExcerpt || "暂无简介"}</p>
          <Link href={`/read/${record.post_id}`} className="tag tag--type tag--type-link site-card__latest-chapter" aria-label={`打开${title}的${latestTitle}`}>
            <SiteIcon name="fa-long-serial" variant="default" aria-hidden="true" />
            <span className="site-card__latest-chapter-title">{latestTitle}</span>
          </Link>
        </>
      )
      : mode === "mobile" ? (
        <div className="site-card__search-mobile-core">
          <Link href={`/read/${record.post_id}`} className="site-card__title-link"><h3 className="site-card__title">{title}</h3></Link>
          <p className="site-card__excerpt">{excerpt || "暂无正文摘要"}</p>
        </div>
      ) : (
        <>
          <Link href={`/read/${record.post_id}`} className="site-card__title-link"><h3 className="site-card__title">{title}</h3></Link>
          <p className="site-card__excerpt">{excerpt || "暂无正文摘要"}</p>
        </>
      );

  return (
    <article
      className={mode === "mobile"
        ? "site-card site-card--profile-square site-card--search-mobile-square"
        : `site-card site-card--feed site-card--feed-${kind} site-card--history-search-${kind}`}
      data-search-work-mobile-type={mode === "mobile" ? (kind === "serial" ? "series" : kind) : undefined}
      data-card-type={kind}
      aria-label={`阅读历史${kind === "serial" ? "长篇连载" : kind === "image" ? "图片" : "单篇"}作品卡片`}
    >
      {body}
      {tagLinks(tagsFor(post || { id: record.post_id }, kind), mode === "mobile")}
      <div className="site-card__history-info" role="group" aria-label="阅读进度和最近阅读时间">
        <span>{positionLabel(record)}</span>
        <time dateTime={record.last_read_at}>{formatLastRead(record.last_read_at)}</time>
      </div>
      {post ? searchMeta(record, mode) : <span className="site-card__search-unavailable">记录暂不可用</span>}
    </article>
  );
}
