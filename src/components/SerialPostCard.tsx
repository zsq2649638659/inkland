"use client";
import SiteIcon from "@/components/SiteIcon";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { submitReportV1 } from "@/lib/reportContent";
import { assertCanComment, assertCanInteract } from "@/lib/userRestrictions";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
import InlineCommentPanel from "@/components/InlineCommentPanel";
import ModerationReasonModal from "@/components/ModerationReasonModal";
import CenteredToast from "@/components/CenteredToast";
import DefaultAvatar from "@/components/DefaultAvatar";
import { useAppDialog } from "@/components/AppDialogProvider";
import type { Comment } from "@/lib/types";
import { includeTestDataForProfile } from "@/lib/test-data-visibility";
import { formatHomeFeedTimestamp } from "@/lib/formatHomeFeedTimestamp";

export interface SerialPostCardData {
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  content: string;
  seriesId: string | null;
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
  likedByMe?: boolean;
  bookmarkedByMe?: boolean;
}

function stripMarkdown(content?: string): string {
  if (!content) return "";
  const text = content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[*_~`#>|-]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

export default function SerialPostCard({ data }: { data: SerialPostCardData }) {
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();
  const dialog = useAppDialog();
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
  const [deleted, setDeleted] = useState(false);
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
  const seriesHref = data.seriesId
    ? `/series/${encodeURIComponent(data.seriesId)}`
    : `/series/${encodeURIComponent(data.seriesName)}`;

  const goToLogin = () => {
    if (authLoading) return;
    router.push("/login");
  };

  const reportTarget = (targetType: "post" | "comment", targetId: string) => {
    if (!user) { goToLogin(); return; }
    setModerationModal({ mode: "report", targetType, targetId });
  };

  const blockUser = (blockedUserId: string) => {
    if (!user) { goToLogin(); return; }
    if (blockedUserId === user.id) return;
    setModerationModal({ mode: "block", userId: blockedUserId });
  };

  const deleteChapter = async () => {
    if (!user || user.id !== data.authorId) return;
    if (!await dialog.confirm({ title: "删除章节", message: `确定要删除“第${data.chapterNumber}章 ${data.chapterTitle || "无标题"}”吗？删除后无法恢复。`, confirmLabel: "删除章节", variant: "danger" })) return;
    const { error } = await supabase.from("posts").delete().eq("id", data.chapterId).eq("user_id", user.id);
    if (error) {
      await dialog.alert({ title: "删除失败", message: error.message, variant: "danger" });
      return;
    }
    setCardMenuOpen(false);
    setDeleted(true);
  };

  const submitModeration = async (reason: string, details?: string) => {
    if (!moderationModal || !user || (moderationModal.mode === "report" && !reason.trim())) return;
    setModerationSubmitting(true);
    if (moderationModal.mode === "report") {
      const result = await submitReportV1(supabase, { targetType: moderationModal.targetType, targetId: moderationModal.targetId, reason, details });
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
    if (!user || user.id === data.authorId) return;
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", data.authorId)
      .single()
      .then(({ data: followData }: { data: { id: string } | null }) => setFollowing(!!followData));
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
      const blocked = await assertCanInteract();
      if (blocked) {
        setFollowLoading(false);
        setToastMessage(blocked);
        return;
      }
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
        .select("id, content, created_at, user_id, parent_id, author:profiles!comments_user_id_fkey(nickname, avatar_url, is_test_account)")
        .eq("post_id", data.chapterId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (raw) {
        setComments(raw.filter((c: Record<string, unknown>) => includeTestDataForProfile(profile) || !((c.author as { is_test_account?: boolean } | null)?.is_test_account)).map((c: Record<string, unknown>) => {
          const author = c.author as { nickname?: string; avatar_url?: string | null } | null;
          return {
            id: c.id as string,
            post_id: data.chapterId,
            user_id: c.user_id as string,
            content: c.content as string,
            created_at: c.created_at as string,
            parent_id: (c.parent_id as string | null) ?? null,
            paragraph_index: null,
            author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url || null },
          };
        }));
      }
      setLoadingComments(false);
    }
  };

  if (deleted) return null;

  const submitComment = async () => {
    if (!commentText.trim() || !user) return;
    const blocked = await assertCanComment();
    if (blocked) {
      setToastMessage(blocked);
      return;
    }
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

  const submitReply = async (parentId: string, content: string, replyToName: string) => {
    if (!user || !content.trim()) return;
    const blocked = await assertCanComment();
    if (blocked) {
      setToastMessage(blocked);
      return;
    }
    const storedContent = `@${replyToName} ${content.trim()}`;
    const { data: inserted, error } = await supabase
      .from("comments")
      .insert({ post_id: data.chapterId, user_id: user.id, parent_id: parentId, content: storedContent })
      .select("id, content, created_at, user_id, parent_id")
      .single();
    if (error || !inserted) {
      setToastMessage("回复发布失败，请稍后重试。");
      return;
    }
    setComments((prev) => [...prev, {
      id: inserted.id as string,
      post_id: data.chapterId,
      user_id: user.id,
      content: storedContent,
      created_at: inserted.created_at as string,
      parent_id: parentId,
      paragraph_index: null,
      author: { nickname: profile?.nickname || user.email?.split("@")[0] || "我", avatar_url: profile?.avatar_url || null },
    }]);
    setCommentCount((count) => count + 1);
  };

  const deleteComment = async (commentId: string) => {
    if (!user) return;
    if (!await dialog.confirm({ title: "删除评论", message: "确定要删除这条评论吗？删除后无法恢复。", confirmLabel: "删除评论", variant: "danger" })) return;
    const childIds = comments.filter((comment) => comment.parent_id === commentId).map((comment) => comment.id);
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", user.id);
    if (error) {
      setToastMessage(error?.message || "删除失败：评论可能已被删除，或当前账号没有删除权限。");
      return;
    }
    const { data: remaining, error: verifyError } = await supabase
      .from("comments")
      .select("id")
      .eq("id", commentId)
      .maybeSingle();
    if (verifyError || remaining) {
      setToastMessage(verifyError?.message || "删除失败：评论仍然存在，请稍后重试。");
      return;
    }
    const removedIds = new Set([commentId, ...childIds]);
    setComments((items) => items.filter((comment) => !removedIds.has(comment.id)));
    setCommentCount((count) => Math.max(0, count - removedIds.size));
  };

  return (
    <article
      className="site-card site-card--feed site-card--feed-serial"
      role="link"
      tabIndex={0}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("a, button") && target.closest(".site-card__title, .site-card__excerpt")) router.push(`/read/${data.chapterId}`);
      }}
      onKeyDown={(event) => { if (event.key === "Enter") router.push(`/read/${data.chapterId}`); }}
    >
      {/* V2: card-header — avatar + author info */}
      <div className="site-card__header">
        <Link href={`/user/${data.authorId}`} className="site-card__avatar-link">
          <div className="site-card__avatar">
            {data.authorAvatar ? (
              <img src={data.authorAvatar} alt="" />
            ) : (
              <DefaultAvatar name={data.authorNickname || "?"} />
            )}
          </div>
        </Link>

        <div className="site-card__author">
          <Link href={`/user/${data.authorId}`} className="no-underline">
            <strong>
              {data.authorNickname || "匿名用户"}
            </strong>
          </Link>
          <Link href={`/read/${data.chapterId}`} className="site-card__author-meta no-underline" aria-label="打开章节详情" onClick={(event) => event.stopPropagation()}>
            {formatHomeFeedTimestamp(data.createdAt)}
          </Link>
        </div>

        <div className="site-card__header-actions">
          <div className="card-more-wrap" ref={cardMenuRef}>
            <button className="site-card__more" onClick={() => setCardMenuOpen((open) => !open)} aria-label="作品更多操作" aria-expanded={cardMenuOpen}><SiteIcon name="fa-ellipsis-vertical" variant="solid" /></button>
            {cardMenuOpen && (
              <div className="card-more-menu">
                {user?.id !== data.authorId && (
                  <button onClick={() => { setCardMenuOpen(false); void toggleFollow(); }} disabled={followLoading}>
                    <SiteIcon name={following ? "fa-user-minus" : "fa-user-plus"} variant="outline" hoverVariant="solid" />
                    {following ? "取消关注" : followLoading ? "..." : "关注"}
                  </button>
                )}
                <button onClick={() => { setCardMenuOpen(false); void reportTarget("post", data.chapterId); }}><SiteIcon name="fa-flag" variant="outline" hoverVariant="solid" /> 举报</button>
                {user?.id === data.authorId && <button onClick={() => void deleteChapter()}><SiteIcon name="fa-action-delete" variant="outline" hoverVariant="solid" /> 删除</button>}
              </div>
            )}
          </div>
        </div>

        </div>

      {/* V2: card-content — 章节标题和正文共用章节详情入口 */}
      <Link href={`/read/${data.chapterId}`} className="site-card__content-link">
        <h3 className="site-card__title">第{data.chapterNumber}章 {data.chapterTitle || "无标题"}</h3>
        {plainExcerpt && <p className="site-card__excerpt site-card__serial-intro">{plainExcerpt}</p>}
      </Link>

      {/* V2: serial-inner — 连载信息内卡片 */}
      <div
        className="site-card__serial-inner"
        role="link"
        tabIndex={0}
        aria-label={`查看长篇作品：${data.seriesName}`}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("a, button, .site-card__status, .site-card__tag")) return;
          router.push(seriesHref);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            router.push(seriesHref);
          }
        }}
      >
        <div className="site-card__serial-heading">
          <Link
            href={seriesHref}
            className="site-card__title-link"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              router.push(seriesHref);
            }}
          >
            <strong>{data.seriesName}</strong>
          </Link>
          <span className={`tag tag--status ${data.seriesStatus === "ongoing" ? "tag--status-active" : "tag--status-complete"} site-card__status`} onClick={(event) => event.stopPropagation()}>
            {data.seriesStatus === "ongoing" ? "连载中" : "已完结"}
          </span>
        </div>
        {data.seriesDescription && <p>{data.seriesDescription}</p>}
        <div className="site-card__tags" onClick={(event) => event.stopPropagation()}>
          <span className="tag tag--site site-card__tag">第{data.chapterNumber}章</span>
          {data.seriesTags.map((tag) => <span key={tag} className="tag tag--site site-card__tag">{tag}</span>)}
        </div>
      </div>

      {/* V2: card-actions — 互动按钮 */}
      <div className="site-card__actions">
        <LikeButton className="site-card__action" postId={data.chapterId} initialCount={data.likeCount} onLogin={goToLogin} initialActive={data.likedByMe} />
        <button className="site-card__action" onClick={handleCommentClick}>
          <SiteIcon name="fa-comment" variant="outline" hoverVariant="solid" />
          <span>{commentCount}</span>
        </button>
        <BookmarkButton className="site-card__action" postId={data.chapterId} initialCount={data.bookmarkCount} onLogin={goToLogin} initialActive={data.bookmarkedByMe} />
        <button className="site-card__action site-card__share" onClick={handleShare}>
          <SiteIcon name="fa-share-from-square" variant="outline" hoverVariant="solid" />
          <span>分享</span>
        </button>
      </div>
      {showComment && (
        <InlineCommentPanel
          postId={data.chapterId}
          user={user}
          authLoading={authLoading}
          displayName={profile?.nickname || user?.email?.split("@")[0] || "我"}
          avatarUrl={profile?.avatar_url}
          comments={comments}
          commentCount={commentCount}
          commentText={commentText}
          loadingComments={loadingComments}
          submitting={submitting}
          onCommentTextChange={setCommentText}
          onSubmit={submitComment}
          onReply={submitReply}
          onDelete={deleteComment}
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
