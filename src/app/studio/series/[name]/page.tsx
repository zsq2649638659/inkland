"use client";
import SiteIcon from "@/components/SiteIcon";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { SkeletonSeriesDetail } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthProvider";
import { useAppDialog } from "@/components/AppDialogProvider";
import DefaultAvatar from "@/components/DefaultAvatar";
import Input from "@/components/inkland/Input";
import Textarea from "@/components/inkland/Textarea";
import Tag from "@/components/inkland/Tag";
import TagInput from "@/components/inkland/TagInput";
import { normalizeModerationReason } from "@shared/moderationReasons";

interface ChapterInfo {
  id: string;
  title: string;
  chapter_number: number;
  chapter_title: string;
  word_count: number;
  status: string;
  review_status: string;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface SeriesInfo {
  id: string;
  name: string;
  description: string;
  cover_url: string | null;
  tags: string[];
  status: string;
  series_type: string;
  created_at: string;
  updated_at: string;
}

function formatDateYmd(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function SeriesManagePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const supabase = createClient();
  const { user } = useAuth();
  const dialog = useAppDialog();
  const router = useRouter();
  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSeries, setEditSeries] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [profile, setProfile] = useState<{ nickname: string; avatar_url: string | null } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") !== "1") return;
    const timer = window.setTimeout(() => setEditSeries(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    loadData();
  }, [decodedName, user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    // 系列、章节和创作者资料彼此独立，合并成一波请求。
    const seriesPromise = supabase
      .from("series")
      .select("*")
      .eq("name", decodedName)
      .eq("user_id", user.id)
      .single();
    const chaptersPromise = supabase
      .from("posts")
      .select("id, title, chapter_number, chapter_title, word_count, status, review_status, review_reason, created_at, updated_at")
      .eq("series_name", decodedName)
      .eq("post_type", "serial")
      .eq("user_id", user.id)
      .gt("chapter_number", 0)
      .order("chapter_number", { ascending: true });
    const profilePromise = supabase
      .from("profiles")
      .select("nickname, avatar_url")
      .eq("id", user.id)
      .single();
    const recentTagsPromise = supabase
      .from("user_tag_usage")
      .select("last_used_at, tags(name)")
      .eq("user_id", user.id)
      .order("last_used_at", { ascending: false })
      .limit(10);
    const [{ data: seriesData }, { data: chData }, { data: profileData }, { data: recentTagData }] = await Promise.all([
      seriesPromise,
      chaptersPromise,
      profilePromise,
      recentTagsPromise,
    ]);

    const recentTagNames = ((recentTagData || []) as Array<Record<string, unknown>>)
      .map((row) => {
        const tag = row.tags as { name?: string } | { name?: string }[] | null;
        return Array.isArray(tag) ? tag[0]?.name : tag?.name;
      })
      .filter((tag): tag is string => Boolean(tag));
    setRecentTags([...new Set(recentTagNames)].slice(0, 10));

    if (seriesData) {
      const s = seriesData as unknown as Record<string, unknown>;
      setSeries({
        id: s.id as string,
        name: s.name as string,
        description: (s.description as string) || "",
        cover_url: (s.cover_url as string) || null,
        tags: (s.tags as string[]) || [],
        status: (s.status as string) || "ongoing",
        series_type: (s.series_type as string) || "fanfic",
        created_at: s.created_at as string,
        updated_at: s.updated_at as string,
      });
      setEditName((s.name as string) || "");
      setEditDesc((s.description as string) || "");
      setEditTags((s.tags as string[]) || []);
    }

    if (chData) {
      setChapters(chData.map((c: Record<string, unknown>) => ({
        id: c.id as string,
        title: (c.title as string) || "无标题",
        chapter_number: c.chapter_number as number,
        chapter_title: (c.chapter_title as string) || "",
        word_count: (c.word_count as number) || 0,
        status: (c.status as string) || "draft",
        review_status: (c.review_status as string) || "approved",
        review_reason: (c.review_reason as string) || null,
        created_at: c.created_at as string,
        updated_at: c.updated_at as string,
      })));
    }

    if (profileData) {
      setProfile(profileData as { nickname: string; avatar_url: string | null });
    }

    setLoading(false);
  };

  const handleSaveSeries = async () => {
    if (!series || !user) return;
    const nextName = editName.trim();
    if (!nextName) { await dialog.alert({ title:"保存失败", message:"连载标题不能为空", variant:"danger" }); return; }
    const { error } = await supabase
      .from("series")
      .update({
        name: nextName,
        description: editDesc,
        tags: editTags,
      })
      .eq("id", series.id);

    if (error) { await dialog.alert({ title:"保存失败", message:error.message, variant:"danger" }); return; }
    if (nextName !== series.name) {
      const { error: chapterError } = await supabase
        .from("posts")
        .update({ series_name: nextName })
        .eq("series_name", series.name)
        .eq("post_type", "serial")
        .eq("user_id", user.id);
      if (chapterError) {
        await supabase.from("series").update({ name: series.name }).eq("id", series.id);
        await dialog.alert({ title:"保存失败", message:chapterError.message, variant:"danger" });
        return;
      }
    }
    setSeries({ ...series, name: nextName, description: editDesc, tags: editTags });
    setEditSeries(false);
    if (nextName !== series.name) router.replace(`/studio/series/${encodeURIComponent(nextName)}`);
  };

  const handleDeleteChapter = async (chId: string) => {
    if (!await dialog.confirm({ title:"删除章节", message:"确定要删除这一章吗？删除后无法恢复。", confirmLabel:"删除章节", variant:"danger" })) return;
    await supabase.from("posts").delete().eq("id", chId);
    setChapters((prev) => prev.filter((c) => c.id !== chId));
  };

  const handleSeriesStatus = async (newStatus: string) => {
    if (!series) return;
    await supabase.from("series").update({ status: newStatus }).eq("id", series.id);
    setSeries({ ...series, status: newStatus });
  };

  const totalWords = chapters.reduce((s, c) => s + c.word_count, 0);
  const publishedCount = chapters.filter((c) => c.status === "published").length;
  const latestChapter = chapters[chapters.length - 1];
  const latestChapterTitle = latestChapter?.chapter_title || latestChapter?.title || "";
  const latestChapterLabel = latestChapter
    ? latestChapterTitle.startsWith(`第${latestChapter.chapter_number}章`)
      ? latestChapterTitle
      : `第${latestChapter.chapter_number}章 ${latestChapterTitle || "无标题"}`
    : "暂无";

  const sortedChapters = [...chapters].sort((a, b) => {
    return sortOrder === "asc"
      ? a.chapter_number - b.chapter_number
      : b.chapter_number - a.chapter_number;
  });

  const toggleSort = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const getStatusBadge = (ch: ChapterInfo) => {
    if (ch.review_status === "rejected") return { className: "ch-status-rejected", label: "未通过" };
    if (ch.status === "published") return { className: "ch-status-published", label: "已发布" };
    if (ch.review_status === "pending") return { className: "ch-status-review", label: "审核中" };
    return { className: "ch-status-draft", label: "草稿" };
  };

  const getChapterDisplayTitle = (ch: ChapterInfo) => {
    const rawTitle = ch.chapter_title || ch.title || "";
    const title = rawTitle.replace(new RegExp(`^第\\s*${ch.chapter_number}\\s*章\\s*`), "").trim();
    return title || "无标题";
  };

  const renderChapterActions = (chapterId: string, className: string) => (
    <div className={className}>
      <Link href={`/create?editPost=${chapterId}`} className="chapter-control" title="编辑" aria-label="编辑章节">
        <SiteIcon name="fa-action-edit" size={16} />
      </Link>
      <Link href={`/read/${chapterId}`} className="chapter-control" title="预览" aria-label="预览章节" target="_blank">
        <SiteIcon name="fa-action-preview-open" size={16} />
      </Link>
      <button className="chapter-control" title="删除" aria-label="删除章节" onClick={() => handleDeleteChapter(chapterId)} type="button">
        <SiteIcon name="fa-action-delete" variant="outline" size={14} />
      </button>
    </div>
  );

  if (loading) return <div id="page-series" className="min-h-screen bg-paper"><SkeletonSeriesDetail /></div>;

  if (!user) {
    return <div id="page-series" className="min-h-screen bg-paper flex items-center justify-center"><p className="text-muted">请先登录</p></div>;
  }

  return (
    <div id="page-series" className="min-h-screen bg-paper">
      <div className="page-wrapper">
        <div className="content-container">

          {/* Hero Card */}
          <div className="hero-card">
            <div className="hero-title-row">
              <div className="hero-title-left">
                <h1 className="hero-title">{series?.name || decodedName}</h1>
                <Tag variant={series?.status === "completed" ? "status-complete" : "status-active"} className="serial-badge">
                  {series?.status === "ongoing" ? "连载中" : "已完结"}
                </Tag>
              </div>
              <div className="series-hero-actions">
                <button className="hero-action-btn primary" onClick={() => setEditSeries(!editSeries)}>
                  编辑信息
                </button>
                {series?.status === "ongoing" ? (
                  <button className="hero-action-btn" onClick={() => handleSeriesStatus("completed")}>
                    标记完结
                  </button>
                ) : (
                  <button className="hero-action-btn" onClick={() => handleSeriesStatus("ongoing")}>
                    恢复连载
                  </button>
                )}
              </div>
            </div>

            <div className="hero-meta-row">
              <div className="hero-author">
                <div className="hero-author-avatar">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" />
                  ) : (
                    <DefaultAvatar name={profile?.nickname || user?.email?.split("@")[0] || "我"} />
                  )}
                </div>
                <span className="hero-author-label">作者</span>
                <span className="hero-author-name">{profile?.nickname || user?.email?.split("@")[0] || "我"}</span>
              </div>
              <span className="meta-item">
                <span className="meta-label">最近更新</span>
                <span>{latestChapter ? formatDateYmd(latestChapter.updated_at) : "暂无"}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">最新章节</span>
                <span>{latestChapterLabel}</span>
              </span>
            </div>

