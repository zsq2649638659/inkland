import Link from "next/link";
import SiteIcon from "@/components/SiteIcon";
import { getThumbnailUrl } from "@/lib/image";
import type { Post } from "@/lib/types";

function plainText(content?: string | null) {
  return (content || "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[*_~`#>|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function imagesFor(post: Post) {
  const contentImages = [...(post.content || "").matchAll(/!\[.*?\]\((.*?)\)/g)]
    .map((match) => match[1])
    .filter((url) => Boolean(url) && !url.startsWith("private://"));
  const cover = post.cover_url && !post.cover_url.startsWith("private://") ? post.cover_url : null;
  return cover && !contentImages.includes(cover) ? [cover, ...contentImages] : contentImages;
}

function interactionStats(post: Post) {
  return (
    <div className="site-card__tag-interactions" role="group" aria-label="作品互动数据">
      <span className="site-card__action" role="img" aria-label={`喜欢 ${post.like_count || 0}`}><SiteIcon name="fa-heart" variant="outline" hoverVariant="solid" aria-hidden="true" />{post.like_count || 0}</span>
    </div>
  );
}

function authorMeta(post: Post) {
  const nickname = post.author?.nickname?.trim() || "Inkland 作者";
  const avatarChar = Array.from(nickname)[0] || "?";
  return (
    <div className="site-card__search-meta">
      {interactionStats(post)}
      <Link className="site-card__avatar-link" href={post.user_id ? `/user/${post.user_id}` : "#"} aria-label={`查看${nickname}的作者主页`}>
        <span className="site-card__avatar" aria-hidden="true">
          {post.author?.avatar_url ? <img src={post.author.avatar_url} alt="" /> : <span>{avatarChar}</span>}
        </span>
      </Link>
    </div>
  );
}

export default function TagHistoryCard({ post }: { post: Post }) {
  const title = post.title?.trim() || "无标题";
  const excerpt = plainText(post.content) || "暂无正文摘要";
  const isSerial = post.post_type === "serial";
  const images = imagesFor(post);
  const isImage = !isSerial && Boolean(images.length || post.post_type === "illustration" || post.post_type === "comic" || post.post_type === "cosplay");
  const kind = isSerial ? "serial" : isImage ? "image" : "single";
  const readHref = `/read/${post.id}`;
  const seriesHref = post.series_name ? `/series/${encodeURIComponent(post.series_name)}` : readHref;
  const seriesTitle = post.series_name || title;
  const latestTitle = post.chapter_number ? `第${post.chapter_number}章 ${title}` : "章节待发布，敬请期待";

  return (
    <article className={`site-card site-card--feed site-card--feed-${kind} site-card--tag-history-${kind}`} data-card-type={kind} aria-label={`标签详情${isSerial ? "长篇连载" : isImage ? "图片" : "单篇"}作品卡片`}>
      {isImage ? (
        <div className="site-card__feed-images-shell">
          <div className="site-card__feed-images">
            <Link href={readHref} className="site-card__feed-image site-card__feed-image-link" aria-label={`查看图片作品：${title}`}>
              {images[0] ? <img src={getThumbnailUrl(images[0], { width: 720, height: 480, resize: "cover" })} alt={title} loading="lazy" /> : <SiteIcon name="fa-image" variant="default" aria-hidden="true" />}
              <span className="site-card__feed-image-overlay">
                <strong className="site-card__title">{title}</strong>
                <span className="site-card__excerpt">{excerpt}</span>
              </span>
            </Link>
          </div>
          {images.length > 1 && <span className="site-card__feed-image-count" aria-hidden="true"><SiteIcon name="fa-images" variant="default" aria-hidden="true" /><span>{images.length}</span></span>}
        </div>
      ) : isSerial ? (
        <>
          <div className="site-card__serial-heading">
            <Link href={seriesHref} className="site-card__title-link"><h3 className="site-card__title">{seriesTitle}</h3></Link>
            <span className={`tag tag--status ${post.status === "published" ? "tag--status-active" : "tag--status-complete"} site-card__status`}>{post.status === "published" ? "连载中" : "已完结"}</span>
          </div>
          <p className="site-card__excerpt site-card__serial-intro">{excerpt}</p>
          <Link href={readHref} className="tag tag--type tag--type-link site-card__latest-chapter" aria-label={`打开${title}的${latestTitle}`}>
            <SiteIcon name="fa-long-serial" variant="default" aria-hidden="true" />
            <span className="site-card__latest-chapter-title">{latestTitle}</span>
          </Link>
        </>
      ) : (
        <>
          <Link href={readHref} className="site-card__title-link"><h3 className="site-card__title">{title}</h3></Link>
          <p className="site-card__excerpt">{excerpt}</p>
        </>
      )}
      {authorMeta(post)}
    </article>
  );
}
