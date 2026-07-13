"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import EmojiPicker from "@/components/EmojiPicker";
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
      const comment = comments.find((c) => c.id === commentId);
      if (comment && !comment.replies) {
        loadReplies(commentId);
      }
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
    <div
      className="h-full flex flex-col"
      style={{ background: "inherit" }}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderColor }}
      >
        <span className="text-sm font-semibold" style={{ color: textColor }}>
          评论 {comments.length}条
        </span>
        <button
          className="w-6 h-6 rounded-full border-none flex items-center justify-center cursor-pointer text-xs bg-transparent hover:opacity-70"
          style={{ color: mutedColor }}
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* 分割线 */}
      <div className="border-b mx-4" style={{ borderColor }} />

      {/* 评论列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-sm text-center py-8" style={{ color: mutedColor }}>加载中...</p>
        ) : comments.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: mutedColor }}>还没有人发表评论</p>
            <p className="text-xs mt-1" style={{ color: mutedColor }}>来做第一个评论的人吧</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {comments.map((c, idx) => (
              <div
                key={c.id}
                className="pb-3.5 border-b"
                style={{ borderColor }}
                onMouseEnter={() => setHoveredCommentId(c.id)}
                onMouseLeave={() => setHoveredCommentId(null)}
              >
                <div className="flex gap-2.5">
                  <Link href={`/user/${c.user_id}`}>
                    <img
                      src={c.author?.avatar_url || `https://placehold.co/28x28/e8d5c8/8c6b4a?text=${(c.author?.nickname || "?")[0]}`}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                      alt=""
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/user/${c.user_id}`}
                        className="text-sm font-medium no-underline hover:opacity-80"
                        style={{ color: textColor }}
                      >
                        {c.author?.nickname || "匿名用户"}
                      </Link>
                      {onReport && hoveredCommentId === c.id && (
                        <button
                          className="ml-auto text-[0.65rem] bg-transparent border-none cursor-pointer hover:opacity-70"
                          style={{ color: mutedColor }}
                          onClick={(e) => { e.stopPropagation(); onReport(c.id, c.user_id); }}
                        >
                          <i className="fa-solid fa-flag mr-1 text-[0.6rem]" />举报
                        </button>
                      )}
                    </div>
                    <p className="text-sm mt-1.5 leading-relaxed" style={{ color: textColor }}>
                      {c.content}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded" style={{ background: darkMode ? "#333" : "#f5f0ea", color: mutedColor }}>
                        {floorMap.get(c.id) || 0}楼
                      </span>
                      <span className="text-xs" style={{ color: mutedColor }}>
                        {getTimeAgo(c.created_at || "")}
                      </span>
                      <button
                        className="flex items-center gap-1 text-xs bg-transparent border-none cursor-pointer hover:opacity-80"
                        style={{ color: darkMode ? "#8a8078" : "#3B82F6" }}
                        onClick={() => { setReplyTo(c); setReplyText(""); }}
                      >
                        <i className="fa-regular fa-comment text-[0.7rem]" />
                        <span>回复</span>
                      </button>
                      <button
                        className="flex items-center gap-1 text-xs bg-transparent border-none cursor-pointer hover:opacity-80 ml-auto"
                        style={{ color: c.liked_by_me ? "#e74c3c" : mutedColor }}
                        onClick={() => toggleLike(c.id)}
                      >
                        <i className={`fa-${c.liked_by_me ? "solid" : "regular"} fa-heart text-[0.7rem]`} />
                        <span>{c.like_count || 0}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {replyTo?.id === c.id && (
                  <div className="mt-2 ml-9 flex gap-2">
                    <img
                      src={profile?.avatar_url || `https://placehold.co/24x24/e8d5c8/8c6b4a?text=${encodeURIComponent(avatarChar)}`}
                      className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-1"
                      alt=""
                    />
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        placeholder={`回复 ${c.author?.nickname || "匿名用户"}...`}
                        className="flex-1 px-2.5 py-1.5 border rounded-lg text-xs font-sans"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") submitReply(c); }}
                        autoFocus
                        style={{ borderColor, background: inputBg, color: textColor }}
                      />
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white border-none cursor-pointer flex-shrink-0"
                        onClick={() => submitReply(c)}
                        disabled={submitting || !replyText.trim()}
                      >
                        {submitting ? "..." : "发送"}
                      </button>
                    </div>
                  </div>
                )}

                {(c.reply_count || 0) > 0 && (
                  <div className="mt-2 ml-9">
                    <button
                      className="text-xs bg-transparent border-none cursor-pointer hover:opacity-80"
                      style={{ color: mutedColor }}
                      onClick={() => toggleExpandReplies(c.id)}
                    >
                      <i className={`fa-solid fa-chevron-${expandedReplies.has(c.id) ? "up" : "down"} mr-1 text-[0.6rem]`} />
                      {expandedReplies.has(c.id) ? "收起" : `展示${c.reply_count}条回复`}
                    </button>

                    {expandedReplies.has(c.id) && c.replies && c.replies.length > 0 && (
                      <div
                        className="mt-2 rounded-lg px-3 py-2 space-y-3"
                        style={{ background: darkMode ? "#222" : "#f5f5f5" }}
                      >
                        {c.replies.map((reply) => {
                          const replyFloor = floorMap.get(reply.id) || 0;
                          return (
                            <div
                              key={reply.id}
                              onMouseEnter={() => setHoveredCommentId(reply.id)}
                              onMouseLeave={() => setHoveredCommentId(null)}
                            >
                              {/* Row 1: 头像 + 昵称 */}
                              <div className="flex items-center gap-2">
                                <Link href={`/user/${reply.user_id}`}>
                                  <img
                                    src={reply.author?.avatar_url || `https://placehold.co/28x28/e8d5c8/8c6b4a?text=${(reply.author?.nickname || "?")[0]}`}
                                    className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                    alt=""
                                  />
                                </Link>
                                <Link
                                  href={`/user/${reply.user_id}`}
                                  className="text-sm font-medium no-underline hover:opacity-80"
                                  style={{ color: textColor }}
                                >
                                  {reply.author?.nickname || "匿名用户"}
                                </Link>
                                {onReport && hoveredCommentId === reply.id && (
                                  <button
                                    className="ml-auto text-xs bg-transparent border-none cursor-pointer hover:opacity-70"
                                    style={{ color: mutedColor }}
                                    onClick={(e) => { e.stopPropagation(); onReport(reply.id, reply.user_id); }}
                                  >
                                    <i className="fa-solid fa-flag mr-1 text-[0.7rem]" />举报
                                  </button>
                                )}
                              </div>

                              {/* Row 2: 评论内容 */}
                              <p className="text-sm mt-1 leading-relaxed" style={{ color: textColor }}>
                                {reply.content}
                              </p>

                              {/* Row 3: 楼层 + 时间 + 回复 + 点赞 */}
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[0.6rem] px-1.5 py-0.5 rounded" style={{ background: darkMode ? "#333" : "#f5f0ea", color: mutedColor }}>
                                  {replyFloor}楼
                                </span>
                                <span className="text-xs" style={{ color: mutedColor }}>
                                  {getTimeAgo(reply.created_at || "")}
                                </span>
                                <button
                                  className="flex items-center gap-1 text-xs bg-transparent border-none cursor-pointer hover:opacity-80"
                                  style={{ color: darkMode ? "#8a8078" : "#3B82F6" }}
                                  onClick={() => { setReplyTo(c); setReplyText(""); }}
                                >
                                  <i className="fa-regular fa-comment text-[0.7rem]" />
                                  <span>回复</span>
                                </button>
                                <button
                                  className="flex items-center gap-1 text-xs bg-transparent border-none cursor-pointer hover:opacity-80 ml-auto"
                                  style={{ color: reply.liked_by_me ? "#e74c3c" : mutedColor }}
                                  onClick={() => toggleLike(reply.id)}
                                >
                                  <i className={`fa-${reply.liked_by_me ? "solid" : "regular"} fa-heart text-[0.7rem]`} />
                                  <span>{reply.like_count || 0}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部输入框 */}
      <div
        className="flex gap-2.5 px-4 py-3 border-t flex-shrink-0"
        style={{ borderColor }}
      >
        {user ? (
          <img
            src={profile?.avatar_url || `https://placehold.co/32x32/e8d5c8/8c6b4a?text=${encodeURIComponent(avatarChar)}`}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            alt=""
          />
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: darkMode ? "#333" : "#f5f0ea", color: mutedColor }}>
            <i className="fa-solid fa-user text-xs" />
          </div>
        )}
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder={user ? "写下你的想法..." : "请先登录"}
            className="flex-1 px-3 py-2 border rounded-lg text-sm font-sans"
            disabled={!user}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitComment();
            }}
            style={{ borderColor, background: inputBg, color: textColor }}
          />
          <button
            className="text-sm px-4 py-2 rounded-lg bg-accent text-white border-none cursor-pointer flex-shrink-0 disabled:opacity-50"
            onClick={submitComment}
            disabled={!user || submitting || !commentText.trim()}
          >
            {submitting ? "..." : "发送"}
          </button>
        </div>
      </div>
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