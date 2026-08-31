"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import DefaultAvatar from "@/components/DefaultAvatar";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
import InlineCommentPanel from "@/components/InlineCommentPanel";
import ModerationReasonModal from "@/components/ModerationReasonModal";
import CenteredToast from "@/components/CenteredToast";
import type { Comment, Post } from "@/lib/types";

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
  const router = useRouter();
  const { user, profile } = useAuth();
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, images.length - 1)));
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [loadingComments, setLoadingComments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [following, setFollowing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [moderation, setModeration] = useState<{
    mode: "report" | "block";
    targetId?: string;
    targetType?: "post" | "comment" | "user";
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
        .select("id, content, created_at, user_id, parent_id, author:profiles!comments_user_id_fkey(nickname, avatar_url)")
        .eq("post_id", post.id).order("created_at", { ascending: false }).limit(50);
      if (!active) return;
      setComments((data || []).map((row: Record<string, unknown>) => {
        const author = row.author as { nickname?: string; avatar_url?: string | null } | null;
        return { id: row.id as string, post_id: post.id, user_id: row.user_id as string, parent_id: (row.parent_id as string | null) || null, paragraph_index: null, content: row.content as string, created_at: row.created_at as string, author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url || null } };
      }));
      setLoadingComments(false);
    })();
    return () => { active = false; };
  }, [post.id]);

  useEffect(() => {
    if (!user || !authorId || user.id === authorId) return;
    supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", authorId).maybeSingle().then(({ data }: { data: { id: string } | null }) => setFollowing(!!data));
  }, [user, authorId]);

  const toggleFollow = async () => {
    if (!user) { router.push("/login"); return; }
    const query = supabase.from("follows");
    const result = following ? await query.delete().eq("follower_id", user.id).eq("following_id", authorId) : await query.insert({ follower_id: user.id, following_id: authorId });
    if (!result.error) setFollowing(!following);
  };

  const submitComment = async () => {
    if (!user || !commentText.trim()) return;
    setSubmitting(true);
    const text = commentText.trim();
    const { data, error } = await supabase.from("comments").insert({ post_id: post.id, user_id: user.id, content: text }).select("id, created_at").single();
    if (!error && data) {
      setComments((items) => [{ id: data.id as string, post_id: post.id, user_id: user.id, parent_id: null, paragraph_index: null, content: text, created_at: data.created_at as string, author: { nickname: profile?.nickname || "我", avatar_url: profile?.avatar_url || null } }, ...items]);
      setCommentText(""); setCommentCount((value) => value + 1);
    }
    setSubmitting(false);
  };

  const share = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/read/${post.id}`); setToast("链接已复制"); }
    catch { setToast("复制失败，请稍后重试"); }
  };

  const submitModeration = async (reason: string) => {
    if (!user || !moderation) return;
    const result = moderation.mode === "report"
      ? moderation.targetType === "comment"
        ? await supabase.from("comment_reports").insert({ reporter_id: user.id, comment_id: moderation.targetId, reason })
        : await supabase.from("content_reports").insert({ reporter_id: user.id, target_type: "post", target_id: moderation.targetId || post.id, reason })
      : await supabase.from("blocked_users").insert({ user_id: user.id, blocked_user_id: moderation.targetId || authorId });
    if (!result.error) { setModeration(null); setToast(moderation.mode === "report" ? "举报已提交" : "已屏蔽该用户"); }
  };

  const description = useMemo(() => (post.content || "").replace(/!\[.*?\]\(.*?\)/g, "").replace(/\s+/g, " ").trim(), [post.content]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="查看图片" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="关闭"><i className="fa-solid fa-xmark" /></button>
      <div className="image-lightbox-stage">
        <img src={currentImage} alt={`${title} 第${index + 1}张`} />
        {images.length > 1 && <>
          <button type="button" className="image-lightbox-nav prev" onClick={() => setIndex((value) => (value + images.length - 1) % images.length)} aria-label="上一张"><i className="fa-solid fa-chevron-left" /></button>
          <button type="button" className="image-lightbox-nav next" onClick={() => setIndex((value) => (value + 1) % images.length)} aria-label="下一张"><i className="fa-solid fa-chevron-right" /></button>
        </>}
        <span className="image-lightbox-counter">{index + 1} / {images.length}</span>
      </div>
      <aside className="image-lightbox-info" onMouseDown={(event) => event.stopPropagation()}>
        <div className="image-lightbox-author">
          <Link href={`/user/${authorId}`} onClick={onClose}>
            {post.author?.avatar_url ? <img src={post.author.avatar_url} alt={authorName} /> : <DefaultAvatar name={authorName} className="image-lightbox-avatar" />}
          </Link>
          <div><Link href={`/user/${authorId}`} onClick={onClose}>{authorName}</Link><span>{timeAgo(date)}</span></div>
          {user?.id !== authorId && <button type="button" className="image-lightbox-follow" onClick={toggleFollow}>{following ? "已关注" : "+ 关注"}</button>}
          <div className="image-lightbox-menu-wrap"><button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="更多">⋮</button>{menuOpen && <div className="image-lightbox-menu"><button type="button" onClick={() => { setMenuOpen(false); setModeration({ mode: "block", targetId: authorId, targetType: "user" }); }}>屏蔽用户</button><button type="button" onClick={() => { setMenuOpen(false); setModeration({ mode: "report", targetId: post.id, targetType: "post" }); }}>举报作品</button></div>}</div>
        </div>
        <h2>{title}</h2><p className="image-lightbox-description">{description || "暂无说明"}</p>
        <div className="image-lightbox-actions"><LikeButton postId={post.id} initialCount={post.like_count || 0} /><button type="button" className="card-action" onClick={() => setToast("评论区已展开")}><i className="fa-regular fa-comment" /> {commentCount}</button><BookmarkButton postId={post.id} initialCount={post.bookmark_count || 0} /><button type="button" className="card-action" onClick={share}><i className="fa-solid fa-share-nodes" /> 分享</button></div>
        <InlineCommentPanel postId={post.id} user={user} displayName={profile?.nickname || user?.email?.split("@")[0] || "我"} avatarUrl={profile?.avatar_url} comments={comments} commentCount={commentCount} commentText={commentText} loadingComments={loadingComments} submitting={submitting} onCommentTextChange={setCommentText} onSubmit={submitComment} onClose={onClose} onReport={(commentId) => setModeration({ mode: "report", targetId: commentId, targetType: "comment" })} onBlock={(userId) => setModeration({ mode: "block", targetId: userId, targetType: "user" })} />
      </aside>
      <ModerationReasonModal open={!!moderation && moderation.mode === "report"} mode="report" onClose={() => setModeration(null)} onSubmit={submitModeration} />
      <ModerationReasonModal open={!!moderation && moderation.mode === "block"} mode="block" onClose={() => setModeration(null)} onSubmit={submitModeration} />
      <CenteredToast message={toast} />
    </div>, document.body,
  );
}
