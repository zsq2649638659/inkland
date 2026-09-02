"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { SkeletonSeriesDetail } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import DefaultAvatar from "@/components/DefaultAvatar";
import { useAppDialog } from "@/components/AppDialogProvider";
import { assertCanInteract } from "@/lib/userRestrictions";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";
import { loadReadingHistory, type ReadingHistoryRecord } from "@/lib/readingHistory";

interface ChapterInfo {
  id: string;
  title: string;
  chapter_number: number;
  chapter_title: string;
  word_count: number;
  created_at: string;
}

interface SeriesInfo {
  user_id: string;
  title: string;
  cover_url: string | null;
  description: string;
  word_count: number;
  created_at: string;
  updated_at: string;
  author: { nickname: string; avatar_url: string | null };
  tags: string[];
  status: string;
  series_type: string;
}

export default function SeriesPage({ params }: { params: Promise<{ name: string }> }) {
  const dialog = useAppDialog();
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const supabase = createClient();
  const { user, profile } = useAuth();
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryRecord[]>([]);
  const [readingHistoryUserId, setReadingHistoryUserId] = useState<string | null>(null);

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const includeTestData = includeTestDataForProfile(profile);
      // 系列元数据和章节互不依赖，先并行发出，避免跨区域请求瀑布。
      const [{ data: seriesData }, { data: chData }] = await Promise.all([
        withTestDataVisibility(
          supabase
            .from("series")
            .select("id, user_id, name, description, cover_url, tags, status, series_type, created_at, updated_at")
            .eq("name", decodedName),
          includeTestData,
        ).maybeSingle(),
        withTestDataVisibility(
          supabase
            .from("posts")
            .select("id, title, chapter_number, chapter_title, word_count, created_at, user_id, status")
            .eq("series_name", decodedName)
            .eq("post_type", "serial")
            .eq("status", "published")
            .gt("chapter_number", 0)
            .order("chapter_number", { ascending: true }),
          includeTestData,
        ),
      ]);

      if (!active) return;
      const chapters = (chData || []) as unknown as Array<Record<string, unknown>>;
      const seriesRow = seriesData as unknown as Record<string, unknown> | null;
      const firstChapter = chapters[0] || null;
      const authorId = (seriesRow?.user_id as string | undefined) || (firstChapter?.user_id as string | undefined);

      if (authorId) {
        const authorPromise = supabase
          .from("profiles")
          .select("nickname, avatar_url")
          .eq("id", authorId)
          .maybeSingle();
        const tagsPromise = !seriesRow && chapters.length > 0
          ? supabase.from("post_tags").select("tags(name)").in("post_id", chapters.map((chapter) => chapter.id as string))
          : Promise.resolve({ data: [] as unknown[] });
        const [{ data: author }, { data: tags }] = await Promise.all([authorPromise, tagsPromise]);
        if (!active) return;

        const tagNames: string[] = seriesRow
          ? ((seriesRow.tags as string[]) || [])
          : [...new Set<string>((tags || []).flatMap((item: Record<string, unknown>) => {
            const tag = item.tags as { name: string } | null;
            return tag?.name ? [tag.name] : [];
          }))];
        const totalWords = chapters.reduce((sum, chapter) => sum + ((chapter.word_count as number) || 0), 0);
        setSeriesInfo({
          user_id: authorId,
          title: decodedName,
          cover_url: (seriesRow?.cover_url as string) || (firstChapter?.cover_url as string) || null,
          description: (seriesRow?.description as string) || "",
          word_count: totalWords,
          created_at: (seriesRow?.created_at as string) || (firstChapter?.created_at as string) || "",
          updated_at: (seriesRow?.updated_at as string) || (firstChapter?.created_at as string) || "",
          author: { nickname: (author as { nickname: string } | null)?.nickname || "匿名用户", avatar_url: (author as { avatar_url: string | null } | null)?.avatar_url || null },
          tags: tagNames,
          status: (seriesRow?.status as string) || "ongoing",
          series_type: (seriesRow?.series_type as string) || "fanfic",
        });
      }

      setChapters(chapters.map((chapter) => ({
        id: chapter.id as string,
        title: (chapter.title as string) || "无标题",
        chapter_number: chapter.chapter_number as number,
        chapter_title: (chapter.chapter_title as string) || "",
        word_count: (chapter.word_count as number) || 0,
        created_at: chapter.created_at as string,
      })));
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [decodedName, profile, supabase, user?.id]);

  // 连载进度只读取当前用户自己的阅读记录；章节本身仍由上面的可见性查询控制。
  useEffect(() => {
    if (!user) return;
    let active = true;
    void loadReadingHistory(supabase, user.id).then(({ records }) => {
      if (!active) return;
      setReadingHistory(records);
      setReadingHistoryUserId(user.id);
    });
    return () => { active = false; };
  }, [supabase, user]);

  // 关注状态依赖登录用户，但不应让整页内容重复请求。
  useEffect(() => {
    if (!user || !seriesInfo || user.id === seriesInfo.user_id) return;
    let active = true;
    void supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", seriesInfo.user_id)
      .maybeSingle()
      .then((result: { data: unknown }) => { if (active) setIsFollowing(!!result.data); });
    return () => { active = false; };
  }, [seriesInfo, supabase, user]);

  const handleFollow = async () => {
    if (!user || !seriesInfo) return;
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", seriesInfo.user_id);
      setIsFollowing(false);
    } else {
      const blocked = await assertCanInteract();
      if (blocked) {
        dialog.toast(blocked, "danger");
        return;
      }
      await supabase.from("follows").insert({ follower_id: user.id, following_id: seriesInfo.user_id });
      setIsFollowing(true);
    }
  };

  if (loading) return <div id="page-series"><SkeletonSeriesDetail /></div>;

  if (!seriesInfo) {
    return (
      <div id="page-series" className="min-h-screen bg-paper">
        <EmptyState icon="fa-book" title="该连载暂无内容" />
      </div>
    );
  }

  const totalWords = seriesInfo.word_count;
  const isOwner = Boolean(user && user.id === seriesInfo.user_id);
  const readingHistoryReady = Boolean(user && readingHistoryUserId === user.id);
  const visibleReadingHistory = readingHistoryReady ? readingHistory : [];
  const readingHistoryLoading = Boolean(user && !readingHistoryReady);

  const sortedChapters = [...chapters].sort((a, b) => {
    return sortOrder === "asc"
      ? a.chapter_number - b.chapter_number
      : b.chapter_number - a.chapter_number;
  });

  const toggleSort = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const lastChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;

  const seriesReadingRecords = visibleReadingHistory.filter((record) => {
    const snapshot = record.post;
    // 本地记录可能还没有关联的 post 快照，用当前目录中的章节 id 兜底识别。
    return (snapshot?.series_name === decodedName && snapshot.post_type === "serial")
      || chapters.some((chapter) => chapter.id === record.post_id);
  });
  const readChapterNumber = seriesReadingRecords.reduce((max, record) => {
    const chapterNumber = record.chapter_number ?? record.post?.chapter_number ?? 0;
    return Math.max(max, chapterNumber);
  }, 0);
  const continueRecord = [...seriesReadingRecords]
    .filter((record) => (record.chapter_number ?? record.post?.chapter_number ?? 0) > 0)
    .sort((a, b) => {
      const chapterDiff = (b.chapter_number ?? b.post?.chapter_number ?? 0) - (a.chapter_number ?? a.post?.chapter_number ?? 0);
      if (chapterDiff !== 0) return chapterDiff;
      return new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime();
    })[0] || null;
  const continueChapter = continueRecord
    ? chapters.find((chapter) => chapter.id === continueRecord.post_id) || null
    : null;
  const hasReadingProgress = readChapterNumber > 0;

  return (
    <div id="page-series" className="min-h-screen bg-paper">
      <div className="page-wrapper">
        <div className="content-container">

          {/* Hero Card */}
          <div className="hero-card">
            <div className="hero-title-row">
              <div className="hero-title-left">
                <h1 className="hero-title">{decodedName}</h1>
                <span className={`serial-badge ${seriesInfo.status === "completed" ? "completed" : ""}`}>
                  {seriesInfo.status === "ongoing" ? "连载中" : "已完结"}
                </span>
              </div>
              <div className="hero-actions">
                {chapters.length > 0 && (
                  <Link href={`/read/${chapters[0]?.id}`} className="hero-action-btn primary">
                    <i className="fa-solid fa-book-open" /> 开始阅读
                  </Link>
                )}
                {user && !isOwner && (
                  <div className="series-follow-action">
                    <button
                      className={`hero-action-btn ${isFollowing ? "bookmarked" : "primary"}`}
                      onClick={handleFollow}
                    >
                      <i className="fa-solid fa-bookmark" />
                      {isFollowing ? "已收藏" : "收藏连载"}
                    </button>
                    <span className="series-follow-note">新章节会出现在首页“关注”内容中</span>
                  </div>
                )}
                {isOwner && (
                  <Link href={`/studio/series/${encodeURIComponent(decodedName)}`} className="hero-action-btn">
                    <i className="fa-solid fa-gear" /> 管理
                  </Link>
                )}
              </div>
            </div>

            <div className="hero-meta-row">
              <div className="hero-author">
                <Link href={`/user/${seriesInfo.user_id}`} className="hero-author-avatar" style={{ textDecoration: "none" }}>
                  {seriesInfo.author.avatar_url ? (
                    <img src={seriesInfo.author.avatar_url} alt="" />
                  ) : (
                    <DefaultAvatar name={seriesInfo.author.nickname || "?"} />
                  )}
                </Link>
                <Link href={`/user/${seriesInfo.user_id}`} className="hero-author-name" style={{ textDecoration: "none" }}>
                  {seriesInfo.author.nickname}
                </Link>
              </div>
              <span className="meta-sep">|</span>
              <span className="meta-item">
                {seriesInfo.series_type === "fanfic" ? "同人" : "原创"}
              </span>
              <span className="meta-sep">|</span>
              <span className="meta-item">
                最近更新 <span>{lastChapter ? new Date(lastChapter.created_at).toLocaleDateString("zh-CN") : "暂无"}</span>
              </span>
              {lastChapter && (
                <>
                  <span className="meta-sep">|</span>
                  <span className="meta-item">
                    最新章 <span>{lastChapter.chapter_title || lastChapter.title || `第${lastChapter.chapter_number}章`}</span>
                  </span>
                </>
              )}
            </div>

            <div className="hero-stats-row">
              <div className="stat-item">
                <span className="stat-label">总章节</span>
                <span className="stat-value">{chapters.length}</span>
              </div>
              <span className="stat-sep">|</span>
              <div className="stat-item">
                <span className="stat-label">总字数</span>
                <span className="stat-value">{totalWords.toLocaleString()}</span>
              </div>
            </div>

            <div className={`series-reading-summary${readingHistoryLoading ? " is-loading" : ""}`} aria-live="polite" aria-busy={readingHistoryLoading}>
              <div className="series-reading-summary-copy">
                <span className="series-reading-summary-label"><i className="fa-regular fa-clock" /> 阅读进度</span>
                <span className="series-reading-summary-value">
                  {readingHistoryLoading
                    ? "正在读取…"
                    : hasReadingProgress
                      ? <>已读到第 <strong>{readChapterNumber}</strong> 章 / 共 {chapters.length} 章</>
                      : <>尚未开始阅读 / 共 {chapters.length} 章</>}
                </span>
              </div>
              {hasReadingProgress && continueChapter && (
                <Link href={`/read/${continueChapter.id}`} className="series-reading-action">
                  继续阅读
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </Link>
              )}
            </div>

            {seriesInfo.description && (
              <>
                <div className="synopsis-header">
                  <span className="synopsis-title">作品简介</span>
                </div>
                <p className="synopsis-text">{seriesInfo.description}</p>
              </>
            )}

            {seriesInfo.tags.length > 0 && (
              <div className="tags-row">
                {seriesInfo.tags.map((tag) => (
                  <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`} className="card-tag">
                    {tag}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Chapter Section */}
          <div className="chapter-section">
            <div className="chapter-section-header">
              <div>
                <span className="chapter-section-title">目录</span>
                <span className="chapter-section-count"> &middot; 共 {chapters.length} 章</span>
              </div>
              {chapters.length > 0 && (
                <button className={`sort-toggle${sortOrder === "desc" ? " reversed" : ""}`} onClick={toggleSort}>
                  <i className="fa-solid fa-arrow-down" /> {sortOrder === "desc" ? "正序" : "倒序"}
                </button>
              )}
            </div>

            {chapters.length > 0 && lastChapter && (
              <Link href={`/read/${lastChapter.id}`} className="update-banner" style={{ textDecoration: "none" }}>
                <span className="banner-dot"></span>
                <span className="banner-label">最新更新：第{lastChapter.chapter_number}章</span>
                <span className="banner-chapter">{lastChapter.chapter_title || lastChapter.title || `第${lastChapter.chapter_number}章`}</span>
                <span className="banner-time">{new Date(lastChapter.created_at).toLocaleDateString("zh-CN")}</span>
              </Link>
            )}

            {chapters.length === 0 ? (
              <div className="chapter-grid-wrapper">
                <div className="chapter-empty-state">
                  <div className="chapter-empty-illustration">
                    <div className="chapter-empty-ring">
                      <div className="chapter-ring-outer"></div>
                      <div className="chapter-ring-inner">
                        <i className="fa-solid fa-book-open"></i>
                      </div>
                    </div>
                  </div>
                  <p className="chapter-empty-title">暂无章节</p>
                  <p className="chapter-empty-desc">作者还没有发布任何章节，敬请期待</p>
                </div>
              </div>
            ) : (
              <div className="chapter-grid-wrapper">
                <div className="chapter-grid">
                  {sortedChapters.map((ch) => (
                    <Link
                      key={ch.id}
                      href={`/read/${ch.id}`}
                      className="chapter-grid-item"
                    >
                      <span className="ch-num">第{ch.chapter_number}章</span>
                      {ch.chapter_title || ch.title || "无标题"}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