            <div className="hero-stats-row">
              <div className="hero-stat-item">
                <span className="stat-label">总章节</span>
                <span className="stat-value">{chapters.length}</span>
              </div>
              <span className="stat-sep">|</span>
              <div className="hero-stat-item">
                <span className="stat-label">总字数</span>
                <span className="stat-value">{totalWords.toLocaleString()}</span>
              </div>
              <span className="stat-sep">|</span>
              <div className="hero-stat-item">
                <span className="stat-label">已发布</span>
                <span className="stat-value">{publishedCount}</span>
              </div>
            </div>

            {/* 简介展示区 */}
            {series?.description && !editSeries && (
              <div className="synopsis-row">
                <div className="synopsis-header">
                  <span className="synopsis-title">作品简介</span>
                </div>
                <p className="synopsis-text">{series.description}</p>
              </div>
            )}

            {/* 标签展示区 */}
            {series && series.tags.length > 0 && !editSeries && (
              <div className="tags-row">
                {series.tags.map((tag) => (
                  <span key={tag} className="tag tag--site site-card__tag">{tag}</span>
                ))}
              </div>
            )}

            {/* Edit panel — 重新设计的编辑区域 */}
            {editSeries && series && (
              <div className="series-edit-panel">
                {/* 连载标题编辑 */}
                <div className="edit-field">
                  <Input
                    label="连载标题"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={20}
                    showLimitNumber
                    placeholder="输入连载标题"
                    historyKey="work-title"
                    historyLabel="连载标题"
                    onHistorySelect={setEditName}
                  />
                </div>

                {/* 标签编辑 */}
                <div className="edit-field">
                  <div className="edit-field-header">
                    <span className="edit-field-label">标签</span>
                    <span className="edit-field-count">{editTags.length} 个</span>
                  </div>
                  <TagInput
                    tags={editTags}
                    inputValue={editTagInput}
                    onChange={setEditTags}
                    onInputValueChange={setEditTagInput}
                    fieldClassName="series-edit-tag-input"
                    placeholder="输入标签后按回车添加..."
                    suggestedTags={recentTags}
                    onSelectSuggestedTag={(tag) => setEditTags((current) => current.includes(tag) ? current : [...current, tag])}
                  />
                  <p className="edit-field-hint">按 Enter 确认添加，按 Backspace 删除最后一个标签</p>
                </div>

                {/* 简介编辑 */}
                <div className="edit-field">
                  <div className="edit-field-header">
                    <span className="edit-field-label">简介</span>
                  </div>
                  <Textarea
                    className="desc-edit-input"
                    value={editDesc}
                    onChange={(event) => setEditDesc(event.target.value)}
                    maxLength={500}
                    showLimitNumber
                    height="autosize"
                    autosize={{ minRows: 1 }}
                    placeholder="写下这个系列的简介，让读者更好地了解你的作品..."
                    autoComplete="off"
                    historyKey="series-description"
                    historyLabel="连载简介"
                    onHistorySelect={setEditDesc}
                  />
                </div>

                {/* 操作按钮 */}
                <div className="series-edit-actions">
                  <button
                    className="series-edit-control"
                    data-tone="neutral"
                    onClick={() => {
                      setEditSeries(false);
                      setEditName(series.name || "");
                      setEditDesc(series.description || "");
                      setEditTags(series.tags || []);
                    }}
                    type="button"
                  >
                    取消
                  </button>
                  <button className="series-edit-control" data-tone="brand" onClick={handleSaveSeries} type="button">
                    保存修改
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Chapter Management Section */}
          <div className="chapter-section">
            <div className="chapter-section-header">
              <div>
                <span className="chapter-section-title">章节管理</span>
                <span className="chapter-section-count">共 {chapters.length} 章</span>
              </div>
              <div className="chapter-header-actions">
                {chapters.length > 0 && (
                  <button
                    className="series-chapter-sort"
                    onClick={toggleSort}
                    type="button"
                    title={sortOrder === "asc" ? "切换为倒序" : "切换为正序"}
                    aria-label={sortOrder === "asc" ? "切换为倒序" : "切换为正序"}
                  >
                    <SiteIcon name={sortOrder === "asc" ? "fa-arrow-up-wide-short" : "fa-arrow-down-wide-short"} variant="solid" aria-hidden="true" />
                    <span className="series-chapter-sort-label">{sortOrder === "asc" ? "正序" : "倒序"}</span>
                  </button>
                )}
                <Link
                  href={`/create?seriesName=${encodeURIComponent(decodedName)}`}
                  className="series-chapter-create"
                  title="新建章节"
                  aria-label="新建章节"
                >
                  <SiteIcon name="fa-plus" variant="solid" className="series-chapter-create-icon" aria-hidden="true" />
                  <span className="series-chapter-create-label">新建章节</span>
                </Link>
              </div>
            </div>
            <div className="chapter-table-wrapper">
              <table className="chapter-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>章节标题</th>
                    <th>字数</th>
                    <th>更新时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {chapters.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="chapter-table-empty">
                        <div className="chapter-list-empty-illustration">
                          <div className="empty-tag-ring">
                            <div className="tag-ring-outer"></div>
                            <div className="tag-ring-inner">
                              <SiteIcon name="fa-file-lines" variant="solid" />
                            </div>
                          </div>
                        </div>
                        <span>暂无章节数据，点击“新建章节”开始创作</span>
                      </td>
                    </tr>
                  ) : (
                    sortedChapters.map((ch) => {
                      const badge = getStatusBadge(ch);
                      return (
                        <tr key={ch.id}>
                          <td><span className="ch-number">第{ch.chapter_number}章</span></td>
                          <td>
                            <span className="ch-title">
                              <Link href={`/read/${ch.id}`} target="_blank">
                                {getChapterDisplayTitle(ch)}
                              </Link>
                            </span>
                            {ch.review_status === "rejected" && ch.review_reason && <p className="chapter-review-reason"><SiteIcon name="fa-circle-exclamation" variant="solid" aria-hidden="true" />{normalizeModerationReason(ch.review_reason) || ch.review_reason}</p>}
                          </td>
                          <td><span className="ch-words">{ch.word_count?.toLocaleString() || 0}</span></td>
                          <td><span className="ch-time">{formatDateYmd(ch.updated_at || ch.created_at)}</span></td>
                          <td><span className={badge.className}>{badge.label}</span></td>
                          <td>{renderChapterActions(ch.id, "chapter-actions")}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {chapters.length === 0 ? (
              <div className="chapter-mobile-empty">
                <div className="chapter-list-empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <SiteIcon name="fa-file-lines" variant="solid" />
                    </div>
                  </div>
                </div>
                <span>暂无章节数据，点击“新建章节”开始创作</span>
              </div>
            ) : (
              <div className="chapter-mobile-list" aria-label="章节列表">
                {sortedChapters.map((ch) => {
                  const badge = getStatusBadge(ch);
                  return (
                    <article className="chapter-card" key={`mobile-${ch.id}`}>
                      <div className="chapter-card-topline">
                        <div className="chapter-card-heading">
                          <span className="chapter-card-number">第{ch.chapter_number}章</span>
                          <Link className="chapter-card-title" href={`/read/${ch.id}`} target="_blank">
                            {getChapterDisplayTitle(ch)}
                          </Link>
                        </div>
                        <span className={badge.className}>{badge.label}</span>
                      </div>
                      <div className="chapter-card-meta">
                        <span className="chapter-card-time">更新时间 {formatDateYmd(ch.updated_at || ch.created_at)}</span>
                        <span className="chapter-card-words">字数 {ch.word_count?.toLocaleString() || 0}</span>
                      </div>
                      {ch.review_status === "rejected" && ch.review_reason && <p className="chapter-review-reason"><SiteIcon name="fa-circle-exclamation" variant="solid" aria-hidden="true" />{normalizeModerationReason(ch.review_reason) || ch.review_reason}</p>}
                      {renderChapterActions(ch.id, "chapter-card-actions")}
                    </article>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
