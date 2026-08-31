"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { SkeletonLine } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthProvider";

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

export default function SeriesManagePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const supabase = createClient();
  const { user } = useAuth();
  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSeries, setEditSeries] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [profile, setProfile] = useState<{ nickname: string; avatar_url: string | null } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

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
    const [{ data: seriesData }, { data: chData }, { data: profileData }] = await Promise.all([
      seriesPromise,
      chaptersPromise,
      profilePromise,
    ]);

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
    if (!series) return;
    const { error } = await supabase
      .from("series")
      .update({
        description: editDesc,
        tags: editTags,
      })
      .eq("id", series.id);

    if (error) { alert("保存失败: " + error.message); return; }
    setSeries({ ...series, description: editDesc, tags: editTags });
    setEditSeries(false);
  };

  const handleDeleteChapter = async (chId: string) => {
    if (!confirm("确定要删除这一章吗？")) return;
    await supabase.from("posts").delete().eq("id", chId);
    setChapters((prev) => prev.filter((c) => c.id !== chId));
  };

  const handleSeriesStatus = async (newStatus: string) => {
    if (!series) return;
    await supabase.from("series").update({ status: newStatus }).eq("id", series.id);
    setSeries({ ...series, status: newStatus });
  };

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !editTags.includes(t)) {
      setEditTags([...editTags, t]);
      setEditTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setEditTags(editTags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(editTagInput);
    }
    if (e.key === "Backspace" && editTagInput === "" && editTags.length > 0) {
      removeTag(editTags[editTags.length - 1]);
    }
  };

  const totalWords = chapters.reduce((s, c) => s + c.word_count, 0);
  const publishedCount = chapters.filter((c) => c.status === "published").length;

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

  if (loading) return <div id="page-series" className="min-h-screen bg-[#f5f6f7]"><main className="max-w-5xl mx-auto px-4 py-8"><div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonLine key={i} height="3rem" />)}</div></main></div>;

  if (!user) {
    return <div id="page-series" className="min-h-screen bg-[#f5f6f7] flex items-center justify-center"><p className="text-muted">请先登录</p></div>;
  }

  return (
    <div id="page-series" className="min-h-screen bg-[#f5f6f7]">
      <div className="page-wrapper">
        <div className="content-container">

          {/* Hero Card */}
          <div className="hero-card">
            <div className="hero-title-row">
              <div className="hero-title-left">
                <h1 className="hero-title">{decodedName}</h1>
                <span className={`serial-badge ${series?.status === "completed" ? "completed" : ""}`}>
                  {series?.status === "ongoing" ? "连载中" : "已完结"}
                </span>
              </div>
              <div className="hero-actions">
                <button className="hero-action-btn primary" onClick={() => setEditSeries(!editSeries)}>
                  <i className="fa-solid fa-pencil" /> 编辑信息
                </button>
                {series?.status === "ongoing" ? (
                  <button className="hero-action-btn" onClick={() => handleSeriesStatus("completed")}>
                    <i className="fa-solid fa-flag" /> 标记完结
                  </button>
                ) : (
                  <button className="hero-action-btn" onClick={() => handleSeriesStatus("ongoing")}>
                    <i className="fa-solid fa-play" /> 恢复连载
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
                    <i className="fa-solid fa-user" />
                  )}
                </div>
                <span className="hero-author-name">{profile?.nickname || user?.email?.split("@")[0] || "我"}</span>
              </div>
              <span className="meta-sep">|</span>
              <span className="meta-item">
                最近更新 <span>{chapters.length > 0 ? new Date(chapters[chapters.length - 1].updated_at).toLocaleDateString("zh-CN") : "暂无"}</span>
              </span>
              {chapters.length > 0 && (
                <>
                  <span className="meta-sep">|</span>
                  <span className="meta-item">
                    最新章 <span>{chapters[chapters.length - 1].chapter_title || `第${chapters[chapters.length - 1].chapter_number}章`}</span>
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
              <span className="stat-sep">|</span>
              <div className="stat-item">
                <span className="stat-label">已发布</span>
                <span className="stat-value">{publishedCount}</span>
              </div>
            </div>

            {/* 简介展示区 */}
            {series?.description && !editSeries && (
              <>
                <div className="synopsis-header">
                  <span className="synopsis-title">作品简介</span>
                </div>
                <p className="synopsis-text">{series.description}</p>
              </>
            )}

            {/* 标签展示区 */}
            {series && series.tags.length > 0 && !editSeries && (
              <div className="tags-row">
                {series.tags.map((tag) => (
                  <span key={tag} className="card-tag">{tag}</span>
                ))}
              </div>
            )}

            {/* Edit panel — 重新设计的编辑区域 */}
            {editSeries && series && (
              <div className="series-edit-panel">
                {/* 标签编辑 */}
                <div className="edit-field">
                  <div className="edit-field-header">
                    <span className="edit-field-label">标签</span>
                    <span className="edit-field-count">{editTags.length} 个</span>
                  </div>
                  <div className="tag-edit-area">
                    {editTags.map((tag, idx) => (
                      <span key={tag} className="tag-edit-pill">
                        <span className="tag-edit-text">{tag}</span>
                        <span className="tag-chip-remove" data-index={idx} onClick={() => removeTag(tag)}>
                          <i className="fa-solid fa-xmark" />
                        </span>
                      </span>
                    ))}
                    <input
                      type="text"
                      className="tag-edit-input"
                      placeholder="输入标签后按回车添加..."
                      value={editTagInput}
                      onChange={(e) => setEditTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      autoComplete="off"
                    />
                  </div>
                  <p className="edit-field-hint">按 Enter 确认添加，按 Backspace 删除最后一个标签</p>
                </div>

                {/* 简介编辑 */}
                <div className="edit-field">
                  <div className="edit-field-header">
                    <span className="edit-field-label">简介</span>
                    <span className="edit-field-count">{editDesc.length} / 500</span>
                  </div>
                  <textarea
                    className="desc-edit-input"
                    value={editDesc}
                    onChange={(e) => {
                      if (e.target.value.length <= 500) setEditDesc(e.target.value);
                    }}
                    rows={4}
                    placeholder="写下这个系列的简介，让读者更好地了解你的作品..."
                    autoComplete="off"
                  />
                </div>

                {/* 操作按钮 */}
                <div className="edit-actions">
                  <button className="edit-save-btn" onClick={handleSaveSeries}>
                    <i className="fa-solid fa-check" /> 保存修改
                  </button>
                  <button
                    className="edit-cancel-btn"
                    onClick={() => {
                      setEditSeries(false);
                      setEditDesc(series.description || "");
                      setEditTags(series.tags || []);
                    }}
                  >
                    取消
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
                <span className="chapter-section-count"> &middot; 共 {chapters.length} 章</span>
              </div>
              <div className="chapter-header-actions">
                {chapters.length > 0 && (
                  <button className="sort-toggle" onClick={toggleSort}>
                    <i className="fa-solid fa-arrow-down" /> {sortOrder === "asc" ? "正序" : "倒序"}
                  </button>
                )}
                <Link href={`/create?seriesName=${encodeURIComponent(decodedName)}`} className="btn-new-chapter">
                  <i className="fa-solid fa-plus"></i> 新建章节
                </Link>
              </div>
            </div>
            <div className="chapter-table-wrapper">
              <table className="chapter-table">
                <thead>
                  <tr>
                    <th style={{ width: "80px" }}>序号</th>
                    <th style={{ width: "auto" }}>章节标题</th>
                    <th style={{ width: "80px" }}>字数</th>
                    <th style={{ width: "160px" }}>更新时间</th>
                    <th style={{ width: "90px" }}>状态</th>
                    <th style={{ width: "100px" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {chapters.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-light)", fontSize: "var(--font-size-base)" }}>
                        暂无章节数据，点击"新建章节"开始创作
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
                                {ch.chapter_title || ch.title || "无标题"}
                              </Link>
                            </span>
                            {ch.review_status === "rejected" && ch.review_reason && (
                              <p className="text-xs text-red-500 mt-0.5" style={{ margin: "2px 0 0" }}>
                                <i className="fa-solid fa-circle-exclamation mr-1" />{ch.review_reason}
                              </p>
                            )}
                          </td>
                          <td><span className="ch-words">{ch.word_count?.toLocaleString() || 0}</span></td>
                          <td><span className="ch-time">{new Date(ch.updated_at || ch.created_at).toLocaleDateString("zh-CN")}</span></td>
                          <td><span className={badge.className}>{badge.label}</span></td>
                          <td>
                            <div className="ch-actions">
                              <Link href={`/create?editPost=${ch.id}`} className="ch-action-btn" title="编辑">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                </svg>
                              </Link>
                              <Link href={`/read/${ch.id}`} className="ch-action-btn" title="查看" target="_blank">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </Link>
                              <button className="ch-action-btn" title="删除" onClick={() => handleDeleteChapter(ch.id)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
