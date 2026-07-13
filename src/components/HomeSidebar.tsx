"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

interface TagRank {
  id: string;
  name: string;
  heat: number;
}

interface AuthorRank {
  id: string;
  nickname: string;
  avatar_url: string | null;
  post_count: number;
}

export default function HomeSidebar() {
  const supabase = createClient();
  const [tags, setTags] = useState<TagRank[]>([]);
  const [authors, setAuthors] = useState<AuthorRank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: tagData } = await supabase
        .from("tags")
        .select("id, name, post_count")
        .order("post_count", { ascending: false })
        .limit(10);

      if (tagData) {
        setTags(
          tagData.map((t: Record<string, unknown>) => ({
            id: t.id as string,
            name: t.name as string,
            heat: (t.post_count as number) || 0,
          }))
        );
      }

      const { data: authorData } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url");

      if (authorData) {
        const { data: postCounts } = await supabase
          .from("posts")
          .select("user_id");

        if (postCounts) {
          const countMap = new Map<string, number>();
          for (const p of postCounts) {
            const uid = (p as Record<string, unknown>).user_id as string;
            countMap.set(uid, (countMap.get(uid) || 0) + 1);
          }

          const ranked = (authorData as Record<string, unknown>[])
            .map((a) => ({
              id: a.id as string,
              nickname: (a.nickname as string) || "匿名用户",
              avatar_url: (a.avatar_url as string) || null,
              post_count: countMap.get(a.id as string) || 0,
            }))
            .filter((a) => a.post_count > 0)
            .sort((a, b) => b.post_count - a.post_count)
            .slice(0, 10);

          setAuthors(ranked);
        }
      }

      setLoading(false);
    };
    load();
  }, [supabase]);

  if (loading) {
    return (
      <aside className="space-y-5 w-64">
        <div className="sidebar-section">
          <div className="h-4 w-20 bg-rule animate-pulse rounded mb-4" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2 py-2">
              <div className="w-5 h-5 rounded bg-rule animate-pulse" />
              <div className="h-3 w-24 bg-rule animate-pulse rounded" />
              <div className="h-3 w-8 bg-rule animate-pulse rounded ml-auto" />
            </div>
          ))}
        </div>
        <div className="sidebar-section">
          <div className="h-4 w-20 bg-rule animate-pulse rounded mb-4" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2 py-2">
              <div className="w-5 h-5 rounded bg-rule animate-pulse" />
              <div className="w-6 h-6 rounded-full bg-rule animate-pulse" />
              <div className="h-3 w-20 bg-rule animate-pulse rounded" />
              <div className="h-3 w-6 bg-rule animate-pulse rounded ml-auto" />
            </div>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="space-y-5 w-64">
      {/* 热门标签 Top 10 */}
      <div className="rounded-xl bg-white border border-rule p-4">
        <h3 className="text-sm font-semibold text-warm mb-3">
          <i className="fa-solid fa-fire mr-1.5 text-accent" />
          热门标签
        </h3>
        {tags.length === 0 ? (
          <p className="text-xs text-muted">暂无数据</p>
        ) : (
          <div className="space-y-0.5">
            {tags.map((tag, i) => (
              <Link
                key={tag.id}
                href={`/tag/${encodeURIComponent(tag.name)}`}
                className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-accent-light transition-colors no-underline"
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i < 3 ? "bg-accent text-white" : "bg-rule text-muted"
                }`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-warm truncate">{tag.name}</span>
                <span className="text-xs text-muted flex-shrink-0">{tag.heat}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 活跃作者 Top 10 */}
      <div className="rounded-xl bg-white border border-rule p-4">
        <h3 className="text-sm font-semibold text-warm mb-3">
          <i className="fa-solid fa-user-group mr-1.5 text-accent" />
          活跃作者
        </h3>
        {authors.length === 0 ? (
          <p className="text-xs text-muted">暂无数据</p>
        ) : (
          <div className="space-y-0.5">
            {authors.map((author, i) => (
              <Link
                key={author.id}
                href={`/user/${author.id}`}
                className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-accent-light transition-colors no-underline"
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i < 3 ? "bg-accent text-white" : "bg-rule text-muted"
                }`}>
                  {i + 1}
                </span>
                <img
                  src={author.avatar_url || `https://placehold.co/24x24/f5e6d3/b8752e?text=${encodeURIComponent(author.nickname[0] || "?")}`}
                  className="w-6 h-6 rounded-full flex-shrink-0"
                  alt=""
                />
                <span className="flex-1 text-sm text-warm truncate">{author.nickname}</span>
                <span className="text-xs text-muted flex-shrink-0">{author.post_count}篇</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}