"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { useAppDialog } from "@/components/AppDialogProvider";
import { createNotification } from "@/lib/notifications";
import { assertCanInteract } from "@/lib/userRestrictions";

interface LikeButtonProps {
  postId: string;
  initialCount: number;
  onLogin?: () => void;
  iconOnly?: boolean;
  plain?: boolean;
  className?: string;
}

export default function LikeButton({ postId, initialCount, onLogin, iconOnly, plain, className }: LikeButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const { user } = useAuth();
  const dialog = useAppDialog();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => setLiked(!!data));
  }, [user, postId]);

  const toggle = async () => {
    if (!user) {
      if (onLogin) onLogin();
      else router.push("/login");
      return;
    }
    if (loading) return;
    setLoading(true);

    if (liked) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      if (!error) {
        setLiked(false);
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
        .from("likes")
        .insert({ post_id: postId, user_id: user.id });
      if (!error) {
        setLiked(true);
        setCount((c) => c + 1);
        createNotification({
          type: "like",
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
        <button className={`stat-item ${className || ""}`} title="点赞" onClick={toggle} disabled={loading}>
          <i className={`${liked ? "fa-solid" : "fa-regular"} fa-heart`} style={liked ? { color: "var(--color-primary, #F26B5B)" } : undefined} />
          <span>{count}</span>
        </button>
      );
    }
    return (
      <button className="rs-btn flex items-center gap-1" title="点赞" onClick={toggle} disabled={loading}>
        <i className={`${liked ? "fa-solid" : "fa-regular"} fa-heart`} style={liked ? { color: "#e74c3c" } : undefined} />
        <span className="text-xs text-muted">{count}</span>
      </button>
    );
  }

  return (
    <button
      className={`card-action ${liked ? "liked" : ""}`}
      onClick={toggle}
      disabled={loading}
    >
      <i className={`${liked ? "fa-solid" : "fa-regular"} fa-heart`} />
      <span>{count}</span>
    </button>
  );
}
