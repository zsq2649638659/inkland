"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DefaultAvatar from "@/components/DefaultAvatar";
import { createClient } from "@/lib/supabase/browser";
import type { Comment } from "@/lib/types";

interface InlineCommentPanelProps {
  postId: string;
  user: { id?: string; email?: string | null } | null;
  displayName: string;
  avatarUrl?: string | null;
  comments: Comment[];
  commentCount: number;
  commentText: string;
  loadingComments: boolean;
  submitting: boolean;
  onCommentTextChange: (value: string) => void;
  onSubmit: () => void;
  onReply?: (parentId: string, content: string, replyToName: string) => Promise<void>;
  onClose: () => void;
  onDelete?: (commentId: string) => Promise<void>;
  onReport?: (commentId: string, commentUserId: string) => void;
  onBlock?: (commentUserId: string) => void;
}

function getTimeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

function splitReplyContent(content: string) {
  const matched = content.match(/^@([^\s]+)\s+([\s\S]*)$/);
  return matched ? { replyTo: matched[1], content: matched[2] } : { replyTo: "", content };
}

export default function InlineCommentPanel({
  postId, user, displayName, avatarUrl, comments, commentCount, commentText, loadingComments, submitting,
  onCommentTextChange, onSubmit, onReply, onClose, onDelete, onReport, onBlock,
}: InlineCommentPanelProps) {
  const supabase = createClient();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [likeOverrides, setLikeOverrides] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [expandedReplyIds, setExpandedReplyIds] = useState<Set<string>>(new Set());
  const [commentSort, setCommentSort] = useState<"recent" | "hot">("hot");

  useEffect(() => {
    if (!menuId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest(".comment-popup") && !target.closest(".inline-comment-more")) setMenuId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [menuId]);

  return (
    <div className="inline-comment-panel comments-section" aria-label={`评论区，共${commentCount}条评论`}>
      {user ? (
        <div className="comment-input-area">
          <div className="comment-input-main">
            <textarea
              placeholder="写下你的想法..."
              className="comment-textarea"
              rows={3}
              value={commentText}
              onChange={(event) => onCommentTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onSubmit();
              }}
              autoFocus
            />
            <div className="comment-submit-row">
              <button className="btn-submit" onClick={onSubmit} disabled={submitting || !commentText.trim()}>
                <i className="fa-solid fa-paper-plane" /> {submitting ? "发布中" : "发布"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="inline-comment-login">
          <p><i className="fa-regular fa-message" /> 登录后参与评论</p>
          <Link href="/login" className="btn-submit no-underline"><i className="fa-solid fa-right-to-bracket" /> 登录</Link>
        </div>
      )}

      <div className="inline-comment-list-head">
        <div className="comment-main inline-comment-list-title">全部评论</div>
        <div className="inline-comment-sort" role="group" aria-label="评论排序">
          <button type="button" className={commentSort === "recent" ? "active" : ""} onClick={() => setCommentSort("recent")}>最新</button>
          <button type="button" className={commentSort === "hot" ? "active" : ""} onClick={() => setCommentSort("hot")}>最热</button>
        </div>
      </div>

      {loadingComments ? (
        <div className="para-comment-panel-empty">正在加载评论…</div>
      ) : comments.length === 0 ? (
        <div className="para-comment-panel-empty">
          <p>还没有人发表评论</p>
          <p>来做第一个评论的人吧</p>
        </div>
      ) : (
        <div className="inline-comment-list">
          {comments.filter((comment) => !comment.parent_id).sort((a, b) => {
            if (commentSort === "recent") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            const aLikes = likeOverrides[a.id]?.count ?? a.like_count ?? 0;
            const bLikes = likeOverrides[b.id]?.count ?? b.like_count ?? 0;
            const aReplies = Math.max(a.reply_count || 0, comments.filter((reply) => reply.parent_id === a.id).length);
            const bReplies = Math.max(b.reply_count || 0, comments.filter((reply) => reply.parent_id === b.id).length);
            return (bLikes + bReplies) - (aLikes + aReplies) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }).map((comment) => (
            <div key={comment.id} className="comment" data-comment-id={comment.id}>
              <div className="comment-main">
                <div className="comment-avatar">
                  {comment.author?.avatar_url ? <img src={comment.author.avatar_url} alt={comment.author.nickname || "?"} /> : <DefaultAvatar name={comment.author?.nickname || "?"} className="comment-avatar-placeholder" />}
                </div>
                <div className="comment-body">
                  <div className="comment-header">
                    <span className="comment-name">{comment.author?.nickname || "匿名用户"}</span>
                    <span className="comment-time">{getTimeAgo(comment.created_at || "")}</span>
                  </div>
                  <p className="comment-text">{comment.content}</p>
                  <div className="comment-actions">
                    <button className={`comment-action-btn ${(likeOverrides[comment.id]?.liked ?? comment.liked_by_me) ? "liked" : ""}`} onClick={async () => {
                      if (!user?.id) return;
                      const liked = likeOverrides[comment.id]?.liked ?? !!comment.liked_by_me;
                      const currentCount = likeOverrides[comment.id]?.count ?? comment.like_count ?? 0;
                      if (liked) await supabase.from("comment_likes").delete().eq("comment_id", comment.id).eq("user_id", user.id);
                      else await supabase.from("comment_likes").insert({ comment_id: comment.id, user_id: user.id });
                      setLikeOverrides((current) => ({ ...current, [comment.id]: { liked: !liked, count: Math.max(0, currentCount + (liked ? -1 : 1)) } }));
                    }} aria-label="喜欢"><i className={`${(likeOverrides[comment.id]?.liked ?? comment.liked_by_me) ? "fa-solid" : "fa-regular"} fa-heart`} /> {likeOverrides[comment.id]?.count ?? comment.like_count ?? 0}</button>
                    <button className="comment-action-btn" aria-label="回复" onClick={() => { setReplyingTo(replyingTo === comment.id ? null : comment.id); setReplyText(""); }}><i className="fa-regular fa-comment-dots" /> {Math.max(comment.reply_count || 0, comments.filter((reply) => reply.parent_id === comment.id).length)}</button>
                    <button
                      className="comment-more-btn inline-comment-more"
                      title="更多"
                      aria-label="评论更多操作"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuId(menuId === comment.id ? null : comment.id);
                      }}
                    >⋮</button>
                    {menuId === comment.id && (
                      <div className="comment-popup show">
                        {user?.id === comment.user_id ? (
                          <button className="comment-popup-item" onPointerDown={(event) => event.stopPropagation()} onClick={async (event) => { event.stopPropagation(); await onDelete?.(comment.id); setMenuId(null); }}><i className="fa-solid fa-trash-can" /> 删除</button>
                        ) : <>
                          <button className="comment-popup-item" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onBlock?.(comment.user_id); setMenuId(null); }}><i className="fa-solid fa-ban" /> 屏蔽</button>
                          <button className="comment-popup-item" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onReport?.(comment.id, comment.user_id); setMenuId(null); }}><i className="fa-solid fa-flag" /> 举报</button>
                        </>}
                      </div>
                    )}
                  </div>
                  {replyingTo === comment.id && (
                    <div className="inline-reply-composer inline-reply-area show">
                      <textarea className="inline-reply-textarea" value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder={`回复 ${comment.author?.nickname || "匿名用户"}...`} rows={2} autoFocus />
                      <div className="inline-reply-actions">
                        <button type="button" className="btn-cancel-reply" onClick={() => { setReplyingTo(null); setReplyText(""); }}>取消</button>
                        <button type="button" className="btn-submit-reply" disabled={!replyText.trim()} onClick={async () => { await onReply?.(comment.id, replyText.trim(), comment.author?.nickname || "匿名用户"); setReplyText(""); setReplyingTo(null); }}><i className="fa-solid fa-paper-plane" /> 回复</button>
                      </div>
                    </div>
                  )}
                  <div className="nested-comment-list nested-replies">
                    {(() => {
                      const replies = comments.filter((reply) => reply.parent_id === comment.id);
                      const expanded = expandedReplyIds.has(comment.id);
                      const visibleReplies = expanded ? replies : replies.slice(0, 3);
                      return <>
                    {visibleReplies.map((reply) => {
                      const replyContent = splitReplyContent(reply.content);
                      return <div className="nested-comment" id={`comment-${reply.id}`} key={reply.id}>
                        <div className="comment-avatar">{reply.author?.avatar_url ? <img src={reply.author.avatar_url} alt={reply.author.nickname || "?"} /> : <DefaultAvatar name={reply.author?.nickname || "?"} className="comment-avatar-placeholder" />}</div>
                        <div className="comment-body">
                          <div className="comment-header"><span className="comment-name">{reply.author?.nickname || "匿名用户"}</span>{replyContent.replyTo && <><span className="comment-reply-label">回复</span><span className="comment-mention">@{replyContent.replyTo}</span></>}<span className="comment-time">{getTimeAgo(reply.created_at)}</span></div>
                          <p className="comment-text">{replyContent.content}</p>
                          <div className="comment-actions">
                            <button className={`comment-action-btn ${(likeOverrides[reply.id]?.liked ?? reply.liked_by_me) ? "liked" : ""}`} aria-label="喜欢" onClick={async () => { if (!user?.id) return; const liked = likeOverrides[reply.id]?.liked ?? !!reply.liked_by_me; const currentCount = likeOverrides[reply.id]?.count ?? reply.like_count ?? 0; if (liked) await supabase.from("comment_likes").delete().eq("comment_id", reply.id).eq("user_id", user.id); else await supabase.from("comment_likes").insert({ comment_id: reply.id, user_id: user.id }); setLikeOverrides((current) => ({ ...current, [reply.id]: { liked: !liked, count: Math.max(0, currentCount + (liked ? -1 : 1)) } })); }}><i className={`${(likeOverrides[reply.id]?.liked ?? reply.liked_by_me) ? "fa-solid" : "fa-regular"} fa-heart`} /> {likeOverrides[reply.id]?.count ?? reply.like_count ?? 0}</button>
                            <button className="comment-action-btn" aria-label="回复" onClick={() => { setReplyingTo(replyingTo === reply.id ? null : reply.id); setReplyText(""); }}><i className="fa-regular fa-comment-dots" /> {reply.reply_count || 0}</button>
                            <button className="comment-more-btn inline-comment-more" title="更多" aria-label="回复更多操作" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setMenuId(menuId === reply.id ? null : reply.id); }}>⋮</button>
                            {menuId === reply.id && <div className="comment-popup show">{user?.id === reply.user_id ? <button className="comment-popup-item" onClick={async () => { await onDelete?.(reply.id); setMenuId(null); }}><i className="fa-solid fa-trash-can" /> 删除</button> : <><button className="comment-popup-item" onClick={() => { onBlock?.(reply.user_id); setMenuId(null); }}><i className="fa-solid fa-ban" /> 屏蔽</button><button className="comment-popup-item" onClick={() => { onReport?.(reply.id, reply.user_id); setMenuId(null); }}><i className="fa-solid fa-flag" /> 举报</button></>}</div>}
                          </div>
                          {replyingTo === reply.id && <div className="inline-reply-composer inline-reply-area show"><textarea className="inline-reply-textarea" value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder={`回复 ${reply.author?.nickname || "匿名用户"}...`} rows={2} autoFocus /><div className="inline-reply-actions"><button type="button" className="btn-cancel-reply" onClick={() => { setReplyingTo(null); setReplyText(""); }}>取消</button><button type="button" className="btn-submit-reply" disabled={!replyText.trim()} onClick={async () => { await onReply?.(comment.id, replyText.trim(), reply.author?.nickname || "匿名用户"); setReplyText(""); setReplyingTo(null); }}><i className="fa-solid fa-paper-plane" /> 回复</button></div></div>}
                        </div>
                      </div>;
                    })}
                    {!expanded && replies.length > 3 && <button type="button" className="nested-comment-expand" onClick={() => setExpandedReplyIds((current) => new Set(current).add(comment.id))}>展开评论<i className="fa-solid fa-chevron-down" /></button>}
                      </>;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
