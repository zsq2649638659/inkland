"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

interface FollowUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
}

interface UserCardProps {
  user: FollowUser;
  currentUserId: string;
  /** true = 关注tab, false = 粉丝tab */
  isFollowingTab: boolean;
  /** 是否已关注该用户 */
  isFollowed?: boolean;
  onUpdate: () => void;
}

export default function UserCard({ user, currentUserId, isFollowingTab, isFollowed, onUpdate }: UserCardProps) {
  const supabase = createClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭popup
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.btn-block')) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [moreOpen]);

  const handleUnfollow = async () => {
    const { error } = await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", user.id);
    if (!error) onUpdate();
  };

  const handleBlock = async () => {
    setMoreOpen(false);
    if (!confirm("确定要屏蔽该用户吗？屏蔽后你将不再看到该用户的评论和作品。")) return;
    const { error } = await supabase.from("blocked_users").insert({
      user_id: currentUserId,
      blocked_user_id: user.id,
    });
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      alert("操作失败: " + error.message);
      return;
    }
    onUpdate();
    alert("已屏蔽该用户");
  };

  const handleReport = async () => {
    setMoreOpen(false);
    const reason = prompt("请填写举报原因：");
    if (!reason || !reason.trim()) return;
    const { error } = await supabase.from("content_reports").insert({
      reporter_id: currentUserId,
      target_type: "user",
      target_id: user.id,
      reason: reason.trim(),
    });
    alert(error ? "举报提交失败，请稍后重试。" : "举报已提交，管理员会尽快处理。");
  };

  // 按钮文字
  const btnText = isFollowingTab ? "取消关注" : (isFollowed ? "取消关注" : "回关");

  return (
    <div className={`user-card${moreOpen ? " show-popup" : ""}`}>
      <Link href={`/user/${user.id}`} className="no-underline" style={{ display: 'flex', alignItems: 'center', gap: 'inherit', flex: 1, minWidth: 0 }}>
        <div className="user-avatar" style={user.avatar_url ? undefined : { background: 'linear-gradient(135deg, #F26B5B, #E8877A)' }}>
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" />
          ) : (
            user.nickname?.[0] || "?"
          )}
        </div>
        <div className="user-info">
          <div className="user-name">{user.nickname}</div>
          {user.bio && <div className="user-bio">{user.bio}</div>}
        </div>
      </Link>
      <div className="user-actions">
        <button className={`btn-follow${isFollowed || isFollowingTab ? " followed" : ""}`} onClick={handleUnfollow}>
          {btnText}
        </button>
        <button className="btn-block" onClick={(e) => { e.stopPropagation(); setMoreOpen(!moreOpen); }} title="更多">
          <i className="fa-solid fa-ellipsis-vertical"></i>
        </button>
        <div className={`user-action-popup${moreOpen ? " show" : ""}`} ref={popupRef}>
          <button className="user-action-popup-item" onClick={handleBlock}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>屏蔽
          </button>
          <button className="user-action-popup-item" onClick={handleReport}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>举报
          </button>
        </div>
      </div>
    </div>
  );
}
