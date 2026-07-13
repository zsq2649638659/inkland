"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { SkeletonSeriesDetail } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";

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
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const supabase = createClient();
  const { user } = useAuth();
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [lastReadChapter, setLastReadChapter] = useState<ChapterInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      // 先尝试从 series 表获取元数据
      const { data: seriesData } = await supabase
        .from("series")
        .select("id, user_id, name, description, cover_url, tags, status, series_type, created_at, updated_at")
        .eq("name", decodedName)
        .single();

      // 获取所有章节
      const { data: chData } = await supabase
        .from("posts")
        .select("id, title, chapter_number, chapter_title, word_count, created_at, user_id, status")
        .eq("series_name", decodedName)
        .eq("post_type", "serial")
        .eq("status", "published")
        .gt("chapter_number", 0)
        .order("chapter_number", { ascending: true });

      if (seriesData) {
        const s = seriesData as unknown as Record<string, unknown>;
        const authorId = s.user_id as string;

        // 获取作者信息
        const { data: author } = await supabase
          .from("profiles")
          .select("nickname, avatar_url")
          .eq("id", authorId)
          .single();

        const totalWords = (chData || []).reduce((sum: number, c: Record<string, unknown>) => sum + ((c.word_count as number) || 0), 0);

        setSeriesInfo({
          user_id: authorId,
          title: decodedName,
          cover_url: (s.cover_url as string) || null,
          description: (s.description as string) || "",
          word_count: totalWords,
          created_at: s.created_at as string,
          updated_at: s.updated_at as string,
          author: { nickname: (author as { nickname: string } | null)?.nickname || "匿名用户", avatar_url: (author as { avatar_url: string | null } | null)?.avatar_url || null },
          tags: (s.tags as string[]) || [],
          status: (s.status as string) || "ongoing",
          series_type: (s.series_type as string) || "fanfic",
        });

        setIsOwner(user?.id === authorId);

        if (user && authorId !== user.id) {
          const { data: follow } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", user.id)
            .eq("following_id", authorId)
            .single();
          setIsFollowing(!!follow);
        }
      } else if (chData && chData.length > 0) {
        // 降级：从章节数据中提取信息
        const firstChapter = chData[0] as unknown as Record<string, unknown>;
        const chAuthorId = firstChapter.user_id as string;

        const { data: author } = await supabase
          .from("profiles")
          .select("nickname, avatar_url")
          .eq("id", chAuthorId)
          .single();

        const postIds = chData.map((c: Record<string, unknown>) => c.id as string);
        const { data: tags } = await supabase
          .from("post_tags")
          .select("tags(name)")
          .in("post_id", postIds);
        const tagNames = [...new Set((tags || []).flatMap((t: Record<string, unknown>) => {
          const tag = t.tags as { name: string } | null;
          return tag?.name ? [tag.name] : [];
        }))];

        const totalWords = chData.reduce((sum: number, c: Record<string, unknown>) => sum + ((c.word_count as number) || 0), 0);

        setSeriesInfo({
          user_id: chAuthorId,
          title: decodedName,
          cover_url: (firstChapter as Record<string, unknown>).cover_url as string | null,
          description: "",
          word_count: totalWords,
          created_at: firstChapter.created_at as string,
          updated_at: firstChapter.created_at as string,
          author: { nickname: (author as { nickname: string } | null)?.nickname || "匿名用户", avatar_url: (author as { avatar_url: string | null } | null)?.avatar_url || null },
          tags: tagNames,
          status: "ongoing",
          series_type: "fanfic",
        });

        setIsOwner(user?.id === chAuthorId);

        if (user && chAuthorId !== user.id) {
          const { data: follow } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", user.id)
            .eq("following_id", chAuthorId)
            .single();
          setIsFollowing(!!follow);
        }
      }

      if (chData) {
        const chapterList = chData.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          title: (c.title as string) || "无标题",
          chapter_number: c.chapter_number as number,
          chapter_title: (c.chapter_title as string) || "",
          word_count: (c.word_count as number) || 0,
          created_at: c.created_at as string,
        }));
        setChapters(chapterList);

        // 读取本地阅读进度
        try {
          const saved = localStorage.getItem(`reading_progress_${decodedName}`);
          if (saved) {
            const progress = JSON.parse(saved) as { chapterId: string; chapterNumber: number };
            const found = chapterList.find((c) => c.id === progress.chapterId);
            if (found) setLastReadChapter(found);
          }
        } catch { /* ignore */ }
      }

      setLoading(false);
    };
    load();
  }, [decodedName, supabase, user]);

  const handleFollow = async () => {
    if (!user || !seriesInfo) return;
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", seriesInfo.user_id);
      setIsFollowing(false);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: seriesInfo.user_id });
      setIsFollowing(true);
    }
  };

  if (loading) return <SkeletonSeriesDetail />;

  if (!seriesInfo) {
    return (
      <div className="min-h-screen bg-paper">
        <EmptyState icon="fa-book" title="该连载暂无内容" />
      </div>
    );
  }

  const avatarChar = seriesInfo.author.nickname?.[0] || "?";
  const totalWords = seriesInfo.word_count;

  const sortedChapters = [...chapters].sort((a, b) => {
    return sortOrder === "asc"
      ? a.chapter_number - b.chapter_number
      : b.chapter_number - a.chapter_number;
  });

  const toggleSort = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  return (
    <div className="min-h-screen bg-paper">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 顶部信息区 - 起点风格 */}
        <div className="bg-white rounded-xl border border-rule p-6 mb-4">
          <div className="flex gap-6">
            {/* 封面 */}
            <div className="w-36 h-48 rounded-lg overflow-hidden bg-accent-light flex-shrink-0 shadow-md">
              {seriesInfo.cover_url ? (
                <img src={seriesInfo.cover_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-light/60 to-accent-light/20">
                  <i className="fa-solid fa-book text-5xl text-accent/30" />
                </div>
              )}
            </div>

            {/* 信息 */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-warm mb-2">{decodedName}</h1>
              <div className="flex items-center gap-4 text-sm text-muted mb-3">
                <Link href={`/user/${seriesInfo.user_id}`} className="flex items-center gap-1.5 no-underline hover:text-accent">
                  <img src={seriesInfo.author.avatar_url || `https://placehold.co/20x20/f5e6d3/b8752e?text=${encodeURIComponent(avatarChar)}`}
                    className="w-5 h-5 rounded-full object-cover" alt="" />
                  {seriesInfo.author.nickname}
                </Link>
                <span className="text-rule">|</span>
                <span className="flex items-center gap-1">
                  <i className="fa-solid fa-list-ul text-accent text-xs" />{chapters.length} 章
                </span>
                <span className="text-rule">|</span>
                <span className="flex items-center gap-1">
                  <i className="fa-solid fa-font text-accent text-xs" />{totalWords.toLocaleString()} 字
                </span>
                <span className="text-rule">|</span>
                <span>{seriesInfo.series_type === "fanfic" ? "同人" : "原创"}</span>
                <span className="text-rule">|</span>
                <span className={seriesInfo.status === "ongoing" ? "text-green-600" : "text-muted"}>
                  {seriesInfo.status === "ongoing" ? "连载中" : "已完结"}
                </span>
              </div>

              {/* 最新更新 */}
              {chapters.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted mb-3">
                  <i className="fa-solid fa-clock-rotate-left text-accent text-xs" />
                  <span>最新更新：</span>
                  <Link href={`/read/${chapters[chapters.length - 1].id}`} className="text-accent hover:underline no-underline">
                    第{chapters[chapters.length - 1].chapter_number}章 {chapters[chapters.length - 1].chapter_title || chapters[chapters.length - 1].title || "无标题"}
                  </Link>
                  <span className="text-rule">·</span>
                  <span>{new Date(chapters[chapters.length - 1].created_at).toLocaleDateString("zh-CN")}</span>
                </div>
              )}

              {/* 标签 */}
              {seriesInfo.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {seriesInfo.tags.map((tag) => (
                    <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`} className="tag">{tag}</Link>
                  ))}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-2">
                {chapters.length > 0 ? (
                  <Link href={`/read/${chapters[0]?.id}`} className="btn-accent no-underline">
                    开始阅读
                  </Link>
                ) : (
                  <span className="btn-accent opacity-50 cursor-not-allowed no-underline">
                    暂无章节
                  </span>
                )}
                {isOwner && (
                  <Link href={`/studio/series/${encodeURIComponent(decodedName)}`} className="btn-outline text-sm no-underline">
                    <i className="fa-solid fa-gear mr-1" />管理章节
                  </Link>
                )}
                {user && !isOwner && (
                  <button className={`btn-ghost ${isFollowing ? "text-accent" : ""}`} onClick={handleFollow}>
                    {isFollowing ? <><i className="fa-solid fa-check mr-1" />已关注作品</> : <><i className="fa-solid fa-plus mr-1" />关注作品</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 简介 - 独立卡片 */}
        {seriesInfo.description && (
          <div className="bg-white rounded-xl border border-rule p-4 mb-4">
            <h2 className="font-semibold text-warm mb-2">
              作品简介
            </h2>
            <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
              {seriesInfo.description}
            </p>
          </div>
        )}

        {/* 章节列表 */}
        <div className="bg-white rounded-xl border border-rule">
          <div className="px-5 py-3 border-b border-rule flex items-center justify-between">
            <h2 className="font-semibold text-warm">
              章节目录
              <span className="text-xs text-muted ml-2 font-normal">共 {chapters.length} 章</span>
            </h2>
            <button
              onClick={toggleSort}
              className="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors px-2 py-1 rounded-md hover:bg-accent-light/30"
              title={sortOrder === "asc" ? "切换为倒序" : "切换为正序"}
            >
              <i className={`fa-solid fa-arrow-down-${sortOrder === "asc" ? "1-9" : "9-1"} text-[0.7rem]`} />
              <span>{sortOrder === "asc" ? "正序" : "倒序"}</span>
            </button>
          </div>

          {/* 阅读进度 */}
          {lastReadChapter && (
            <div className="px-5 py-2.5 border-b border-rule bg-[#fdf6e8]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">
                  你已读至
                  <Link
                    href={`/read/${lastReadChapter.id}`}
                    className="text-accent hover:underline no-underline mx-1 font-medium"
                  >
                    第{lastReadChapter.chapter_number}章 {lastReadChapter.chapter_title || lastReadChapter.title || "无标题"}
                  </Link>
                </span>
                <Link
                  href={`/read/${lastReadChapter.id}`}
                  className="text-xs text-accent hover:underline no-underline flex items-center gap-0.5"
                >
                  立即阅读 <i className="fa-solid fa-chevron-right text-[0.6rem]" />
                </Link>
              </div>
            </div>
          )}

          {chapters.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted">该连载暂无章节</p>
            </div>
          ) : (
            <div className="divide-y divide-rule">
              {sortedChapters.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/read/${ch.id}`}
                  className="flex items-center px-5 py-3.5 no-underline hover:bg-accent-light/20 transition-colors"
                >
                  <span className="text-xs text-muted w-12 flex-shrink-0">第{ch.chapter_number}章</span>
                  <span className="text-sm text-warm flex-1 truncate">{ch.chapter_title || ch.title || "无标题"}</span>
                  <span className="text-xs text-muted flex-shrink-0 ml-3">{ch.word_count?.toLocaleString() || 0} 字</span>
                  <span className="text-xs text-muted flex-shrink-0 ml-3 w-20 text-right">
                    {new Date(ch.created_at).toLocaleDateString("zh-CN")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}