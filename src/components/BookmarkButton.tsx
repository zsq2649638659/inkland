"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";

interface BookmarkButtonProps {
  postId: string;
  initialCount: number;
  onLogin?: () => void;
  iconOnly?: boolean;
  plain?: boolean;
}

export default function BookmarkButton({ postId, initialCount, onLogin, iconOnly, plain }: BookmarkButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const { user } = useAuth();
  const [bookmarked, setBookmarked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("bookmarks")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => setBookmarked(!!data));
  }, [user, postId]);

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
      const { error } = await supabase
        .from("bookmarks")
        .insert({ post_id: postId, user_id: user.id });
      if (!error) {
        setBookmarked(true);
        setCount((c) => c + 1);
      }
    }
    setLoading(false);
  };

  if (iconOnly) {
    if (plain) {
      return (
        <button className="flex items-center gap-1 text-sm text-muted hover:text-accent transition-colors bg-transparent border-none cursor-pointer p-0" title="收藏" onClick={toggle} disabled={loading}>
          <i className={`${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark`} style={bookmarked ? { color: "#b8752e" } : undefined} />
          <span>{count}</span>
        </button>
      );
    }
    return (
      <button className="rs-btn" title="收藏" onClick={toggle} disabled={loading}>
        <i className={`${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark`} style={bookmarked ? { color: "#b8752e" } : undefined} />
      </button>
    );
  }

  return (
    <button
      className="interact-btn"
      onClick={toggle}
      disabled={loading}
    >
      <i className={`${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark mr-1`} />
      {count}
    </button>
  );
}