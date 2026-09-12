"use client";

import Link from "next/link";
import SiteIcon from "@/components/SiteIcon";
import { getThumbnailUrl } from "@/lib/image";
import type { Post } from "@/lib/types";

export interface ProfileSeriesCard {
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
  latestChapterContent: string | null;
  latestChapterCreatedAt: string | null;
  totalChapters: number;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
  interaction_at?: string;
}

export type ProfileCardMode = "pc" | "mobile-full" | "mobile-square";

function plainText(content?: string): string {
  return (content || "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[*_~`#>|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function imagesFor(post: Post): string[] {
  const raw = post as unknown as Record<string, unknown>;
  const content = (raw.content as string) || "";
  const fromContent = [...content.matchAll(/!\[.*?\]\((.*?)\)/g)]
    .map((match) => match[1])
    .filter((url) => Boolean(url) && !url.startsWith("private://"));
  const cover = typeof raw.cover_url === "string" && !raw.cover_url.startsWith("private://") ? raw.cover_url : null;
  return cover && !fromContent.includes(cover) ? [cover, ...fromContent] : fromContent;
}

function tagLinks(tags: string[], mode: ProfileCardMode) {
  if (!tags.length || mode === "mobile-square") return null;
  return (
    <div className="site-card__tags" aria-label="作品标签">
      {tags.map((tag) => (
        <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`} className="tag tag--site site-card__tag">
          {tag}
        </Link>
      ))}
    </div>
  );
}

function imageCard(post: Post, mode: ProfileCardMode) {
  const images = imagesFor(post);
  const image = images[0];
  const title = post.title?.trim() || "图片作品";
  const excerpt = plainText(post.content);
  const href = `/read/${post.id}`;
  return (
    <article className={`site-card site-card--feed site-card--feed-image site-card--profile-${mode}`} data-card-type="image">
      <div className="site-card__feed-images-shell">
        <div className="site-card__feed-images">
          <Link href={href} className="site-card__feed-image site-card__feed-image-link" aria-label={`查看图片作品：${title}`}>
            {image ? <img src={getThumbnailUrl(image, { width: 720, height: 480, resize: "cover" })} alt={title} loading="lazy" /> : <SiteIcon name="fa-image" variant="outline" aria-hidden="true" />}
            <span className="site-card__feed-image-overlay">
              <strong>{title}</strong>
              {excerpt && <span>{excerpt}</span>}
            </span>
          </Link>
        </div>
      </div>
      {tagLinks((post.tags || []).map((tag) => typeof tag === "string" ? tag : tag.name), mode)}
    </article>
  );
}

function singleCard(post: Post, mode: ProfileCardMode) {
  const href = `/read/${post.id}`;
  const title = post.title?.trim() || "无标题";
  const excerpt = plainText(post.content);
  return (
    <article className={`site-card site-card--feed site-card--feed-single site-card--profile-${mode}`} data-card-type="single">
      <Link href={href} className="site-card__title-link"><h3 className="site-card__title">{title}</h3></Link>
      {excerpt && <Link href={href} className="site-card__content-link"><p className="site-card__excerpt">{excerpt}</p></Link>}
      {tagLinks((post.tags || []).map((tag) => typeof tag === "string" ? tag : tag.name), mode)}
    </article>
  );
}

function serialCard(series: ProfileSeriesCard, mode: ProfileCardMode) {
  const seriesHref = `/series/${encodeURIComponent(series.name)}`;
  const chapterHref = series.latestChapterId ? `/read/${series.latestChapterId}` : seriesHref;
  const statusClass = series.status === "completed" ? "tag--status-complete" : "tag--status-active";
  const chapterTitle = !series.latestChapterId
    ? "章节待发布，敬请期待"
    : series.latestChapterNumber === null
    ? (series.latestChapterTitle || "最新章节")
    : `第${series.latestChapterNumber}章${series.latestChapterTitle ? ` ${series.latestChapterTitle}` : ""}`;
  return (
    <article className={`site-card site-card--feed site-card--feed-serial site-card--profile-${mode}`} data-card-type="serial">
      <div className="site-card__serial-heading site-card__serial-heading--profile">
        <Link href={seriesHref} className="site-card__title-link"><h3 className="site-card__title">{series.name}</h3></Link>
        <span className={`tag tag--status site-card__status ${statusClass}`}>{series.status === "completed" ? "已完结" : "连载中"}</span>
      </div>
      <Link href={seriesHref} className="site-card__content-link"><p className="site-card__excerpt site-card__serial-intro">{series.description || "暂无简介"}</p></Link>
      <Link href={chapterHref} className="tag tag--type tag--type-link site-card__latest-chapter" aria-label={`打开${series.name}的${chapterTitle}`}>
        <SiteIcon name="fa-long-serial" variant="outline" aria-hidden="true" />
        <strong>{chapterTitle}</strong>
      </Link>
      {tagLinks(series.tags || [], mode)}
    </article>
  );
}

export default function ProfileWorkCard({ post, series, mode = "pc" }: { post?: Post; series?: ProfileSeriesCard; mode?: ProfileCardMode }) {
  if (series) return serialCard(series, mode);
  if (!post) return null;
  return imagesFor(post).length > 0 ? imageCard(post, mode) : singleCard(post, mode);
}
