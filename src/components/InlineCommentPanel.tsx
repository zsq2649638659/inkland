"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import DefaultAvatar from "@/components/DefaultAvatar";
import type { Comment } from "@/lib/types";

interface InlineCommentPanelProps {
  postId: string;
  user: { email?: string | null } | null;
  displayName: string;
  avatarUrl?: string | null;
  comments: Comment[];
  commentCount: number;
  commentText: string;
  loadingComments: boolean;
  submitting: boolean;
  onCommentTextChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
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

export default function InlineCommentPanel({
  postId, user, displayName, avatarUrl, comments, commentCount, commentText, loadingComments, submitting,
  onCommentTextChange, onSubmit, onClose, onReport, onBlock,
}: InlineCommentPanelProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const commentMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!commentMenuRef.current?.contains(event.target as Node)) setMenuId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [menuId]);

  return (
    <div className="inline-comment-panel comments-section" aria-label="评论区">
      {user ? (
        <div className="comment-input-area">
          <div className="comment-input-avatar">
            {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <DefaultAvatar name={displayName} className="avatar" style={{ width: 56, height: 56 }} />}
          </div>
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
              <span className="inline-comment-hint">Ctrl / ⌘ + Enter 发布 · Esc 关闭</span>
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

      {loadingComments ? (
        <div className="para-comment-panel-empty">正在加载评论…</div>
      ) : comments.length === 0 ? (
        <div className="para-comment-panel-empty">
          <p>还没有人发表评论</p>
          <p>来做第一个评论的人吧</p>
        </div>
      ) : (
        <div className="inline-comment-list">
          {comments.map((comment) => (
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
                  <div className="comment-actions" ref={menuId === comment.id ? commentMenuRef : undefined}>
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
                        <button
                          className="comment-popup-item"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => { event.stopPropagation(); onBlock?.(comment.user_id); setMenuId(null); }}
                        >
                          <i className="fa-solid fa-ban" /> 屏蔽
                        </button>
                        <button
                          className="comment-popup-item"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => { event.stopPropagation(); onReport?.(comment.id, comment.user_id); setMenuId(null); }}
                        >
                          <i className="fa-solid fa-flag" /> 举报
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {commentCount > comments.length && <Link href={`/read/${postId}#comments`} className="btn-text inline-block no-underline">查看全部 {commentCount} 条评论</Link>}
        </div>
      )}
    </div>
  );
}
