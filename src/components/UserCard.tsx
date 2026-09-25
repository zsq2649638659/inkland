"use client";
import SiteIcon from "@/components/SiteIcon";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import DefaultAvatar from "@/components/DefaultAvatar";
import Checkbox from "@/components/inkland/Checkbox";
import { useAppDialog } from "@/components/AppDialogProvider";
import { submitReportV1 } from "@/lib/reportContent";
import ModerationReasonModal from "@/components/ModerationReasonModal";

interface FollowUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  show_profile_info?: boolean;
}

interface UserCardProps {
  user: FollowUser;
  currentUserId: string;
  variant?: "relationship" | "blocked";
  blockedRecordId?: string;
  /** true = 关注tab, false = 粉丝tab */
  isFollowingTab: boolean;
  /** 是否已关注该用户 */
  isFollowed?: boolean;
  /** 是否显示批量操作复选框 */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onUpdate: () => void;
}

export default function UserCard({ user, currentUserId, variant = "relationship", blockedRecordId, isFollowingTab, isFollowed, selectable = false, selected = false, onToggleSelect, onUpdate }: UserCardProps) {
  const supabase = createClient();
  const dialog = useAppDialog();
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [relationshipActionLoading, setRelationshipActionLoading] = useState(false);
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

  const handleRelationshipAction = async () => {
    if (relationshipActionLoading) return;
    if (variant === "blocked") {
      if (!blockedRecordId) return;
      setRelationshipActionLoading(true);
      try {
        const { error } = await supabase
          .from("blocked_users")
          .delete()
          .eq("id", blockedRecordId)
          .eq("user_id", currentUserId);
        if (error) throw error;
        onUpdate();
        dialog.toast("已取消屏蔽");
      } catch (actionError) {
        await dialog.alert({
          title: "取消屏蔽失败",
          message: actionError instanceof Error && actionError.message ? actionError.message : "请稍后重试。",
          variant: "danger",
        });
      } finally {
        setRelationshipActionLoading(false);
      }
      return;
    }
    const shouldUnfollow = isFollowingTab || Boolean(isFollowed);
    setRelationshipActionLoading(true);
    try {
      const result = shouldUnfollow
        ? await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", user.id)
        : await supabase.from("follows").insert({ follower_id: currentUserId, following_id: user.id });
      if (result.error) throw result.error;
      onUpdate();
      dialog.toast(shouldUnfollow ? "已取消关注" : "已回关");
    } catch (actionError) {
      await dialog.alert({
        title: shouldUnfollow ? "取消关注失败" : "回关失败",
        message: actionError instanceof Error && actionError.message ? actionError.message : "请稍后重试。",
        variant: "danger",
      });
    } finally {
      setRelationshipActionLoading(false);
    }
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

  const handleReport = () => {
    setMoreOpen(false);
    setReportOpen(true);
  };

  const submitReport = async (reason: string, details?: string) => {
    setReportSubmitting(true);
    const result = await submitReportV1(supabase, { targetType: "user", targetId: user.id, reason, details });
    setReportSubmitting(false);
    if (!result.ok) { await dialog.alert({ title: "举报失败", message: result.message, variant: "danger" }); return; }
    setReportOpen(false);
    dialog.toast(result.message);
  };

  // 按钮文字
  const shouldUnfollow = variant === "blocked" || isFollowingTab || Boolean(isFollowed);
  const btnText = relationshipActionLoading ? "处理中…" : variant === "blocked" ? "取消屏蔽" : shouldUnfollow ? "取消关注" : "回关";

  return (
    <div
      className={`user-card${moreOpen ? " show-popup" : ""}${selectable ? " user-card--selectable" : ""}${selected ? " selected" : ""}${variant === "blocked" ? " user-card--blocked" : ""}`}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-pressed={selectable ? selected : undefined}
      onClick={selectable ? () => onToggleSelect?.() : undefined}
      onKeyDown={selectable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleSelect?.();
        }
      } : undefined}
    >
      {selectable && (
        <Checkbox
          as="span"
          className="user-card-check"
          checked={selected}
          aria-label={`选择用户：${user.nickname}`}
          onChange={() => onToggleSelect?.()}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      <Link href={`/user/${user.id}`} className="no-underline" aria-disabled={selectable || undefined} onClick={selectable ? (event) => event.preventDefault() : undefined} style={{ display: 'flex', alignItems: 'center', gap: 'inherit', flex: 1, minWidth: 0 }}>
        <div className="user-avatar">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" />
          ) : (
            <DefaultAvatar name={user.nickname || "?"} style={{ width:"100%", height:"100%", borderRadius:"inherit" }} />
          )}
        </div>
        <div className="user-info">
          <div className="user-name">{user.nickname}</div>
          {user.show_profile_info !== false && user.bio && <div className="user-bio">{user.bio}</div>}
        </div>
      </Link>
      <div className="user-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={`btn-follow${shouldUnfollow ? " followed" : ""}`}
          disabled={relationshipActionLoading}
          aria-busy={relationshipActionLoading}
          onClick={() => void handleRelationshipAction()}
        >
          {btnText}
        </button>
        {variant === "relationship" && (
          <>
            <button className="btn-block" onClick={(e) => { e.stopPropagation(); setMoreOpen(!moreOpen); }} title="更多" aria-label="更多">
              <SiteIcon name="fa-ellipsis-vertical" variant="solid" />
            </button>
            <div className={`user-action-popup${moreOpen ? " show" : ""}`} ref={popupRef}>
              <button
                type="button"
                className="user-action-popup-item relationship-action-popup-item"
                disabled={relationshipActionLoading}
                aria-busy={relationshipActionLoading}
                onClick={() => { setMoreOpen(false); void handleRelationshipAction(); }}
              >
                <SiteIcon name={shouldUnfollow ? "fa-user-minus" : "fa-user-plus"} variant="outline" hoverVariant="solid" />{btnText}
              </button>
              <button className="user-action-popup-item" onClick={handleBlock}>
                <SiteIcon name="fa-action-forbid" variant="outline" hoverVariant="solid" />屏蔽
              </button>
              <button className="user-action-popup-item" onClick={handleReport}>
                <SiteIcon name="fa-flag" variant="outline" hoverVariant="solid" />举报
              </button>
            </div>
          </>
        )}
      </div>
      <ModerationReasonModal
        open={reportOpen}
        mode="report"
        submitting={reportSubmitting}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport}
      />
    </div>
  );
}
