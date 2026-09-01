"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import DefaultAvatar from "@/components/DefaultAvatar";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
import InlineCommentPanel from "@/components/InlineCommentPanel";
import ModerationReasonModal from "@/components/ModerationReasonModal";
import CenteredToast from "@/components/CenteredToast";
import { submitReportV1 } from "@/lib/reportContent";
import { assertCanComment, assertCanInteract } from "@/lib/userRestrictions";
import SiteDialog, { useSiteDialog } from "@/components/SiteDialog";
import type { Comment, Post } from "@/lib/types";
import "@/app/home-lightbox.css";

interface ImageLightboxProps {
  post: Post;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

function timeAgo(value?: string) {
  if (!value) return "";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
  return `${Math.floor(minutes / 1440)}天前`;
}

export default function ImageLightbox({ post, images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const supabase = createClient();
  const siteDialog = useSiteDialog();
  const { user, profile, loading: authLoading } = useAuth();
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, images.length - 1)));
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [loadingComments, setLoadingComments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [following, setFollowing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lightboxMenuRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState("");
  const [moderation, setModeration] = useState<{
    mode: "report" | "block";
    targetId?: string;
    targetType: "post" | "comment" | "user";
  } | null>(null);

  const authorName = post.author?.nickname || "匿名用户";
  const authorId = post.author?.id || post.user_id || "";
  const date = post.published_at || post.created_at;
  const currentImage = images[index];
  const title = post.title && !["图片分享", "Image Title"].includes(post.title) ? post.title : "图片作品";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setIndex((value) => (value + images.length - 1) % images.length);
      if (event.key === "ArrowRight") setIndex((value) => (value + 1) % images.length);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [images.length, onClose]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("comments")
        .select("id, content, created_at, user_id, parent_id, author:profiles!comments_user_id_fkey(nickname, avatar_url, is_test_account)")
        .eq("post_id", post.id).order("created_at", { ascending: false }).limit(50);
      if (!active) return;
      const baseComments: Comment[] = (data || [])
        .filter((row: Record<string, unknown>) => !((row.author as { is_test_account?: boolean } | null)?.is_test_account))
        .map((row: Record<string, unknown>) => {
        const author = row.author as { nickname?: string; avatar_url?: string | null } | null;
        return { id: row.id as string, post_id: post.id, user_id: row.user_id as string, parent_id: (row.parent_id as string | null) || null, paragraph_index: null, content: row.content as string, created_at: row.created_at as string, author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url || null } };
      });
      const commentIds = baseComments.map((comment) => comment.id);
      const statsMap = new Map<string, { like_count: number; reply_count: number }>();
      const likedIds = new Set<string>();
      if (commentIds.length > 0) {
        const [statsResult, likesResult] = await Promise.all([
          supabase.from("comment_stats").select("id, like_count, reply_count").in("id", commentIds),
          user?.id
            ? supabase.from("comment_likes").select("comment_id").eq("user_id", user.id).in("comment_id", commentIds)
            : Promise.resolve({ data: [] as Array<{ comment_id: string }> }),
        ]);
        for (const stat of statsResult.data || []) statsMap.set(stat.id as string, { like_count: Number(stat.like_count) || 0, reply_count: Number(stat.reply_count) || 0 });
        for (const like of likesResult.data || []) likedIds.add(like.comment_id as string);
      }
      if (!active) return;
      setComments(baseComments.map((comment) => ({ ...comment, ...(statsMap.get(comment.id) || { like_count: 0, reply_count: 0 }), liked_by_me: likedIds.has(comment.id) })));
      setLoadingComments(false);
    })();
    return () => { active = false; };
  }, [post.id, user?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenuOutside = (event: PointerEvent) => {
      if (!lightboxMenuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenuOutside);
    return () => document.removeEventListener("pointerdown", closeMenuOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!user || !authorId || user.id === authorId) return;
    supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", authorId).maybeSingle().then(({ data }: { data: { id: string } | null }) => setFollowing(!!data));
  }, [user, authorId]);

  const toggleFollow = async () => {
    if (authLoading) return;
    if (!user) { window.location.href = "/login"; return; }
    if (!following) {
      const blocked = await assertCanInteract();
      if (blocked) {
        setToast(blocked);
        return;
      }
    }
    const query = supabase.from("follows");
    const result = following ? await query.delete().eq("follower_id", user.id).eq("following_id", authorId) : await query.insert({ follower_id: user.id, following_id: authorId });
    if (!result.error) setFollowing(!following);
  };

  const submitComment = async () => {
    if (!user || !commentText.trim()) return;
    const blocked = await assertCanComment();
    if (blocked) {
      setToast(blocked);
      return;
    }
    setSubmitting(true);
    const text = commentText.trim();
    const { data, error } = await supabase.from("comments").insert({ post_id: post.id, user_id: user.id, content: text }).select("id, created_at").single();
    if (!error && data) {
      setComments((items) => [{ id: data.id as string, post_id: post.id, user_id: user.id, parent_id: null, paragraph_index: null, content: text, created_at: data.created_at as string, author: { nickname: profile?.nickname || "我", avatar_url: profile?.avatar_url || null } }, ...items]);
      setCommentText(""); setCommentCount((value) => value + 1);
    }
    setSubmitting(false);
  };

  const submitReply = async (parentId: string, content: string, replyToName: string) => {
    if (!user || !content) return;
    const blocked = await assertCanComment();
    if (blocked) {
      setToast(blocked);
      return;
    }
    const storedContent = `@${replyToName} ${content}`;
    const { data, error } = await supabase.from("comments").insert({ post_id: post.id, user_id: user.id, parent_id: parentId, content: storedContent }).select("id, created_at").single();
    if (!error && data) {
      setComments((items) => [...items, { id: data.id as string, post_id: post.id, user_id: user.id, parent_id: parentId, paragraph_index: null, content: storedContent, created_at: data.created_at as string, author: { nickname: profile?.nickname || "我", avatar_url: profile?.avatar_url || null } }]);
      setCommentCount((value) => value + 1);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!user) return;
    if (!(await siteDialog.confirmDialog("确定要删除这条评论吗？"))) return;
    const removedIds = new Set([commentId, ...comments.filter((comment) => comment.parent_id === commentId).map((comment) => comment.id)]);
    const { error } = await supabase.from("comments").delete().eq("id", commentId).eq("user_id", user.id);
    if (error) { setToast("删除失败，请稍后重试"); return; }
    setComments((items) => items.filter((comment) => !removedIds.has(comment.id)));
    setCommentCount((value) => Math.max(0, value - removedIds.size));
  };

  const share = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/read/${post.id}`); setToast("链接已复制"); }
    catch { setToast("复制失败，请稍后重试"); }
  };

  const submitModeration = async (reason: string, details?: string) => {
    if (!user || !moderation) return;
    if (moderation.mode === "report") {
      const result = await submitReportV1(supabase, { targetType: moderation.targetType, targetId: moderation.targetId || post.id, reason, details });
      if (!result.ok) { setToast(result.message); return; }
      setModeration(null);
      setToast(result.message);
      return;
    }
    const { error } = await supabase.from("blocked_users").insert({ user_id: user.id, blocked_user_id: moderation.targetId || authorId });
    if (!error || (error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      setModeration(null);
      setToast("已屏蔽该用户");
    }
  };

  const description = useMemo(() => (post.content || "").replace(/!\[.*?\]\(.*?\)/g, "").replace(/\s+/g, " ").trim(), [post.content]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="查看图片"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="关闭"><i className="fa-solid fa-xmark" /></button>
      <div
        className="image-lightbox-stage"
        onClick={(event) => {
          event.stopPropagation();
          const target = event.target as HTMLElement;
          if (!target.closest("img, button")) onClose();
        }}
      >
        <img src={currentImage} alt={`${title} 第${index + 1}张`} />
        {images.length > 1 && <>
          <button type="button" className="image-lightbox-nav prev" onClick={() => setIndex((value) => (value + images.length - 1) % images.length)} aria-label="上一张"><i className="fa-solid fa-chevron-left" /></button>
          <button type="button" className="image-lightbox-nav next" onClick={() => setIndex((value) => (value + 1) % images.length)} aria-label="下一张"><i className="fa-solid fa-chevron-right" /></button>
        </>}
        <span className="image-lightbox-counter">{index + 1} / {images.length}</span>
      </div>
      <aside className="image-lightbox-info" onMouseDown={(event) => event.stopPropagation()}>
        <div className="image-lightbox-author">
          <Link href={`/user/${authorId}`}>
            {post.author?.avatar_url ? <img src={post.author.avatar_url} alt={authorName} /> : <DefaultAvatar name={authorName} className="image-lightbox-avatar" />}
          </Link>
          <div><Link href={`/user/${authorId}`}>{authorName}</Link><Link className="image-lightbox-time" href={`/read/${post.id}`}>{timeAgo(date)}</Link></div>
          {user?.id !== authorId && <button type="button" className="image-lightbox-follow" onClick={toggleFollow}>{following ? "已关注" : "+ 关注"}</button>}
          <div className="image-lightbox-menu-wrap" ref={lightboxMenuRef}><button type="button" className="comment-more-btn inline-comment-more" onClick={() => setMenuOpen(!menuOpen)} aria-label="更多">⋮</button>{menuOpen && <div className="comment-popup show"><button type="button" className="comment-popup-item" onClick={() => { setMenuOpen(false); setModeration({ mode: "block", targetId: authorId, targetType: "user" }); }}><i className="fa-solid fa-ban" /> 屏蔽</button><button type="button" className="comment-popup-item" onClick={() => { setMenuOpen(false); setModeration({ mode: "report", targetId: post.id, targetType: "post" }); }}><i className="fa-solid fa-flag" /> 举报</button></div>}</div>
        </div>
        <h2>{title}</h2><p className="image-lightbox-description">{description || "暂无说明"}</p>
        <div className="image-lightbox-actions card-actions"><LikeButton postId={post.id} initialCount={post.like_count || 0} /><button type="button" className="card-action"><i className="fa-regular fa-comment" /><span>{commentCount}</span></button><BookmarkButton postId={post.id} initialCount={post.bookmark_count || 0} /><button type="button" className="card-action" onClick={share}><i className="fa-solid fa-arrow-up-from-bracket" /><span>分享</span></button></div>
        <InlineCommentPanel postId={post.id} user={user} authLoading={authLoading} displayName={profile?.nickname || user?.email?.split("@")[0] || "我"} avatarUrl={profile?.avatar_url} comments={comments} commentCount={commentCount} commentText={commentText} loadingComments={loadingComments} submitting={submitting} onCommentTextChange={setCommentText} onSubmit={submitComment} onReply={submitReply} onDelete={deleteComment} onClose={onClose} onReport={(commentId, commentUserId) => { void commentUserId; setModeration({ mode: "report", targetId: commentId, targetType: "comment" }); }} onBlock={(userId) => setModeration({ mode: "block", targetId: userId, targetType: "user" })} />
      </aside>
      <ModerationReasonModal open={!!moderation && moderation.mode === "report"} mode="report" onClose={() => setModeration(null)} onSubmit={submitModeration} />
      <ModerationReasonModal open={!!moderation && moderation.mode === "block"} mode="block" onClose={() => setModeration(null)} onSubmit={submitModeration} />
      <SiteDialog state={siteDialog.dialog} onClose={siteDialog.close} />
      <CenteredToast message={toast} />
    </div>, document.body,
  );
}
