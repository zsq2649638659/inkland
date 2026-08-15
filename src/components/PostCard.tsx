"use client";

import { useState, useMemo, useEffect, useRef, useCallback, type CSSProperties, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { getThumbnailUrl } from "@/lib/image";
import { createNotification } from "@/lib/notifications";
import { submitReportV1 } from "@/lib/reportContent";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
import InlineCommentPanel from "@/components/InlineCommentPanel";
import ModerationReasonModal from "@/components/ModerationReasonModal";
import CenteredToast from "@/components/CenteredToast";
import DefaultAvatar from "@/components/DefaultAvatar";
import ImageLightbox from "@/components/ImageLightbox";
import type { Post, Comment } from "@/lib/types";

interface PostCardProps {
  post: Post;
}

// 剥离 Markdown 语法，提取纯文本
function stripMarkdown(content?: string, maxLen = 300): string {
  if (!content) return "";
  let text = content
    .replace(/!\[.*?\]\(.*?\)/g, "")           // 移除图片
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")     // 链接保留文字
    .replace(/[*_~`#>|-]/g, "")                // 移除格式符号
    .replace(/\n+/g, " ")                      // 换行转空格
    .replace(/\s+/g, " ")                      // 合并空白
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen) + "...";
  return text;
}

// 从内容中提取所有图片 URL
function extractImages(content?: string): string[] {
  if (!content) return [];
  const matches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
  return [...matches].map((m) => m[1]).filter((url) => !url.startsWith("private://"));
}

function isPlaceholderTitle(title?: string) {
  return !title || ["无标题", "图片分享", "Image Title"].includes(title.trim());
}

export default function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [showComment, setShowComment] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [shareTip, setShareTip] = useState(false);
  const [activeImageDot, setActiveImageDot] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<number, number>>({});
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const [moderationModal, setModerationModal] = useState<
    | { mode: "report"; targetType: "post" | "comment"; targetId: string }
    | { mode: "block"; userId: string }
    | null
  >(null);
  const [moderationSubmitting, setModerationSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [resolvedContent, setResolvedContent] = useState(post.content || "");
  const [resolvedCover, setResolvedCover] = useState(post.cover_url || null);
  const imageScrollRef = useRef<HTMLDivElement>(null);
  const cardMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 2000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!cardMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!cardMenuRef.current?.contains(event.target as Node)) setCardMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [cardMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    const resolvePrivateImages = async () => {
      const marker = /private:\/\/private-post-images\/([A-Za-z0-9/_\-.]+)/g;
      const sourceContent = post.content || "";
      const sourceCover = post.cover_url || null;
      const matches = [...sourceContent.matchAll(marker)];
      const urls = new Map<string, string>();
      const paths = [...matches.map((match) => match[1]), ...(sourceCover?.match(/^private:\/\/private-post-images\/(.+)$/)?.slice(1) || [])];
      if (!user || paths.length === 0) {
        setResolvedContent(sourceContent);
        setResolvedCover(sourceCover);
        return;
      }
      await Promise.all(paths.map(async (path) => {
        const { data } = await supabase.storage.from("private-post-images").createSignedUrl(path, 3600);
        if (data?.signedUrl) urls.set(`private://private-post-images/${path}`, data.signedUrl);
      }));
      if (cancelled) return;
      setResolvedContent(sourceContent.replace(marker, (value) => urls.get(value) || value));
      setResolvedCover(sourceCover ? urls.get(sourceCover) || sourceCover : null);
    };
    void resolvePrivateImages();
    return () => { cancelled = true; };
  }, [post.content, post.cover_url, supabase, user]);

  const goToLogin = () => {
    router.push("/login");
  };

  const reportTarget = (targetType: "post" | "comment", targetId: string, commentUserId?: string) => {
    if (!user) { goToLogin(); return; }
    if (targetType === "comment" && commentUserId === user.id) return;
    setModerationModal({ mode: "report", targetType, targetId });
  };

  const blockUser = (blockedUserId: string) => {
    if (!user) { goToLogin(); return; }
    if (blockedUserId === user.id) return;
    setModerationModal({ mode: "block", userId: blockedUserId });
  };

  const submitModeration = async (reason: string) => {
    if (!moderationModal || !user || (moderationModal.mode === "report" && !reason.trim())) return;
    setModerationSubmitting(true);
    if (moderationModal.mode === "report") {
      const result = await submitReportV1(supabase, { targetType: moderationModal.targetType, targetId: moderationModal.targetId, reason });
      setModerationSubmitting(false);
      if (!result.ok) { setToastMessage(result.message); return; }
      setModerationModal(null);
      setToastMessage(result.message);
      return;
    }
    const { error } = await supabase.from("blocked_users").insert({ user_id: user.id, blocked_user_id: moderationModal.userId });
    setModerationSubmitting(false);
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      setToastMessage("屏蔽失败，请稍后重试。");
      return;
    }
    setModerationModal(null);
    setToastMessage("已屏蔽该用户。");
  };

  // Check follow status
  useEffect(() => {
    if (!user || user.id === post.user_id) return;
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", post.user_id)
      .single()
      .then(({ data }) => setFollowing(!!data));
  }, [user, post.user_id]);

  const toggleFollow = async () => {
    if (!user) { goToLogin(); return; }
    if (followLoading) return;
    setFollowLoading(true);
    if (following) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", post.user_id);
      if (!error) setFollowing(false);
    } else {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: post.user_id });
      if (!error) setFollowing(true);
    }
    setFollowLoading(false);
  };

  // 计算纯文本摘要和图片
  const plainExcerpt = useMemo(() => {
    if (resolvedContent) return stripMarkdown(resolvedContent);
    if (post.excerpt) return stripMarkdown(post.excerpt);
    return "";
  }, [resolvedContent, post.excerpt]);
  const contentImages = useMemo(() => {
    if (resolvedContent) return extractImages(resolvedContent);
    if (post.images) return post.images;
    return [];
  }, [resolvedContent, post.images]);
  const hasCover = !!resolvedCover && !resolvedCover.startsWith("private://");
  // 内容中的图片（排除与 cover_url 重复的）
  const galleryImages = contentImages.filter((img) => !hasCover || img !== resolvedCover);
  // 合并所有图片（封面图 + 内容图）
  const allImages = useMemo(() => {
    const imgs: string[] = [];
    if (hasCover && resolvedCover) imgs.push(resolvedCover);
    if (galleryImages.length > 0) imgs.push(...galleryImages);
    return imgs;
  }, [hasCover, resolvedCover, galleryImages]);

  const handleImageScroll = useCallback(() => {
    if (!imageScrollRef.current) return;
    const el = imageScrollRef.current;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveImageDot(idx);
  }, []);

  const handleShare = async () => {
    const url = `${window.location.origin}/read/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareTip(true);
      setTimeout(() => setShareTip(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setShareTip(true);
      setTimeout(() => setShareTip(false), 2000);
    }
  };

  const handleCommentClick = async () => {
    if (!user) {
      goToLogin();
      return;
    }
    const willOpen = !showComment;
    setShowComment(willOpen);
    if (willOpen && comments.length === 0) {
      setLoadingComments(true);
      const { data } = await supabase
        .from("comments")
        .select("id, content, created_at, user_id, author:profiles!comments_user_id_fkey(nickname, avatar_url)")
        .eq("post_id", post.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) {
        setComments(
          data.map((c: Record<string, unknown>) => {
            const a = c.author as { nickname: string; avatar_url: string | null } | null;
            return {
              id: c.id as string,
              post_id: post.id,
              user_id: c.user_id as string,
              content: c.content as string,
              created_at: c.created_at as string,
              parent_id: null,
              paragraph_index: null,
              author: { nickname: a?.nickname || "匿名用户", avatar_url: a?.avatar_url },
            };
          })
        );
      }
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    if (!commentText.trim() || !user) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: post.id,
        user_id: user.id,
        content: commentText.trim(),
      })
      .select("id, content, created_at, user_id")
      .single();

    if (!error && data) {
      const newComment: Comment = {
        id: (data as Record<string, unknown>).id as string,
        post_id: post.id,
        user_id: user.id,
        content: commentText.trim(),
        created_at: (data as Record<string, unknown>).created_at as string,
        parent_id: null,
        paragraph_index: null,
        author: { nickname: profile?.nickname || user.email?.split("@")[0] || "我", avatar_url: profile?.avatar_url || null },
      };
      setComments((prev) => [newComment, ...prev]);
      setCommentText("");
      setCommentCount((c) => c + 1);
      createNotification({
        type: "comment",
        actor_id: user.id,
        post_id: post.id,
        content: commentText.trim(),
      });
    }
    setSubmitting(false);
  };

  const getTimeAgo = (dateStr: string): string => {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
    return new Date(dateStr).toLocaleDateString("zh-CN");
  };

  const navigateCard = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select")) return;
    router.push(`/read/${post.id}`);
  };

  return (
    <article
      className="card"
      onClick={navigateCard}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) router.push(`/read/${post.id}`);
      }}
      role="link"
      tabIndex={0}
    >
      {/* V2: card-header — avatar + author info + follow button */}
      <div className="card-header">
        <Link href={`/user/${post.user_id}`} className="flex-shrink-0">
          <div className="card-avatar">
            {post.author?.avatar_url ? (
              <img src={post.author.avatar_url} alt="" />
            ) : (
              <DefaultAvatar name={post.author?.username || post.author?.nickname || "?"} />
            )}
          </div>
        </Link>

        <div className="card-author-info">
          <Link href={`/user/${post.user_id}`} className="no-underline">
            <div className="card-author-name">
              {post.author?.username || post.author?.nickname || "匿名用户"}
            </div>
          </Link>
          <div className="card-time">
            {post.time_ago || post.created_at ? getTimeAgo(post.created_at || "") : "刚刚"}
          </div>
        </div>

        <div className="card-header-actions">
          {user?.id !== post.user_id && (
            <button className="card-follow-btn" onClick={toggleFollow} disabled={followLoading}>
              {user ? (following ? "已关注" : followLoading ? "..." : "+ 关注") : "+ 关注"}
            </button>
          )}
          <div className="card-more-wrap" ref={cardMenuRef}>
            <button className="card-more-btn" onClick={() => setCardMenuOpen((open) => !open)} aria-label="作品更多操作" aria-expanded={cardMenuOpen}>⋮</button>
            {cardMenuOpen && (
              <div className="card-more-menu">
                {user?.id !== post.user_id && following && <button onClick={() => { setCardMenuOpen(false); void toggleFollow(); }}><span className="menu-item-icon" aria-hidden="true" />取消关注</button>}
                <button onClick={() => { setCardMenuOpen(false); void reportTarget("post", post.id); }}><i className="fa-solid fa-flag" /> 举报</button>
              </div>
            )}
          </div>
        </div>

        </div>

      {/* V2: card-title */}
      {!isPlaceholderTitle(post.title) && (
        <Link
          href={`/read/${post.id}`}
          className="card-title no-underline hover:text-accent"
        >
          {post.title}
        </Link>
      )}

      {/* V2: card-excerpt — 纯文本摘要 */}
      {plainExcerpt && (
        <p className="card-excerpt">
          {plainExcerpt}
        </p>
      )}

      {/* 图片展示：PC端横向滚动 + 渐变遮罩，移动端单图 + 圆点 */}
      {allImages.length > 0 && (
        <div className="card-image-strip">
          <div
            className={`card-image-scroll ${allImages.length > 1 ? "has-overflow" : ""}`}
            ref={imageScrollRef}
            onScroll={handleImageScroll}
            style={{ "--active-image-ratio": imageAspectRatios[activeImageDot] || 4 / 3 } as CSSProperties}
          >
            {allImages.map((img, i) => (
              <button key={i} type="button" className="card-image-item card-image-item-button" onClick={() => { setActiveImageDot(i); setLightboxOpen(true); }} aria-label={`查看第${i + 1}张图片`}>
                <img
                  src={getThumbnailUrl(img, { width: 400, height: 300, resize: "cover" })}
                  alt=""
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={i === 0 ? "high" : "auto"}
                  onLoad={(event) => {
                    setLoadedImages(prev => new Set(prev).add(i));
                    const image = event.currentTarget;
                    if (image.naturalWidth && image.naturalHeight) {
                      setImageAspectRatios((current) => ({ ...current, [i]: image.naturalWidth / image.naturalHeight }));
                    }
                  }}
                  className={loadedImages.has(i) ? "loaded" : ""}
                />
              </button>
            ))}
          </div>
          {allImages.length > 1 && (
            <div className="card-image-dots">
              {allImages.map((_, i) => (
                <span key={i} className={i === activeImageDot ? "active" : ""} />
              ))}
            </div>
          )}
        </div>
      )}

      {lightboxOpen && <ImageLightbox post={{ ...post, content: resolvedContent, cover_url: resolvedCover }} images={allImages} initialIndex={activeImageDot} onClose={() => setLightboxOpen(false)} />}

      {/* V2: 标签 */}
      {post.tags && post.tags.length > 0 && (
        <div className="card-tags">
          {post.tags.map((tag) => {
            const tagName = typeof tag === "string" ? tag : tag.name;
            return (
              <Link key={tagName} href={`/tag/${tagName}`} className="card-tag no-underline">
                {tagName}
              </Link>
            );
          })}
        </div>
      )}

      {/* V2: card-actions — 互动按钮 */}
      <div className="card-actions">
        <LikeButton postId={post.id} initialCount={post.like_count || 0} onLogin={goToLogin} />
        <button className="card-action" onClick={handleCommentClick}>
          <i className="fa-regular fa-comment"></i>
          <span>{commentCount}</span>
        </button>
        <BookmarkButton postId={post.id} initialCount={post.bookmark_count || 0} onLogin={goToLogin} />
        <div className="relative">
          <button className="card-action" onClick={handleShare}>
            <i className="fa-solid fa-arrow-up-from-bracket"></i>
            <span>分享</span>
          </button>
          {shareTip && (
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-warm text-white text-xs px-2 py-1 rounded whitespace-nowrap">
              链接已复制
            </span>
          )}
        </div>
      </div>

      {/* 评论区（展开后） */}
      {showComment && (
        <InlineCommentPanel
          postId={post.id}
          user={user}
          displayName={profile?.nickname || user?.email?.split("@")[0] || "我"}
          avatarUrl={profile?.avatar_url}
          comments={comments}
          commentCount={commentCount}
          commentText={commentText}
          loadingComments={loadingComments}
          submitting={submitting}
          onCommentTextChange={setCommentText}
          onSubmit={submitComment}
          onClose={() => setShowComment(false)}
          onReport={(commentId, commentUserId) => void reportTarget("comment", commentId, commentUserId)}
          onBlock={(commentUserId) => void blockUser(commentUserId)}
        />
      )}
      <ModerationReasonModal
        open={!!moderationModal}
        mode={moderationModal?.mode || "report"}
        submitting={moderationSubmitting}
        onClose={() => setModerationModal(null)}
        onSubmit={submitModeration}
      />
      <CenteredToast message={toastMessage} />
    </article>
  );
}
