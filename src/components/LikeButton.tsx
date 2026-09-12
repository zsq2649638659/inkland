"use client";

import { useState, useEffect, useRef } from "react";
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

type LikeDatabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function readLikeError(error: unknown): LikeDatabaseError {
  return error && typeof error === "object" ? error as LikeDatabaseError : {};
}

function isDuplicateLikeError(error: unknown) {
  const details = readLikeError(error);
  const message = `${details.message || ""} ${details.details || ""}`.toLowerCase();
  return details.code === "23505" || message.includes("duplicate") || message.includes("unique constraint");
}

function formatLikeError(error: unknown, unlike: boolean) {
  const details = readLikeError(error);
  if (details.code === "42501") {
    return unlike
      ? "当前账号没有取消喜欢的权限，请重新登录后重试。"
      : "当前账号没有喜欢权限，请重新登录后重试。";
  }
  if (details.code === "23503") {
    return "这篇作品已不存在或暂时不可操作。";
  }
  if (details.code === "22P02") {
    return "作品编号无效，暂时无法喜欢。";
  }
  if (details.code === "42703" && details.message?.includes("follower_id")) {
    return "点赞服务配置有误，请先修复互动限制触发器。";
  }
  // 数据库触发器返回的限制提示已经是可读中文，直接保留，避免再被
  // 统一的“请稍后重试”遮住真正原因。
  const message = details.message?.trim();
  if (message && /账号|互动|点赞|喜欢|封禁|暂停|受限/.test(message)) return message;
  return unlike ? "取消喜欢失败，请稍后重试。" : "喜欢失败，请稍后重试。";
}

export default function LikeButton({ postId, initialCount, onLogin, iconOnly, plain, className, initialActive, optimistic = false }: LikeButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const dialog = useAppDialog();
  const [liked, setLiked] = useState(initialActive ?? false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  // 历史卡片的点赞状态可能在点击后才完成查询；本地操作一旦开始，
  // 迟到的查询结果不能再把刚刚确认的状态覆盖回去。
  const localInteractionRef = useRef(false);

  useEffect(() => {
    if (!user || initialActive !== undefined) return;
    let cancelled = false;
    supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => {
        if (!cancelled && !localInteractionRef.current) setLiked(!!data);
      })
      .catch((error: unknown) => {
        console.warn("[like-button] active state lookup failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [user, postId, initialActive]);

  useEffect(() => {
    localInteractionRef.current = false;
  }, [postId, user?.id]);

  const toggle = async () => {
    if (authLoading) return;
    if (!user) {
      if (onLogin) onLogin();
      else router.push("/login");
      return;
    }
    if (loading) return;
    setLoading(true);
    localInteractionRef.current = true;
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
          dialog.toast(formatLikeError(error, true), "danger");
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
        if (error && isDuplicateLikeError(error)) {
          // 数据库里已经有这条点赞：通常是卡片的 liked_by_me 查询晚到或
          // 被 RLS 过滤。把它视为成功，撤销本次“+1”，但保留实心图标。
          setLiked(true);
          if (optimistic) setCount((current) => Math.max(0, current - 1));
          console.warn("[like-button] duplicate like treated as already liked", error);
        } else if (error) {
          rollbackOptimistic();
          console.error("[like-button] like failed", error);
          dialog.toast(formatLikeError(error, false), "danger");
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
      dialog.toast(formatLikeError(error, false), "danger");
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
