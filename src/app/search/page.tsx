"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import type { Post } from "@/lib/types";

type SearchSection = "all" | "tags" | "users" | "posts";

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const typeParam = searchParams.get("type") || "all";
  const supabase = createClient();
  const [posts, setPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<{ name: string; post_count: number }[]>([]);
  const [users, setUsers] = useState<{ id: string; nickname: string; avatar_url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<SearchSection>(typeParam as SearchSection || "all");

  useEffect(() => {
    setSection(typeParam as SearchSection || "all");
  }, [typeParam]);

  useEffect(() => {
    if (!query) { setLoading(false); return; }
    const doSearch = async () => {
      setLoading(true);

      // 1. 搜索标签
      const { data: tagData } = await supabase
        .from("tags")
        .select("name, post_count")
        .ilike("name", `%${query}%`)
        .order("post_count", { ascending: false })
        .limit(20);
      if (tagData) setTags(tagData as { name: string; post_count: number }[]);

      // 2. 搜索用户
      const { data: userData } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url")
        .ilike("nickname", `%${query}%`)
        .limit(20);
      if (userData) setUsers(userData as { id: string; nickname: string; avatar_url: string | null }[]);

      // 3. 搜索标签关联的作品
      const tagPostIds = new Set<string>();
      if (tagData && tagData.length > 0) {
        const { data: tagNames } = await supabase
          .from("tags")
          .select("id")
          .ilike("name", `%${query}%`);
        if (tagNames) {
          const tagIds = tagNames.map((t: Record<string, unknown>) => t.id as string);
          const { data: ptData } = await supabase
            .from("post_tags")
            .select("post_id")
            .in("tag_id", tagIds);
          if (ptData) {
            for (const pt of ptData) {
              tagPostIds.add((pt as Record<string, unknown>).post_id as string);
            }
          }
        }
      }

      // 4. 搜索标题和内容
      const { data: titleResults } = await supabase
        .from("posts")
        .select("id, title, content, word_count, post_type, created_at, cover_url, user_id, author:profiles!posts_user_id_fkey(nickname, avatar_url)")
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(20);

      // 5. 搜索标签关联的作品
      let tagResults: Post[] = [];
      if (tagPostIds.size > 0) {
        const ids = Array.from(tagPostIds);
        const { data: tr } = await supabase
          .from("posts")
          .select("id, title, content, word_count, post_type, created_at, cover_url, user_id, author:profiles!posts_user_id_fkey(nickname, avatar_url)")
          .in("id", ids)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(20);
        if (tr) tagResults = tr as unknown as Post[];
      }

      // 合并去重
      const all = [...(titleResults || []), ...tagResults];
      const seen = new Set<string>();
      const unique = all.filter((p) => {
        const pid = (p as Record<string, unknown>).id as string;
        if (seen.has(pid)) return false;
        seen.add(pid);
        return true;
      });
      setPosts(unique as unknown as Post[]);
      setLoading(false);
    };
    doSearch();
  }, [query, supabase]);

  const sections: { key: SearchSection; label: string; count: number }[] = [
    { key: "all", label: "全部", count: posts.length },
    { key: "tags", label: "标签", count: tags.length },
    { key: "users", label: "用户", count: users.length },
    { key: "posts", label: "文章", count: posts.length },
  ];

  const activeSection = section === "all" ? "all" : section;

  return (
    <div className="min-h-screen bg-paper">
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-lg font-bold text-warm mb-1">
          <i className="fa-solid fa-magnifying-glass mr-2 text-accent" />
          搜索：{query || "..."}
        </h2>

        {loading ? (
          <p className="text-sm text-muted text-center py-8">搜索中...</p>
        ) : (
          <>
            {/* 分类 Tab */}
            {query && (
              <div className="flex gap-1 mt-4 mb-6 border-b border-rule pb-2">
                {sections.map((s) => (
                  <button
                    key={s.key}
                    className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                      activeSection === s.key
                        ? "bg-accent text-white"
                        : "text-muted hover:text-warm"
                    }`}
                    onClick={() => setSection(s.key)}
                  >
                    {s.label} ({s.count})
                  </button>
                ))}
              </div>
            )}

            {/* 标签结果 */}
            {(activeSection === "all" || activeSection === "tags") && tags.length > 0 && (
              <div className="mb-6">
                {activeSection === "all" && (
                  <h3 className="text-sm font-semibold text-warm mb-3">
                    <i className="fa-solid fa-tag mr-1.5 text-accent" />相关标签
                  </h3>
                )}
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Link
                      key={tag.name}
                      href={`/tag/${encodeURIComponent(tag.name)}`}
                      className="px-3 py-1.5 rounded-full bg-accent-light text-accent text-sm no-underline hover:bg-accent hover:text-white transition-colors"
                    >
                      {tag.name}
                      <span className="text-xs ml-1 opacity-70">({tag.post_count})</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 用户结果 */}
            {(activeSection === "all" || activeSection === "users") && users.length > 0 && (
              <div className="mb-6">
                {activeSection === "all" && (
                  <h3 className="text-sm font-semibold text-warm mb-3">
                    <i className="fa-solid fa-user mr-1.5 text-accent" />相关用户
                  </h3>
                )}
                <div className="space-y-2">
                  {users.map((u) => (
                    <Link
                      key={u.id}
                      href={`/user/${u.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white border border-rule no-underline hover:border-accent transition-colors"
                    >
                      <img
                        src={u.avatar_url || `https://placehold.co/36x36/f5e6d3/b8752e?text=${encodeURIComponent(u.nickname?.[0] || "?")}`}
                        className="w-9 h-9 rounded-full object-cover"
                        alt=""
                      />
                      <span className="text-sm text-warm">{u.nickname}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 文章结果 */}
            {(activeSection === "all" || activeSection === "posts") && (
              <div>
                {activeSection === "all" && posts.length > 0 && (
                  <h3 className="text-sm font-semibold text-warm mb-3">
                    <i className="fa-solid fa-file-lines mr-1.5 text-accent" />相关文章
                  </h3>
                )}
                {posts.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted">没有找到相关作品</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {posts.map((post) => {
                      const author = (post as unknown as Record<string, unknown>).author as { nickname: string; avatar_url: string | null } | null;
                      return (
                        <Link
                          key={post.id}
                          href={`/read/${post.id}`}
                          className="block p-4 rounded-xl bg-white border border-rule no-underline hover:border-accent transition-colors"
                        >
                          <h3 className="font-semibold text-warm mb-1">{post.title}</h3>
                          <p className="text-sm text-muted line-clamp-2 mb-2">
                            {post.content?.slice(0, 200)}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted">
                            <span>{author?.nickname || "匿名"}</span>
                            <span>{post.word_count?.toLocaleString() || 0}字</span>
                            <span>
                              {post.created_at
                                ? new Date(post.created_at).toLocaleDateString("zh-CN")
                                : ""}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 无结果 */}
            {!query && (
              <div className="text-center py-12">
                <p className="text-muted">请输入搜索关键词</p>
              </div>
            )}
            {query && tags.length === 0 && users.length === 0 && posts.length === 0 && !loading && (
              <div className="text-center py-12">
                <p className="text-muted">没有找到与 "{query}" 相关的内容</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper flex items-center justify-center"><p className="text-muted">加载中...</p></div>}>
      <SearchContent />
    </Suspense>
  );
}