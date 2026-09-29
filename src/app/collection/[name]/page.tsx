"use client";
import SiteIcon from "@/components/SiteIcon";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import ProfileFilterSelect from "@/components/ProfileFilterSelect";
import ProfileWorkCard, { type ProfileCardMode } from "@/components/ProfileWorkCard";
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

const parseCollectionFilter = (value: string | null): CollectionFilter => (
  value === "text" || value === "image" ? value : "all"
);

const parseCollectionSort = (value: string | null): "asc" | "desc" => (
  value === "asc" ? "asc" : "desc"
);

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
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<CollectionFilter>("all");
  const [mobileCardLayout, setMobileCardLayout] = useState<"full" | "square">("full");
  const [expandedDescriptionKey, setExpandedDescriptionKey] = useState<string | null>(null);
  const [isDescriptionOverflowing, setIsDescriptionOverflowing] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const collectionId = collection?.id;
  const userId = user?.id;
  const descriptionKey = collection ? JSON.stringify([collection.id, collection.description]) : null;
  const isDescriptionExpanded = descriptionKey !== null && expandedDescriptionKey === descriptionKey;

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setFilter(parseCollectionFilter(params.get("type")));
      setSortOrder(parseCollectionSort(params.get("order")));
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    if (!mobileFilterOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFilterOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileFilterOpen]);

  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) {
      setIsDescriptionOverflowing(false);
      return;
    }

    const measureOverflow = () => {
      if (isDescriptionExpanded) return;
      setIsDescriptionOverflowing(element.scrollHeight > element.clientHeight + 1);
    };

    measureOverflow();
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [collection?.description, isDescriptionExpanded]);

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

  const updateCollectionView = (nextFilter: CollectionFilter, nextSortOrder: "asc" | "desc") => {
    const url = new URL(window.location.href);
    if (nextFilter === "all") url.searchParams.delete("type");
    else url.searchParams.set("type", nextFilter);
    if (nextSortOrder === "desc") url.searchParams.delete("order");
    else url.searchParams.set("order", nextSortOrder);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setFilter(nextFilter);
    setSortOrder(nextSortOrder);
  };

  const toggleCollectionSort = () => {
    updateCollectionView(filter, sortOrder === "desc" ? "asc" : "desc");
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

  const isOwner = Boolean(user?.id && user.id === collection.user_id);
  const renderProfileCards = (mode: ProfileCardMode) => (
    <div className="card-device__cards">
      {filteredPosts.map((post) => <ProfileWorkCard key={post.id} post={post} mode={mode} />)}
    </div>
  );

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
                {isOwner ? (
                  <Link className="collection-action-btn collection-action-btn-primary" href={`/studio/series/${encodeURIComponent(collection.id)}?edit=1`}>管理</Link>
                ) : (
                  <button type="button" className="collection-action-btn collection-action-btn-primary" onClick={toggleCollectionBookmark} disabled={authLoading || bookmarkLoading} aria-pressed={isSaved} aria-busy={bookmarkLoading}>
                    {bookmarkLoading ? "收藏中…" : isSaved ? "已收藏" : "收藏"}
                  </button>
                )}
              </div>
            </div>
            <div className="collection-meta-row">
              {collection.user_id ? (
                <Link href={`/user/${encodeURIComponent(collection.user_id)}`} className="collection-author collection-author-link">
                  <span className="collection-author-avatar">{collection.avatar_url ? <img src={collection.avatar_url} alt="" /> : <DefaultAvatar name={collection.nickname} />}</span>
                  <span className="collection-author-name">{collection.nickname}</span>
                </Link>
              ) : (
                <span className="collection-author">
                  <span className="collection-author-avatar">{collection.avatar_url ? <img src={collection.avatar_url} alt="" /> : <DefaultAvatar name={collection.nickname} />}</span>
                  <span className="collection-author-name">{collection.nickname}</span>
                </span>
              )}
              <div className="collection-stats-row">
                <span className="collection-stat-item"><span className="collection-stat-label">作品数</span><span className="collection-stat-value">{posts.length}</span></span>
                <span className="collection-meta-sep">|</span>
                <span className="collection-stat-item"><span className="collection-stat-label">收藏数</span><span className="collection-stat-value">{collection.bookmark_count}</span></span>
              </div>
            </div>
            {collection.description && (
              <div className="collection-synopsis">
                <div className="synopsis-header"><span className="synopsis-title">合集简介</span></div>
                <p
                  ref={descriptionRef}
                  id="collection-description-text"
                  className={`synopsis-text${isDescriptionExpanded ? " is-expanded" : " is-collapsed"}`}
                >
                  {collection.description}
                </p>
                {isDescriptionOverflowing && (
                  <button
                    type="button"
                    className="collection-synopsis-toggle"
                    aria-expanded={isDescriptionExpanded}
                    aria-controls="collection-description-text"
                    onClick={() => setExpandedDescriptionKey(isDescriptionExpanded ? null : descriptionKey)}
                  >
                    {isDescriptionExpanded ? "收起" : "展开更多"}
                  </button>
                )}
              </div>
            )}
          </section>

          <div className="collection-works-head">
            <div><span className="collection-works-title">合集作品</span><span className="collection-works-count"> · 共 {posts.length} 篇</span></div>
            <div className="collection-filters">
              <ProfileFilterSelect
                label="作品类型"
                id="collection-filter-type-menu"
                value={filter}
                options={[{ value: "all", label: "所有作品" }, { value: "text", label: "单篇" }, { value: "image", label: "图片" }]}
                onChange={(value) => updateCollectionView(value as CollectionFilter, sortOrder)}
              />
              <button type="button" className={`collection-sort-toggle sort-toggle${sortOrder === "desc" ? " reversed" : ""}`} onClick={toggleCollectionSort} aria-label={`当前${sortOrder === "desc" ? "倒序" : "正序"}，点击切换排序`}>
                <SiteIcon name={sortOrder === "asc" ? "fa-arrow-up-wide-short" : "fa-arrow-down-wide-short"} variant="solid" aria-hidden="true" />
                <span>{sortOrder === "desc" ? "倒序" : "正序"}</span>
              </button>
            </div>
            <div className="collection-mobile-filter-bar">
              <button type="button" className="collection-mobile-filter-button" onClick={() => { setDraftFilter(filter); setMobileFilterOpen(true); }} aria-expanded={mobileFilterOpen} aria-haspopup="dialog">
                <SiteIcon name="fa-filter" variant="default" aria-hidden="true" />
                <span>筛选{filter !== "all" ? `：${filter === "text" ? "单篇" : "图片"}` : ""}</span>
              </button>
              <button type="button" className="collection-mobile-filter-button collection-mobile-sort-button" onClick={toggleCollectionSort} aria-label={`当前${sortOrder === "desc" ? "倒序" : "正序"}，点击切换排序`}>
                <SiteIcon name={sortOrder === "asc" ? "fa-arrow-up-wide-short" : "fa-arrow-down-wide-short"} variant="solid" aria-hidden="true" />
                <span>{sortOrder === "desc" ? "倒序" : "正序"}</span>
              </button>
              <button type="button" className="collection-mobile-filter-button profile-mobile-icon-button collection-mobile-icon-button" onClick={() => setMobileCardLayout((current) => current === "full" ? "square" : "full")} aria-label={mobileCardLayout === "full" ? "切换为三列卡片" : "切换为单列列表"} aria-pressed={mobileCardLayout === "square"}>
                <SiteIcon name={mobileCardLayout === "full" ? "fa-card-compact" : "fa-list-compact"} variant="default" aria-hidden="true" />
              </button>
            </div>
            {mobileFilterOpen && (
              <div className="collection-filter-drawer-backdrop" role="presentation" onClick={() => setMobileFilterOpen(false)}>
                <section className="collection-filter-drawer" role="dialog" aria-modal="true" aria-label="筛选合集作品" onClick={(event) => event.stopPropagation()}>
                  <div className="collection-filter-drawer-heading">
                    <h2>筛选作品</h2>
                    <button type="button" className="collection-filter-drawer-close" aria-label="关闭筛选" onClick={() => setMobileFilterOpen(false)}><SiteIcon name="fa-xmark" variant="solid" aria-hidden="true" /></button>
                  </div>
                  <div className="collection-filter-drawer-section">
                    <strong>作品类型</strong>
                    <div className="collection-filter-drawer-options">
                      {([{ key: "all", label: "所有作品" }, { key: "text", label: "单篇" }, { key: "image", label: "图片" }] as Array<{ key: CollectionFilter; label: string }>).map((item) => (
                        <button key={item.key} type="button" className={`collection-filter-control${draftFilter === item.key ? " is-active" : ""}`} aria-pressed={draftFilter === item.key} onClick={() => setDraftFilter(item.key)}>{item.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="collection-filter-drawer-actions">
                    <button type="button" onClick={() => setDraftFilter("all")}>重置</button>
                    <button type="button" className="is-primary" onClick={() => { updateCollectionView(draftFilter, sortOrder); setMobileFilterOpen(false); }}>应用筛选</button>
                  </div>
                </section>
              </div>
            )}
          </div>

          {posts.length === 0 ? (
            <div className="collection-empty collection-empty-state">
              <div className="empty-illustration">
                <div className="empty-tag-ring">
                  <div className="tag-ring-outer"></div>
                  <div className="tag-ring-inner">
                    <SiteIcon name="fa-layer-group" variant="solid" />
                  </div>
                </div>
              </div>
              <h2 className="empty-title">这个合集还没有作品</h2>
              <p className="empty-desc">合集创建后，作品会显示在这里。</p>
            </div>
          ) : filteredPosts.length === 0 ? (
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
              <button type="button" className="collection-reset-filter" onClick={() => updateCollectionView("all", sortOrder)}>查看全部作品</button>
            </div>
          ) : (
            <div className="collection-profile-cards">
              <div className="profile-card-device profile-card-device--pc card-device-grid" data-card-variant="collection-pc">
                <div className="card-device-frame card-device card-device--pc">{renderProfileCards("pc")}</div>
              </div>
              <div className={`profile-card-device profile-card-device--mobile-full card-device-grid${mobileCardLayout === "full" ? " is-active" : ""}`} data-card-variant="collection-mobile-full">
                <div className="card-device-frame card-device card-device--mobile">{renderProfileCards("mobile-full")}</div>
              </div>
              <div className={`profile-card-device profile-card-device--mobile-square card-device-grid${mobileCardLayout === "square" ? " is-active" : ""}`} data-card-variant="collection-mobile-square">
                <div className="card-device-frame card-device card-device--profile-square">{renderProfileCards("mobile-square")}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
