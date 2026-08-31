"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import PostTagCard from "@/components/PostTagCard";
import { SkeletonCollectionDetail } from "@/components/Skeleton";
import type { Post } from "@/lib/types";

type CollectionInfo = {
  name: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  user_id: string | null;
  nickname: string;
  avatar_url: string | null;
  bookmark_count: number;
};

type CollectionFilter = "all" | "text" | "image";

const hasImages = (post: Post) => {
  const content = post.content || "";
  return Boolean(post.cover_url && !post.cover_url.startsWith("private://")) || /!\[.*?\]\((?!private:\/\/).*?\)/.test(content);
};

export default function CollectionPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const supabase = createClient();
  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [{ data: series }, { data: postData }] = await Promise.all([
        supabase
          .from("series")
          .select("name, description, created_at, updated_at, user_id")
          .eq("name", decodedName)
          .maybeSingle(),
        supabase
          .from("posts")
          .select("id, title, content, cover_url, post_type, created_at, published_at, series_name, chapter_number, user_id, post_tags(tags(name))")
          .eq("series_name", decodedName)
          .neq("post_type", "serial")
          .eq("status", "published")
          .order("created_at", { ascending: false }),
      ]);

      const rawPosts = (postData || []) as unknown as Array<Record<string, unknown>>;
      const authorId = (series?.user_id as string | null) || (rawPosts[0]?.user_id as string | null) || null;
      const postIds = rawPosts.map((post) => post.id as string).filter(Boolean);
      const authorPromise = authorId
        ? supabase.from("profiles").select("nickname, avatar_url").eq("id", authorId).maybeSingle()
        : Promise.resolve({ data: null });
      const bookmarkPromise = postIds.length > 0
        ? supabase.from("bookmarks").select("id", { count: "exact", head: true }).in("post_id", postIds)
        : Promise.resolve({ count: 0 });
      const [{ data: author }, { count }] = await Promise.all([authorPromise, bookmarkPromise]);
      const nickname = (author?.nickname as string) || "匿名用户";
      const avatarUrl = (author?.avatar_url as string | null) || null;
      const bookmarkCount = count || 0;

      const formatted = rawPosts
        .map((post) => {
          const joinedTags = post.post_tags as Array<{ tags: { name: string } | null }> | undefined;
          return {
            ...post,
            tags: joinedTags?.map((item) => item.tags?.name).filter(Boolean) || [],
          } as unknown as Post;
        })
        .sort((a, b) => new Date(b.published_at || b.created_at || "").getTime() - new Date(a.published_at || a.created_at || "").getTime());

      setCollection({
        name: decodedName,
        description: (series?.description as string) || "",
        created_at: (series?.created_at as string) || null,
        updated_at: (series?.updated_at as string) || null,
        user_id: authorId,
        nickname,
        avatar_url: avatarUrl,
        bookmark_count: bookmarkCount,
      });
      setPosts(formatted);
      setLoading(false);
    };
    load();
  }, [decodedName, supabase]);

  const filteredPosts = posts.filter((post) => {
    if (filter === "all") return true;
    return filter === "image" ? hasImages(post) : !hasImages(post);
  }).sort((a, b) => {
    const da = new Date(a.published_at || a.created_at || "").getTime();
    const db = new Date(b.published_at || b.created_at || "").getTime();
    return sortOrder === "desc" ? db - da : da - db;
  });

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 复制失败时仍保留页面，不阻断浏览。
    }
  };

  if (loading) {
    return <div id="page-collection" className="min-h-screen bg-paper"><SkeletonCollectionDetail /></div>;
  }

  if (!collection) {
    return <div id="page-collection" className="min-h-screen bg-paper"><div className="collection-page-wrapper"><div className="collection-empty">未找到这个合集</div></div></div>;
  }

  return (
    <div id="page-collection" className="min-h-screen bg-paper">
      <div className="collection-page-wrapper">
        <div className="collection-content-container">
          <section className="collection-hero">
            <div className="collection-hero-title-row">
              <div className="collection-title-block">
                <h1 className="collection-title">{collection.name}</h1>
              </div>
              <div className="collection-hero-actions">
                <button type="button" className={`collection-action-btn${isSaved ? " saved" : ""}`} onClick={() => setIsSaved((saved) => !saved)}><i className="fa-solid fa-bookmark" /> {isSaved ? "已收藏" : "收藏合集"}</button>
                <button type="button" className="collection-action-btn" onClick={handleShare}><i className="fa-solid fa-share-nodes" /> 分享</button>
              </div>
            </div>
            {collection.description && <p className="collection-description">{collection.description}</p>}
            <div className="collection-meta-row">
              <span className="collection-author"><span className="collection-author-avatar">{collection.avatar_url ? <img src={collection.avatar_url} alt="" /> : collection.nickname.slice(0, 1)}</span><span>作者：{collection.nickname}</span></span>
              <span className="collection-meta-sep">|</span>
              <span className="collection-stat-item"><span className="collection-stat-label">作品数</span><span className="collection-stat-value">{posts.length}</span></span>
              <span className="collection-meta-sep">|</span>
              <span className="collection-stat-item"><span className="collection-stat-label">收藏数</span><span className="collection-stat-value">{collection.bookmark_count}</span></span>
            </div>
          </section>

          <div className="collection-works-head">
            <div><span className="collection-works-title">合集作品</span><span className="collection-works-count"> · 共 {posts.length} 篇</span></div>
            <div className="collection-filters" role="tablist" aria-label="作品类型筛选">
              {([{ key: "all", label: "全部" }, { key: "text", label: "单篇" }, { key: "image", label: "图片" }] as Array<{ key: CollectionFilter; label: string }>).map((item) => (
                <button key={item.key} type="button" role="tab" aria-selected={filter === item.key} className={`type-filter-pill${filter === item.key ? " active" : ""}`} onClick={() => setFilter(item.key)}>{item.label}</button>
              ))}
              <button type="button" className={`collection-sort-toggle${sortOrder === "asc" ? " reversed" : ""}`} onClick={() => setSortOrder((order) => order === "desc" ? "asc" : "desc")}><i className="fa-solid fa-arrow-down" /> {sortOrder === "desc" ? "正序" : "倒序"}</button>
            </div>
          </div>

          {filteredPosts.length === 0 ? (
            <div className="collection-empty">这个分类下还没有作品</div>
          ) : (
            <div className="collection-card-grid">
              {filteredPosts.map((post) => <PostTagCard key={post.id} post={post} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
