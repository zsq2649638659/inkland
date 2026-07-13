"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
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
  return [...matches].map((m) => m[1]);
}

export default function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [shareTip, setShareTip] = useState(false);

  const goToLogin = () => {
    router.push("/login");
  };

  // 计算纯文本摘要和图片
  const plainExcerpt = useMemo(() => {
    if (post.content) return stripMarkdown(post.content);
    if (post.excerpt) return stripMarkdown(post.excerpt);
    return "";
  }, [post.content, post.excerpt]);
  const contentImages = useMemo(() => {
    if (post.content) return extractImages(post.content);
    if (post.images) return post.images;
    return [];
  }, [post.content, post.images]);
  const hasCover = !!post.cover_url;
  // 内容中的图片（排除与 cover_url 重复的）
  const galleryImages = contentImages.filter((img) => !hasCover || img !== post.cover_url);

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
        author: { nickname: user.email?.split("@")[0] || "我", avatar_url: null },
      };
      setComments((prev) => [newComment, ...prev]);
      setCommentText("");
      setCommentCount((c) => c + 1);
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

  return (
    <article className="card p-4">
      <div className="flex items-start gap-3">
        {/* 左侧：头像 */}
        <Link href={`/user/${post.user_id}`} className="flex-shrink-0">
          <img
            src={post.author?.avatar_url || `https://placehold.co/40x40/f5e6d3/b8752e?text=${(post.author?.username || post.author?.nickname)?.[0] || "?"}`}
            className="w-10 h-10 rounded-full object-cover hover:opacity-80 transition-opacity"
            alt=""
          />
        </Link>

        {/* 右侧：内容区 */}
        <div className="flex-1 min-w-0">
          {/* 用户信息行 */}
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/user/${post.user_id}`} className="font-medium text-sm text-warm no-underline hover:text-accent">
              {post.author?.username || post.author?.nickname || "匿名用户"}
            </Link>
            <span className="text-xs text-muted">
              {post.time_ago || post.created_at ? getTimeAgo(post.created_at || "") : "刚刚"}
            </span>
            {post.word_count && post.word_count > 5000 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-light text-accent">
                万字长文
              </span>
            )}
          </div>

          {/* 标题（无标题时不显示） */}
          {post.title && post.title !== "无标题" && (
            <h2 className="mb-2">
              <Link
                href={`/read/${post.id}`}
                className="text-base font-bold text-warm no-underline hover:text-accent leading-snug line-clamp-2"
              >
                {post.title}
              </Link>
            </h2>
          )}

          {/* 摘要（纯文本，无 Markdown） */}
          {plainExcerpt && (
            <p className="text-sm text-muted leading-relaxed line-clamp-3 mb-3">
              {plainExcerpt}
            </p>
          )}

          {/* 多图横排展示 */}
          {galleryImages.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto">
              {galleryImages.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  className="feed-cover rounded-lg flex-shrink-0"
                  alt=""
                  loading="lazy"
                  style={{ height: "200px", width: "auto", maxWidth: "100%" }}
                />
              ))}
            </div>
          )}

          {/* 单图大图（封面图） */}
          {hasCover && galleryImages.length === 0 && (
            <Link href={`/read/${post.id}`} className="block mb-3">
              <img
                src={post.cover_url!}
                className="feed-cover rounded-lg flex-shrink-0"
                alt=""
                style={{ height: "200px", width: "auto", maxWidth: "100%" }}
              />
            </Link>
          )}

          {/* 标签 */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {post.tags.map((tag) => {
                const tagName = typeof tag === "string" ? tag : tag.name;
                return (
                  <Link key={tagName} href={`/tag/${tagName}`} className="tag">
                    {tagName}
                  </Link>
                );
              })}
            </div>
          )}

          {/* 底部互动栏 */}
          <div className="flex items-center gap-3 text-sm">
            <LikeButton postId={post.id} initialCount={post.like_count || 0} onLogin={goToLogin} />
            <button className="interact-btn" onClick={handleCommentClick}>
              <i className="fa-regular fa-comment mr-1" />
              {commentCount}
            </button>
            <BookmarkButton postId={post.id} initialCount={post.bookmark_count || 0} onLogin={goToLogin} />
            <div className="ml-auto relative">
              <button className="interact-btn" onClick={handleShare}>
                <i className="fa-regular fa-share-from-square" />
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
            <div className="mt-3 pt-3 border-t border-rule/50">
              {/* 输入框 */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="发一条友善的评论"
                  className="flex-1 px-3 py-2 text-sm border border-rule rounded-full bg-white text-warm font-sans focus:outline-none focus:border-accent"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitComment();
                    if (e.key === "Escape") setShowComment(false);
                  }}
                  autoFocus
                />
                <button
                  className="submit-btn text-sm px-4 py-2 rounded-full"
                  onClick={submitComment}
                  disabled={submitting || !commentText.trim()}
                >
                  {submitting ? "..." : "发送"}
                </button>
              </div>

              {/* 评论列表 */}
              {loadingComments ? (
                <p className="text-xs text-muted text-center py-3">加载中...</p>
              ) : comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <img
                        src={c.author?.avatar_url || `https://placehold.co/28x28/e8d5c8/8c6b4a?text=${(c.author?.nickname || "?")[0]}`}
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        alt=""
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-accent">
                            {c.author?.nickname || "匿名用户"}
                          </span>
                          <span className="text-[0.7rem] text-muted">
                            {getTimeAgo(c.created_at || "")}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5 leading-relaxed text-warm break-words">
                          {c.content}
                        </p>
                      </div>
                    </div>
                  ))}
                  {commentCount > 5 && (
                    <Link
                      href={`/read/${post.id}`}
                      className="btn-text text-xs py-1 inline-block no-underline"
                    >
                      查看全部 {commentCount} 条评论
                    </Link>
                  )}
                </div>
              ) : (
                <EmptyState icon="fa-comment-dots" title="暂无评论，来说点什么吧" compact />
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}