"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
import InlineCommentPanel from "@/components/InlineCommentPanel";
import ModerationReasonModal from "@/components/ModerationReasonModal";
import CenteredToast from "@/components/CenteredToast";
import type { Comment } from "@/lib/types";

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

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

export default function SerialPostCard({ data }: { data: SerialPostCardData }) {
  const supabase = createClient();
  const { user, profile } = useAuth();
  const router = useRouter();

  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(data.commentCount || 0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const [moderationModal, setModerationModal] = useState<
    | { mode: "report"; targetType: "post" | "comment"; targetId: string }
    | { mode: "block"; userId: string }
    | null
  >(null);
  const [moderationSubmitting, setModerationSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
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

  const plainExcerpt = useMemo(() => stripMarkdown(data.content), [data.content]);
  const avatarChar = data.authorNickname?.[0] || "?";

  const goToLogin = () => router.push("/login");

  const reportTarget = (targetType: "post" | "comment", targetId: string) => {
    if (!user) { goToLogin(); return; }
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
    const { error } = moderationModal.mode === "report"
      ? moderationModal.targetType === "comment"
        ? await supabase.from("comment_reports").insert({ reporter_id: user.id, comment_id: moderationModal.targetId, reason: reason.trim() })
        : await supabase.from("content_reports").insert({ reporter_id: user.id, target_type: "post", target_id: moderationModal.targetId, reason: reason.trim() })
      : await supabase.from("blocked_users").insert({ user_id: user.id, blocked_user_id: moderationModal.userId });
    setModerationSubmitting(false);
    if (error && !(moderationModal.mode === "block" && (error as unknown as Record<string, unknown>).code?.toString().includes("23505"))) {
      setToastMessage(moderationModal.mode === "report" ? "举报提交失败，请稍后重试。" : "屏蔽失败，请稍后重试。");
      return;
    }
    setModerationModal(null);
    setToastMessage(moderationModal.mode === "report" ? "举报已提交，我们会尽快处理。" : "已屏蔽该用户。");
  };

  // Check follow status
  useEffect(() => {
    if (!user || user.id === data.authorId) return;
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", data.authorId)
      .single()
      .then(({ data: followData }) => setFollowing(!!followData));
  }, [user, data.authorId]);

  const toggleFollow = async () => {
    if (!user) { goToLogin(); return; }
    if (followLoading) return;
    setFollowLoading(true);
    if (following) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", data.authorId);
      if (!error) setFollowing(false);
    } else {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: data.authorId });
      if (!error) setFollowing(true);
    }
    setFollowLoading(false);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/read/${data.chapterId}`;
    try {
      await navigator.clipboard.writeText(url);
      setToastMessage("链接已复制到剪贴板");
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setToastMessage("链接已复制到剪贴板");
    }
  };

  const handleCommentClick = async () => {
    if (!user) { goToLogin(); return; }
    const willOpen = !showComment;
    setShowComment(willOpen);
    if (willOpen && comments.length === 0) {
      setLoadingComments(true);
      const { data: raw } = await supabase
        .from("comments")
        .select("id, content, created_at, user_id, author:profiles!comments_user_id_fkey(nickname, avatar_url)")
        .eq("post_id", data.chapterId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (raw) {
        setComments(raw.map((c: Record<string, unknown>) => {
          const author = c.author as { nickname?: string; avatar_url?: string | null } | null;
          return {
            id: c.id as string,
            post_id: data.chapterId,
            user_id: c.user_id as string,
            content: c.content as string,
            created_at: c.created_at as string,
            parent_id: null,
            paragraph_index: null,
            author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url || null },
          };
        }));
      }
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    if (!commentText.trim() || !user) return;
    setSubmitting(true);
    const text = commentText.trim();
    const { data: inserted, error } = await supabase
      .from("comments")
      .insert({ post_id: data.chapterId, user_id: user.id, content: text })
      .select("id, content, created_at, user_id")
      .single();
    if (!error && inserted) {
      setComments((prev) => [{
        id: inserted.id as string,
        post_id: data.chapterId,
        user_id: user.id,
        content: text,
        created_at: inserted.created_at as string,
        parent_id: null,
        paragraph_index: null,
        author: { nickname: profile?.nickname || user.email?.split("@")[0] || "我", avatar_url: profile?.avatar_url || null },
      }, ...prev]);
      setCommentText("");
      setCommentCount((count) => count + 1);
    }
    setSubmitting(false);
  };

  return (
    <article
      className="card"
      role="link"
      tabIndex={0}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("a, button")) router.push(`/read/${data.chapterId}`);
      }}
      onKeyDown={(event) => { if (event.key === "Enter") router.push(`/read/${data.chapterId}`); }}
    >
      {/* V2: card-header — avatar + author info */}
      <div className="card-header">
        <Link href={`/user/${data.authorId}`} className="flex-shrink-0">
          <div className="card-avatar">
            {data.authorAvatar ? (
              <img src={data.authorAvatar} alt="" />
            ) : (
              avatarChar
            )}
          </div>
        </Link>

        <div className="card-author-info">
          <Link href={`/user/${data.authorId}`} className="no-underline">
            <div className="card-author-name">
              {data.authorNickname || "匿名用户"}
            </div>
          </Link>
          <div className="card-time">
            {getTimeAgo(data.createdAt)}
          </div>
        </div>

        <div className="card-header-actions">
          {user?.id !== data.authorId && (
            <button className="card-follow-btn" onClick={toggleFollow} disabled={followLoading}>
              {user ? (following ? "已关注" : followLoading ? "..." : "+ 关注") : "+ 关注"}
            </button>
          )}
          <div className="card-more-wrap" ref={cardMenuRef}>
            <button className="card-more-btn" onClick={() => setCardMenuOpen((open) => !open)} aria-label="作品更多操作" aria-expanded={cardMenuOpen}>⋮</button>
            {cardMenuOpen && (
              <div className="card-more-menu">
                {user?.id !== data.authorId && following && <button onClick={() => { setCardMenuOpen(false); void toggleFollow(); }}><span className="menu-item-icon" aria-hidden="true" />取消关注</button>}
                <button onClick={() => { setCardMenuOpen(false); void reportTarget("post", data.chapterId); }}><i className="fa-solid fa-flag" /> 举报</button>
              </div>
            )}
          </div>
        </div>

        </div>

      {/* V2: card-title — 章节标题 */}
      <Link
        href={`/read/${data.chapterId}`}
        className="card-title no-underline hover:text-accent"
      >
        第{data.chapterNumber}章 {data.chapterTitle || "无标题"}
      </Link>

      {/* V2: card-excerpt */}
      {plainExcerpt && (
        <p className="card-excerpt">
          {plainExcerpt}
        </p>
      )}

      {/* V2: serial-inner — 连载信息内卡片 */}
      <Link
        href={`/series/${encodeURIComponent(data.seriesName)}`}
        className="serial-inner no-underline"
        style={{ display: "flex" }}
      >
        <div className="serial-info">
          <div className="serial-name-row">
            <span className="serial-name">{data.seriesName}</span>
            <span className={`serial-badge ${data.seriesStatus === "completed" ? "completed" : ""}`}>
              {data.seriesStatus === "ongoing" ? "连载中" : "已完结"}
            </span>
          </div>
          {data.seriesDescription && (
            <div className="serial-desc">{data.seriesDescription}</div>
          )}
          {data.seriesTags.length > 0 && (
            <div className="serial-tags">
              {data.seriesTags.slice(0, 4).map((tag) => (
                <span key={tag} className="card-tag">{tag}</span>
              ))}
              {data.seriesTags.length > 4 && (
                <span className="card-tag">+{data.seriesTags.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* V2: card-actions — 互动按钮 */}
      <div className="card-actions">
        <LikeButton postId={data.chapterId} initialCount={data.likeCount} onLogin={goToLogin} />
        <button className="card-action" onClick={handleCommentClick}>
          <i className="fa-regular fa-comment" />
          <span>{commentCount}</span>
        </button>
        <BookmarkButton postId={data.chapterId} initialCount={data.bookmarkCount} onLogin={goToLogin} />
        <button className="card-action" onClick={handleShare}>
          <i className="fa-solid fa-arrow-up-from-bracket" />
          <span>分享</span>
        </button>
      </div>
      {showComment && (
        <InlineCommentPanel
          postId={data.chapterId}
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
          onReport={(commentId) => void reportTarget("comment", commentId)}
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
