"use client";
import SiteIcon from "@/components/SiteIcon";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import PostTagCard from "@/components/PostTagCard";
import { SkeletonCollectionDetail } from "@/components/Skeleton";
import type { Post } from "@/lib/types";
import DefaultAvatar from "@/components/DefaultAvatar";
import { slimContent } from "@/lib/feed";
import { useAuth } from "@/components/AuthProvider";
import { useAppDialog } from "@/components/AppDialogProvider";
import { assertCanInteract } from "@/lib/userRestrictions";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";

type CollectionInfo = {
  id: string;
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
  const router = useRouter();
  const dialog = useAppDialog();
  const { profile, user, loading: authLoading } = useAuth();
  const includeTestData = includeTestDataForProfile(profile);
  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isSaved, setIsSaved] = useState(false);
  const [bookmarkStatusReady, setBookmarkStatusReady] = useState(false);
  const [bookmarkStatusError, setBookmarkStatusError] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const collectionId = collection?.id;
  const userId = user?.id;

  useEffect(() => {
    let active = true;
    const loadBookmarkStatus = async () => {
      if (authLoading) return;
      if (!userId || !collectionId) {
        setIsSaved(false);
        setBookmarkStatusError(false);
        setBookmarkStatusReady(true);
        return;
      }

      setBookmarkStatusReady(false);
      const { data, error } = await supabase
        .from("collection_bookmarks")
        .select("series_id")
        .eq("series_id", collectionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setBookmarkStatusError(true);
        setBookmarkStatusReady(false);
        return;
      }
      setIsSaved(Boolean(data));
      setBookmarkStatusError(false);
      setBookmarkStatusReady(true);
    };
    void loadBookmarkStatus();
    return () => { active = false; };
  }, [authLoading, collectionId, supabase, userId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError(false);
      setNotFound(false);
      setCollection(null);
      setPosts([]);
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decodedName);
        const { data: series, error: seriesError } = await withTestDataVisibility(
          supabase
            .from("series")
            .select("id, name, description, created_at, updated_at, user_id")
            .eq(isUuid ? "id" : "name", decodedName),
          includeTestData,
        ).maybeSingle();

        if (seriesError) throw seriesError;
        if (!series) {
          if (active) setNotFound(true);
          return;
        }

        const seriesRow = series as unknown as Record<string, unknown>;
        const seriesId = seriesRow.id as string;
        const seriesName = (seriesRow.name as string) || decodedName;
        let postsQuery = withTestDataVisibility(
          supabase
            .from("posts")
            .select("id, title, content, cover_url, post_type, created_at, published_at, series_name, chapter_number, user_id, post_tags(tags(name))")
            .eq("series_name", seriesName)
            .neq("post_type", "serial")
            .eq("status", "published"),
          includeTestData,
        );
        if (seriesRow.user_id) postsQuery = postsQuery.eq("user_id", seriesRow.user_id as string);
        const { data: postData, error: postsError } = await postsQuery.order("created_at", { ascending: false });
        if (postsError) throw postsError;

        const rawPosts = (postData || []) as unknown as Array<Record<string, unknown>>;
        const authorId = (seriesRow.user_id as string | null) || (rawPosts[0]?.user_id as string | null) || null;
        const postIds = rawPosts.map((post) => post.id as string).filter(Boolean);
        const authorPromise = authorId
          ? supabase.from("profiles").select("nickname, avatar_url").eq("id", authorId).maybeSingle()
          : Promise.resolve({ data: null });
        const bookmarkPromise = postIds.length > 0
          ? supabase.from("post_stats").select("bookmark_count").in("id", postIds)
          : Promise.resolve({ data: [] as unknown[] });
        const [{ data: author }, { data: bookmarkStats, error: bookmarkError }] = await Promise.all([authorPromise, bookmarkPromise]);
        if (bookmarkError) throw bookmarkError;
        const nickname = (author?.nickname as string) || "匿名用户";
        const avatarUrl = (author?.avatar_url as string | null) || null;
        const bookmarkCount = ((bookmarkStats || []) as Array<{ bookmark_count?: number | null }>)
          .reduce((total, stat) => total + (stat.bookmark_count || 0), 0);

        const formatted = rawPosts
          .map((post) => {
            const joinedTags = post.post_tags as Array<{ tags: { name: string } | null }> | undefined;
            return {
              ...post,
              content: slimContent((post.content as string) || ""),
              tags: joinedTags?.map((item) => item.tags?.name).filter(Boolean) || [],
            } as unknown as Post;
          })
          .sort((a, b) => new Date(b.published_at || b.created_at || "").getTime() - new Date(a.published_at || a.created_at || "").getTime());

        if (!active) return;
        setCollection({
          id: seriesId,
          name: seriesName,
          description: (seriesRow.description as string) || "",
          created_at: (seriesRow.created_at as string) || null,
          updated_at: (seriesRow.updated_at as string) || null,
          user_id: authorId,
          nickname,
          avatar_url: avatarUrl,
          bookmark_count: bookmarkCount,
        });
        setPosts(formatted);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [decodedName, includeTestData, retryKey, supabase]);

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

  const toggleCollectionBookmark = async () => {
    if (authLoading || bookmarkLoading) return;
    if (bookmarkStatusError || !bookmarkStatusReady) {
      dialog.toast("暂时无法读取合集的收藏状态，请稍后重试。", "danger");
      return;
    }
    if (!user) {
      const next = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!collection) return;

    setBookmarkLoading(true);
    try {
      if (!isSaved) {
        const blocked = await assertCanInteract();
        if (blocked) {
          dialog.toast(blocked, "danger");
          return;
        }
      }

      const result = isSaved
        ? await supabase
          .from("collection_bookmarks")
          .delete()
          .eq("series_id", collection.id)
          .eq("user_id", user.id)
        : await supabase
          .from("collection_bookmarks")
          .upsert({ series_id: collection.id, user_id: user.id }, { onConflict: "series_id,user_id", ignoreDuplicates: true });

      if (result.error) {
        dialog.toast("收藏合集失败，请稍后重试。", "danger");
      } else {
        setIsSaved(!isSaved);
        dialog.toast(isSaved ? "已取消收藏合集" : "已收藏合集", "success");
      }
    } catch {
      dialog.toast("收藏合集失败，请稍后重试。", "danger");
    } finally {
      setBookmarkLoading(false);
    }
  };

  if (loading) {
    return <div id="page-collection" className="min-h-screen bg-paper"><SkeletonCollectionDetail /></div>;
  }

  if (loadError) {
    return (
      <div id="page-collection" className="min-h-screen bg-paper">
        <div className="collection-page-wrapper">
          <div className="collection-empty collection-empty-state" role="alert">
            <h2 className="empty-title">合集加载失败</h2>
            <p className="empty-desc">页面暂时没能读取合集信息和作品，请检查网络后重试。</p>
            <button type="button" className="collection-retry-button" onClick={() => setRetryKey((key) => key + 1)}>重试</button>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div id="page-collection" className="min-h-screen bg-paper">
        <div className="collection-page-wrapper">
          <div className="collection-empty collection-empty-state">
            <div className="empty-illustration">
              <div className="empty-tag-ring">
                <div className="tag-ring-outer"></div>
                <div className="tag-ring-inner">
                  <SiteIcon name="fa-layer-group" variant="solid" />
                </div>
              </div>
            </div>
            <h2 className="empty-title">未找到这个合集</h2>
            <p className="empty-desc">合集可能已被删除，或者链接已经失效。</p>
          </div>
        </div>
      </div>
    );
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
                <button type="button" className={`collection-action-btn${isSaved ? " saved" : ""}`} onClick={toggleCollectionBookmark} disabled={authLoading || bookmarkLoading} aria-pressed={isSaved} aria-busy={bookmarkLoading}>
                  {bookmarkLoading ? "收藏中…" : isSaved ? "已收藏" : "收藏合集"}
                </button>
                <button type="button" className="collection-action-btn" onClick={handleShare}>分享</button>
              </div>
            </div>
            {collection.description && <p className="collection-description">{collection.description}</p>}
            <div className="collection-meta-row">
              <span className="collection-author"><span className="collection-author-avatar">{collection.avatar_url ? <img src={collection.avatar_url} alt="" /> : <DefaultAvatar name={collection.nickname} />}</span><span>作者：{collection.nickname}</span></span>
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
              <button type="button" className={`collection-sort-toggle${sortOrder === "asc" ? " reversed" : ""}`} onClick={() => setSortOrder((order) => order === "desc" ? "asc" : "desc")}><SiteIcon name={sortOrder === "asc" ? "fa-arrow-up-wide-short" : "fa-arrow-down-wide-short"} variant="solid" /> {sortOrder === "desc" ? "倒序" : "正序"}</button>
            </div>
          </div>

          {filteredPosts.length === 0 ? (
            <div className="collection-empty collection-empty-state">
              <div className="empty-illustration">
                <div className="empty-tag-ring">
                  <div className="tag-ring-outer"></div>
                  <div className="tag-ring-inner">
                    <SiteIcon name="fa-layer-group" variant="solid" />
                  </div>
                </div>
              </div>
              <h2 className="empty-title">这个分类下还没有作品</h2>
              <p className="empty-desc">换一个分类，或者稍后再来看看。</p>
            </div>
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
