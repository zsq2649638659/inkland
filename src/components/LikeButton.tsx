"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import SiteIcon from "@/components/SiteIcon";
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
  /** 阅读历史等延迟加载卡片需要先反馈点击，再在写入失败时回滚。 */
  optimistic?: boolean;
  // 父组件已算好的点赞状态；传入时跳过挂载时的独立查询（消除信息流 N+1）
  initialActive?: boolean;
}

export default function LikeButton({ postId, initialCount, onLogin, iconOnly, plain, className, initialActive, optimistic = false }: LikeButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const dialog = useAppDialog();
  const [liked, setLiked] = useState(initialActive ?? false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || initialActive !== undefined) return;
    supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .single()
      .then(({ data }: { data: { id: string } | null }) => setLiked(!!data));
  }, [user, postId, initialActive]);

  const toggle = async () => {
    if (authLoading) return;
    if (!user) {
      if (onLogin) onLogin();
      else router.push("/login");
      return;
    }
    if (loading) return;
    setLoading(true);
    const wasLiked = liked;
    const applyOptimistic = (value: boolean) => {
      if (!optimistic) return;
      setLiked(value);
      setCount((current) => Math.max(0, current + (value ? 1 : -1)));
    };
    const rollbackOptimistic = () => {
      if (!optimistic) return;
      setLiked(wasLiked);
      setCount((current) => Math.max(0, current + (wasLiked ? 1 : -1)));
    };

    try {
      if (liked) {
        applyOptimistic(false);
        const { error } = await supabase
          .from("likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);
        if (error) {
          rollbackOptimistic();
          console.error("[like-button] unlike failed", error);
          dialog.toast("取消喜欢失败，请稍后重试。", "danger");
        } else if (!optimistic) {
          setLiked(false);
          setCount((c) => Math.max(0, c - 1));
        }
      } else {
        applyOptimistic(true);
        let blocked: string | null = null;
        try {
          // 权限查询只是体验层提示；超时或异常时交由数据库触发器做最终校验。
          blocked = await Promise.race([
            assertCanInteract(),
            new Promise<null>((resolve) => globalThis.setTimeout(() => resolve(null), 3000)),
          ]);
        } catch (restrictionError) {
          console.warn("[like-button] interaction check failed; database will enforce", restrictionError);
        }
        if (blocked) {
          rollbackOptimistic();
          dialog.toast(blocked, "danger");
          return;
        }
        const { error } = await supabase
          .from("likes")
          .insert({ post_id: postId, user_id: user.id });
        if (error) {
          rollbackOptimistic();
          console.error("[like-button] like failed", error);
          dialog.toast("喜欢失败，请稍后重试。", "danger");
        } else if (!optimistic) {
          setLiked(true);
          setCount((c) => c + 1);
        }
        if (!error) {
          void createNotification({
            type: "like",
            actor_id: user.id,
            post_id: postId,
          }).catch((notificationError) => {
            console.warn("[like-button] notification failed", notificationError);
          });
        }
      }
    } catch (error) {
      rollbackOptimistic();
      console.error("[like-button] toggle failed", error);
      dialog.toast("喜欢操作失败，请稍后重试。", "danger");
    } finally {
      setLoading(false);
    }
  };

  if (iconOnly) {
    if (plain) {
      return (
        <button className={`stat-item ${className || ""}`} title="点赞" onClick={toggle} disabled={loading || authLoading}>
          <SiteIcon name="fa-heart" variant={liked ? "solid" : "outline"} hoverVariant={liked ? undefined : "solid"} style={liked ? { color: "var(--color-primary, #F26B5B)" } : undefined} />
          <span>{count}</span>
        </button>
      );
    }
    return (
      <button className="rs-btn flex items-center gap-1" title="点赞" onClick={toggle} disabled={loading || authLoading}>
        <SiteIcon name="fa-heart" variant={liked ? "solid" : "outline"} hoverVariant={liked ? undefined : "solid"} style={liked ? { color: "#e74c3c" } : undefined} />
        <span className="text-xs text-muted">{count}</span>
      </button>
    );
  }

  return (
    <button
      className={`card-action ${className || ""} ${liked ? "liked" : ""}`}
      onClick={toggle}
      disabled={loading || authLoading}
      aria-pressed={liked}
    >
      <SiteIcon name="fa-heart" variant={liked ? "solid" : "outline"} hoverVariant={liked ? undefined : "solid"} />
      <span>{count}</span>
    </button>
  );
}
