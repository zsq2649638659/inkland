"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { useAppDialog } from "@/components/AppDialogProvider";
import { createNotification } from "@/lib/notifications";
import { assertCanInteract } from "@/lib/userRestrictions";

interface BookmarkButtonProps {
  postId: string;
  initialCount: number;
  onLogin?: () => void;
  iconOnly?: boolean;
  plain?: boolean;
  className?: string;
  // 父组件已算好的收藏状态；传入时跳过挂载时的独立查询（消除信息流 N+1）
  initialActive?: boolean;
}

export default function BookmarkButton({ postId, initialCount, onLogin, iconOnly, plain, className, initialActive }: BookmarkButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const { user } = useAuth();
  const dialog = useAppDialog();
  const [bookmarked, setBookmarked] = useState(initialActive ?? false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || initialActive !== undefined) return;
    supabase
      .from("bookmarks")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => setBookmarked(!!data));
  }, [user, postId, initialActive]);

  const toggle = async () => {
    if (!user) {
      if (onLogin) onLogin();
      else router.push("/login");
      return;
    }
    if (loading) return;
    setLoading(true);

    if (bookmarked) {
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      if (!error) {
        setBookmarked(false);
        setCount((c) => Math.max(0, c - 1));
      }
    } else {
      const blocked = await assertCanInteract();
      if (blocked) {
        setLoading(false);
        dialog.toast(blocked, "danger");
        return;
      }
      const { error } = await supabase
        .from("bookmarks")
        .insert({ post_id: postId, user_id: user.id });
      if (!error) {
        setBookmarked(true);
        setCount((c) => c + 1);
        createNotification({
          type: "bookmark",
          actor_id: user.id,
          post_id: postId,
        });
      }
    }
    setLoading(false);
  };

  if (iconOnly) {
    if (plain) {
      return (
        <button className={`stat-item ${className || ""}`} title="收藏" onClick={toggle} disabled={loading}>
          <i className={`${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark`} style={bookmarked ? { color: "var(--color-primary, #F26B5B)" } : undefined} />
          <span>{count}</span>
        </button>
      );
    }
    return (
      <button className="rs-btn" title="收藏" onClick={toggle} disabled={loading}>
        <i className={`${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark`} style={bookmarked ? { color: "#F26B5B" } : undefined} />
      </button>
    );
  }

  return (
    <button
      className={`card-action ${bookmarked ? "liked" : ""}`}
      onClick={toggle}
      disabled={loading}
    >
      <i className={`${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark`} />
      <span>{count}</span>
    </button>
  );
}
