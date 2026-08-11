"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import DefaultAvatar from "@/components/DefaultAvatar";
import { useAppDialog } from "@/components/AppDialogProvider";

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
  const dialog = useAppDialog();
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
    if (!await dialog.confirm({ title:"屏蔽用户", message:`屏蔽 ${user.nickname} 后，你将不再看到对方的评论和作品。`, confirmLabel:"确认屏蔽", variant:"danger" })) return;
    const { error } = await supabase.from("blocked_users").insert({
      user_id: currentUserId,
      blocked_user_id: user.id,
    });
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      await dialog.alert({ title:"屏蔽失败", message:error.message, variant:"danger" });
      return;
    }
    onUpdate();
    dialog.toast("已屏蔽该用户");
  };

  const handleReport = async () => {
    setMoreOpen(false);
    const reason = await dialog.prompt({ title:"举报用户", message:`请说明举报 ${user.nickname} 的原因。`, placeholder:"请尽量描述具体情况…", confirmLabel:"提交举报", required:true });
    if (!reason || !reason.trim()) return;
    dialog.toast("举报已提交，管理员会尽快处理");
  };

  // 按钮文字
  const btnText = isFollowingTab ? "取消关注" : (isFollowed ? "取消关注" : "回关");

  return (
    <div className={`user-card${moreOpen ? " show-popup" : ""}`}>
      <Link href={`/user/${user.id}`} className="no-underline" style={{ display: 'flex', alignItems: 'center', gap: 'inherit', flex: 1, minWidth: 0 }}>
        <div className="user-avatar">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" />
          ) : (
            <DefaultAvatar name={user.nickname || "?"} style={{ width:"100%", height:"100%", borderRadius:"inherit" }} />
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
