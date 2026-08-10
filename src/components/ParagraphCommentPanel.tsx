"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import EmojiPicker from "@/components/EmojiPicker";
import DefaultAvatar from "@/components/DefaultAvatar";
import { createNotification } from "@/lib/notifications";
import type { Comment } from "@/lib/types";

interface ParagraphCommentPanelProps {
  postId: string;
  paragraphIndex: number;
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  onReport?: (commentId: string, commentUserId: string) => void;
}

export default function ParagraphCommentPanel({
  postId,
  paragraphIndex,
  open,
  onClose,
  darkMode,
onReport,
}: ParagraphCommentPanelProps) {
  const supabase = createClient();
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [commentMenuId, setCommentMenuId] = useState<string | null>(null);
  const [blockModal, setBlockModal] = useState<{ open: boolean; userId: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // 事件委托：鼠标悬停时查找最近的 [data-comment-id] 元素
  const handleCommentMouseOver = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-comment-id]');
    if (el) {
      const id = el.getAttribute('data-comment-id');
      if (id) setHoveredCommentId(id);
    }
  }, []);

  // 鼠标离开评论容器时重置 hover 状态
  const handleCommentMouseOut = useCallback((e: React.MouseEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setHoveredCommentId(null);
    }
  }, []);

  const loadComments = useCallback(async () => {
    setLoading(true);
    const { data: parentData } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, parent_id, paragraph_index, author:profiles!comments_user_id_fkey(nickname, avatar_url)")
      .eq("post_id", postId)
      .eq("paragraph_index", paragraphIndex)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!parentData || parentData.length === 0) {
      setComments([]);
      setLoading(false);
      return;
    }

    const commentIds = parentData.map((c: Record<string, unknown>) => c.id as string);

    const { data: statsData } = await supabase
      .from("comment_stats")
      .select("id, like_count, reply_count")
      .in("id", commentIds);

    const statsMap = new Map<string, { like_count: number; reply_count: number }>();
    if (statsData) {
      for (const s of statsData as Array<Record<string, unknown>>) {
        statsMap.set(s.id as string, {
          like_count: (s.like_count as number) || 0,
          reply_count: (s.reply_count as number) || 0,
        });
      }
    }

    let likedSet = new Set<string>();
    if (user) {
      const { data: likesData } = await supabase
        .from("comment_likes")
        .select("comment_id")
        .eq("user_id", user.id)
        .in("comment_id", commentIds);
      if (likesData) {
        likedSet = new Set((likesData as Array<Record<string, unknown>>).map((l) => l.comment_id as string));
      }
    }

    const formatted: Comment[] = parentData.map((c: Record<string, unknown>) => {
      const author = c.author as { nickname: string; avatar_url: string | null } | null;
      const st = statsMap.get(c.id as string) || { like_count: 0, reply_count: 0 };
      return {
        id: c.id as string,
        post_id: postId,
        user_id: c.user_id as string,
        content: c.content as string,
        created_at: c.created_at as string,
        parent_id: null,
        paragraph_index: paragraphIndex,
        author: {
          nickname: author?.nickname || "匿名用户",
          avatar_url: author?.avatar_url,
        },
        like_count: st.like_count,
        reply_count: st.reply_count,
        liked_by_me: likedSet.has(c.id as string),
      };
    });

    const sorted = [...formatted].sort((a, b) => {
      const top2 = formatted
        .filter((x) => (x.like_count || 0) >= 1)
        .sort((x, y) => (y.like_count || 0) - (x.like_count || 0))
        .slice(0, 2);
      const aTop2 = top2.some((t) => t.id === a.id);
      const bTop2 = top2.some((t) => t.id === b.id);
      if (aTop2 && !bTop2) return -1;
      if (!aTop2 && bTop2) return 1;
      if (aTop2 && bTop2) return (b.like_count || 0) - (a.like_count || 0);
      return new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime();
    });

    setComments(sorted);
    setLikedComments(likedSet);
    setLoading(false);

    // 预加载有回复的评论的楼中楼
    for (const c of sorted) {
      if (c.reply_count && c.reply_count > 0) {
        loadReplies(c.id);
      }
    }
  }, [postId, paragraphIndex, supabase, user]);

  useEffect(() => {
    if (open) {
      loadComments();
    } else {
      setComments([]);
      setCommentText("");
      setReplyTo(null);
      setReplyText("");
      setExpandedReplies(new Set());
    }
  }, [open, paragraphIndex, loadComments]);

  const submitComment = async () => {
    if (!user || !commentText.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: user.id,
      content: commentText.trim(),
      paragraph_index: paragraphIndex,
      parent_id: null,
    });
    if (!error) {
      setCommentText("");
      await loadComments();
      createNotification({
        type: "comment",
        actor_id: user.id,
        post_id: postId,
        content: commentText.trim(),
      });
    }
    setSubmitting(false);
  };

  const submitReply = async (parentComment: Comment) => {
    if (!user || !replyText.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: user.id,
      content: replyText.trim(),
      paragraph_index: paragraphIndex,
      parent_id: parentComment.id,
    });
    if (!error) {
      setReplyText("");
      setReplyTo(null);
      await loadComments();
      setExpandedReplies((prev) => new Set(prev).add(parentComment.id));
      createNotification({
        type: "reply",
        actor_id: user.id,
        post_id: postId,
        content: replyText.trim(),
      });
    }
    setSubmitting(false);
  };

  const toggleLike = async (commentId: string) => {
    if (!user) return;
    const isLiked = likedComments.has(commentId);
    if (isLiked) {
      await supabase.from("comment_likes").delete().eq("user_id", user.id).eq("comment_id", commentId);
      setLikedComments((prev) => { const next = new Set(prev); next.delete(commentId); return next; });
      setComments((prev) => prev.map((c) => {
        if (c.id === commentId) return { ...c, like_count: Math.max(0, (c.like_count || 0) - 1), liked_by_me: false };
        if (c.replies) return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, like_count: Math.max(0, (r.like_count || 0) - 1), liked_by_me: false } : r) };
        return c;
      }));
    } else {
      await supabase.from("comment_likes").insert({ user_id: user.id, comment_id: commentId });
      setLikedComments((prev) => new Set(prev).add(commentId));
      setComments((prev) => prev.map((c) => {
        if (c.id === commentId) return { ...c, like_count: (c.like_count || 0) + 1, liked_by_me: true };
        if (c.replies) return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, like_count: (r.like_count || 0) + 1, liked_by_me: true } : r) };
        return c;
      }));
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", user.id);
    if (!error) {
      await loadComments();
    }
  };

  const handleBlockUser = async (blockedUserId: string) => {
    if (!user) return;
    setBlockModal({ open: true, userId: blockedUserId });
  };

  const confirmBlockUser = async () => {
    if (!blockModal || !user) return;
    const { error } = await supabase.from("blocked_users").insert({
      user_id: user.id,
      blocked_user_id: blockModal.userId,
    });
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      showToast("操作失败: " + error.message);
      return;
    }
    setComments((prev) => prev.filter((c) => c.user_id !== blockModal.userId));
    setBlockModal(null);
    setCommentMenuId(null);
    showToast("屏蔽成功");
  };

  // 点击外部关闭更多菜单
  useEffect(() => {
    if (!commentMenuId) return;
    const handleClick = () => setCommentMenuId(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [commentMenuId]);

  // Escape 关闭屏蔽弹窗
  useEffect(() => {
    if (!blockModal?.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBlockModal(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [blockModal]);

  const loadReplies = async (commentId: string) => {
    const { data } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, parent_id, paragraph_index, author:profiles!comments_user_id_fkey(nickname, avatar_url)")
      .eq("parent_id", commentId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (data) {
      const replyIds = (data as Array<Record<string, unknown>>).map((r) => r.id as string);
      const { data: rStats } = await supabase
        .from("comment_stats")
        .select("id, like_count, reply_count")
        .in("id", replyIds);
      const rStatsMap = new Map<string, { like_count: number; reply_count: number }>();
      if (rStats) {
        for (const s of rStats as Array<Record<string, unknown>>) {
          rStatsMap.set(s.id as string, {
            like_count: (s.like_count as number) || 0,
            reply_count: (s.reply_count as number) || 0,
          });
        }
      }

      let rLikedSet = new Set<string>();
      if (user) {
        const { data: rLikes } = await supabase
          .from("comment_likes")
          .select("comment_id")
          .eq("user_id", user.id)
          .in("comment_id", replyIds);
        if (rLikes) {
          rLikedSet = new Set((rLikes as Array<Record<string, unknown>>).map((l) => l.comment_id as string));
        }
      }

      const replies: Comment[] = (data as Array<Record<string, unknown>>).map((r) => {
        const author = r.author as { nickname: string; avatar_url: string | null } | null;
        const st = rStatsMap.get(r.id as string) || { like_count: 0, reply_count: 0 };
        return {
          id: r.id as string,
          post_id: postId,
          user_id: r.user_id as string,
          content: r.content as string,
          created_at: r.created_at as string,
          parent_id: commentId,
          paragraph_index: paragraphIndex,
          author: {
            nickname: author?.nickname || "匿名用户",
            avatar_url: author?.avatar_url,
          },
          like_count: st.like_count,
          reply_count: st.reply_count,
          liked_by_me: rLikedSet.has(r.id as string),
        };
      });

      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, replies } : c));
    }
  };

  const toggleExpandReplies = (commentId: string) => {
    if (expandedReplies.has(commentId)) {
      setExpandedReplies((prev) => { const next = new Set(prev); next.delete(commentId); return next; });
    } else {
      setExpandedReplies((prev) => new Set(prev).add(commentId));
    }
  };

  const displayName = profile?.nickname || user?.email?.split("@")[0] || "?";
  const avatarChar = profile?.nickname?.[0] || user?.email?.[0] || "?";

  const textColor = darkMode ? "#d4c8b8" : "#2c2416";
  const mutedColor = darkMode ? "#8a8078" : "#8c7b6b";
  const borderColor = darkMode ? "#333" : "#e8e0d5";
  const inputBg = darkMode ? "#1a1a1a" : "#faf8f5";

  // 计算全局楼层号（按发布时间升序，最早发布=1楼，包含已展开的楼中楼）
  const floorMap = new Map<string, number>();
  const allItems: { id: string; created_at: string }[] = [];
  for (const c of comments) {
    allItems.push({ id: c.id, created_at: c.created_at || "" });
    if (expandedReplies.has(c.id) && c.replies) {
      for (const r of c.replies) {
        allItems.push({ id: r.id, created_at: r.created_at || "" });
      }
    }
  }
  allItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  allItems.forEach((item, i) => floorMap.set(item.id, i + 1));

  return (
    <div className="h-full flex flex-col" style={{ background: "inherit" }}>
      {/* 标题栏 - 使用设计稿的 CSS 类 */}
      <div className="para-comment-panel-header">
        <span className="para-comment-panel-title">
          评论 {comments.length}条
        </span>
        <button className="para-comment-panel-close" onClick={onClose}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* 评论列表 - 使用设计稿的 CSS 类 */}
      <div className="para-comment-panel-body">
        {loading ? (
          <div className="para-comment-panel-empty">
            <p>加载中...</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="para-comment-panel-empty">
            <p>还没有人发表评论</p>
            <p>来做第一个评论的人吧</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5" onMouseOver={handleCommentMouseOver} onMouseOut={handleCommentMouseOut}>
            {comments.map((c, idx) => (
              <div
                key={c.id}
                className="comment"
                data-comment-id={c.id}
              >
                <div className="comment-main">
                  <div className="comment-avatar">
                    <Link href={`/user/${c.user_id}`}>
                      {c.author?.avatar_url ? (
                        <img src={c.author.avatar_url} alt={c.author?.nickname || "?"} />
                      ) : (
                        <DefaultAvatar name={c.author?.nickname || "?"} className="comment-avatar-placeholder" />
                      )}
                    </Link>
                  </div>
                  <div className="comment-body">
                    <div className="comment-header">
                      <Link href={`/user/${c.user_id}`} className="comment-name">
                        {c.author?.nickname || "匿名用户"}
                      </Link>
                      <span className="comment-time">{getTimeAgo(c.created_at || "")}</span>
                    </div>
                    <p className="comment-text">{c.content}</p>
                    <div className="comment-actions">
                      <button
                        className={`comment-action-btn${c.liked_by_me ? " liked" : ""}`}
                        onClick={() => toggleLike(c.id)}
                      >
                        <i className={`fa-${c.liked_by_me ? "solid" : "regular"} fa-heart`} />
                        <span>{c.like_count || 0}</span>
                      </button>
                      <button
                        className="comment-action-btn"
                        onClick={() => { setReplyTo(c); setReplyText(""); }}
                      >
                        <i className="fa-regular fa-comment" />
                        <span>回复</span>
                      </button>
                      {user && c.user_id === user.id && (
                        <button
                          className="comment-action-btn-delete"
                          onClick={() => handleDeleteComment(c.id)}
                        >
                          <i className="fa-regular fa-trash-can" />
                        </button>
                      )}
                      <button
                        className="comment-more-btn"
                        style={{ opacity: hoveredCommentId === c.id ? 1 : 0 }}
                        title="更多"
                        onClick={(e) => { e.stopPropagation(); setCommentMenuId(commentMenuId === c.id ? null : c.id); }}
                      >
                        ⋮
                      </button>
                      {commentMenuId === c.id && (
                        <div className="comment-popup show">
                          <button
                            className="comment-popup-item"
                            onClick={(e) => { e.stopPropagation(); setCommentMenuId(null); if (onReport) onReport(c.id, c.user_id); }}
                          >
                            <i className="fa-regular fa-flag" /> 举报
                          </button>
                          <button
                            className="comment-popup-item"
                            onClick={(e) => { e.stopPropagation(); handleBlockUser(c.user_id); }}
                          >
                            <i className="fa-solid fa-ban" /> 屏蔽
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 回复输入框 */}
                    {replyTo?.id === c.id && (
                      <div className="inline-reply-area show">
                        <textarea
                          className="inline-reply-textarea"
                          placeholder={`回复 ${c.author?.nickname || "匿名用户"}...`}
                          rows={2}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          autoFocus
                        />
                        <div className="inline-reply-actions">
                          <button className="btn-cancel-reply" onClick={() => { setReplyTo(null); setReplyText(""); }}>
                            取消
                          </button>
                          <button
                            className="btn-submit-reply"
                            onClick={() => submitReply(c)}
                            disabled={submitting || !replyText.trim()}
                          >
                            <i className="fa-solid fa-paper-plane" /> 发布
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 展开回复 */}
                    {(c.reply_count || 0) > 0 && (
                      <div className="nested-replies">
                        {/* 显示回复列表（默认显示前3条，展开后显示全部） */}
                        {c.replies && c.replies.length > 0 && (
                          <>
                            {(expandedReplies.has(c.id) ? c.replies : c.replies.slice(0, 3)).map((reply, replyIdx, arr) => {
                              const isLast = replyIdx === arr.length - 1;
                              return (
                                <div
                                  key={reply.id}
                                  className="nested-reply-item"
                                  data-comment-id={reply.id}
                                >
                                  <div className="nested-reply-avatar">
                                    <Link href={`/user/${reply.user_id}`}>
                                      {reply.author?.avatar_url ? (
                                        <img src={reply.author.avatar_url} alt={reply.author?.nickname || "?"} />
                                      ) : (
                                        <DefaultAvatar name={reply.author?.nickname || "?"} className="nested-reply-avatar-placeholder" />
                                      )}
                                    </Link>
                                  </div>
                                  <div className="nested-reply-body">
                                    <div className="nested-reply-header">
                                      <Link href={`/user/${reply.user_id}`} className="nested-reply-name">
                                        {reply.author?.nickname || "匿名用户"}
                                      </Link>
                                      <span className="reply-to">回复 <Link href={`/user/${c.user_id}`}>@{c.author?.nickname || "匿名用户"}</Link></span>
                                      <span className="nested-reply-time">{getTimeAgo(reply.created_at || "")}</span>
                                    </div>
                                    <p className="nested-reply-text">{reply.content}</p>
                                    <div className="nested-reply-actions">
                                      <button
                                        className={`comment-action-btn${reply.liked_by_me ? " liked" : ""}`}
                                        onClick={() => toggleLike(reply.id)}
                                      >
                                        <i className={`fa-${reply.liked_by_me ? "solid" : "regular"} fa-heart`} />
                                        <span>{reply.like_count || 0}</span>
                                      </button>
                                      <button
                                        className="comment-action-btn"
                                        onClick={() => { setReplyTo(c); setReplyText(""); }}
                                      >
                                        <i className="fa-regular fa-comment" />
                                        <span>回复</span>
                                      </button>
                                      {user && reply.user_id === user.id && (
                                        <button
                                          className="comment-action-btn-delete"
                                          onClick={() => handleDeleteComment(reply.id)}
                                        >
                                          <i className="fa-regular fa-trash-can" />
                                        </button>
                                      )}
                                      <button
                                        className="comment-more-btn"
                                        style={{ opacity: hoveredCommentId === reply.id ? 1 : 0, marginLeft: 'auto' }}
                                        title="更多"
                                        onClick={(e) => { e.stopPropagation(); setCommentMenuId(commentMenuId === reply.id ? null : reply.id); }}
                                      >
                                        ⋮
                                      </button>
                                      {commentMenuId === reply.id && (
                                        <div className="comment-popup show">
                                          <button
                                            className="comment-popup-item"
                                            onClick={(e) => { e.stopPropagation(); setCommentMenuId(null); if (onReport) onReport(reply.id, reply.user_id); }}
                                          >
                                            <i className="fa-regular fa-flag" /> 举报
                                          </button>
                                          <button
                                            className="comment-popup-item"
                                            onClick={(e) => { e.stopPropagation(); handleBlockUser(reply.user_id); }}
                                          >
                                            <i className="fa-solid fa-ban" /> 屏蔽
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            
                            {/* 超过3条回复时显示展开/收起按钮 */}
                            {(c.reply_count || 0) > 3 && (
                              <button
                                className="nested-reply-toggle-btn"
                                onClick={() => toggleExpandReplies(c.id)}
                              >
                                {expandedReplies.has(c.id) ? (
                                  <>收起回复 <i className="fa-solid fa-chevron-up" /></>
                                ) : (
                                  <>展开全部{c.reply_count}条回复 <i className="fa-solid fa-chevron-down" /></>
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部输入框 - 使用设计稿的 CSS 类 */}
      <div className="para-comment-panel-input">
        {user ? (
          <div className="comment-avatar" style={{ width: 32, height: 32 }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <DefaultAvatar name={displayName} className="comment-avatar-placeholder" style={{ fontSize: 12 }} />
            )}
          </div>
        ) : null}
        <textarea
          placeholder={user ? "写下你的想法..." : "请先登录"}
          rows={1}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); }
          }}
          disabled={!user}
        />
        <button
          className="btn-submit"
          onClick={submitComment}
          disabled={!user || submitting || !commentText.trim()}
        >
          {submitting ? "..." : "发布"}
        </button>
      </div>

      {/* 屏蔽确认弹窗 */}
      <div className={`modal-overlay moderation-modal-overlay${blockModal?.open ? ' active' : ''}`} onClick={() => setBlockModal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">确认屏蔽</div>
          <div className="modal-body">
            <p>确定要屏蔽该用户吗？屏蔽后，该用户将无法与您产生任何互动。</p>
          </div>
          <div className="modal-actions">
            <button className="btn-modal btn-modal-cancel" onClick={() => setBlockModal(null)}>取消</button>
            <button className="btn-modal btn-modal-danger" onClick={confirmBlockUser}>确认屏蔽</button>
          </div>
        </div>
      </div>

      {/* Toast 提示 */}
      <div className={`toast${toastMessage ? ' show' : ''}`}>{toastMessage || ''}</div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}
