"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
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
  const [editCover, setEditCover] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, [decodedName, user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    // 从 series 表获取
    const { data: seriesData } = await supabase
      .from("series")
      .select("*")
      .eq("name", decodedName)
      .eq("user_id", user.id)
      .single();

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
      setEditCover((s.cover_url as string) || "");
      setEditTags((s.tags as string[]) || []);
    }

    // 获取所有章节
    const { data: chData } = await supabase
      .from("posts")
      .select("id, title, chapter_number, chapter_title, word_count, status, review_status, review_reason, created_at, updated_at")
      .eq("series_name", decodedName)
      .eq("post_type", "serial")
      .eq("user_id", user.id)
      .gt("chapter_number", 0)
      .order("chapter_number", { ascending: true });

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

    setLoading(false);
  };

  const handleSaveSeries = async () => {
    if (!series) return;
    const { error } = await supabase
      .from("series")
      .update({
        description: editDesc,
        cover_url: editCover || null,
        tags: editTags,
      })
      .eq("id", series.id);

    if (error) { alert("保存失败: " + error.message); return; }
    setSeries({ ...series, description: editDesc, cover_url: editCover || null, tags: editTags });
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

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) { alert("请选择图片文件"); return; }
    if (file.size > 5 * 1024 * 1024) { alert("封面图片大小不能超过5MB"); return; }
    setUploadingCover(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploadingCover(false); return; }
    const fileExt = file.name.split(".").pop() || "png";
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt}`;
    const { error } = await supabase.storage.from("post-images").upload(fileName, file, { upsert: true });
    if (error) { alert("上传失败: " + error.message); setUploadingCover(false); return; }
    const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(fileName);
    if (urlData?.publicUrl) setEditCover(urlData.publicUrl);
    setUploadingCover(false);
    if (coverFileInputRef.current) coverFileInputRef.current.value = "";
  }, [supabase]);

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

  if (loading) return <div className="min-h-screen bg-paper"><main className="max-w-5xl mx-auto px-4 py-8"><div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonLine key={i} height="3rem" />)}</div></main></div>;

  if (!user) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><p className="text-muted">请先登录</p></div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f6f7]">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 text-sm text-muted mb-4">
          <Link href="/studio" className="text-accent no-underline">创作中心</Link>
          <i className="fa-solid fa-chevron-right text-xs" />
          <span className="text-warm font-medium">{decodedName}</span>
        </div>

        {/* 连载信息卡片 */}
        {series ? (
          <div className="bg-card rounded-xl border border-rule p-5 mb-6">
            <div className="flex gap-5">
              <div className="w-28 min-h-32 self-stretch rounded-lg overflow-hidden bg-accent-light flex-shrink-0 shadow-sm">
                {series.cover_url ? (
                  <img src={series.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-light/60 to-accent-light/20">
                    <i className="fa-solid fa-book text-3xl text-accent/30" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-xl font-bold text-warm">{decodedName}</h1>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${series.status === "ongoing" ? "bg-green-50 text-green-600 border border-green-200" : "bg-gray-50 text-muted border border-gray-200"}`}>
                    {series.status === "ongoing" ? "连载中" : "已完结"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted mb-3">
                  <span><i className="fa-solid fa-list-ul mr-1 text-accent text-xs" />{chapters.length} 章</span>
                  <span><i className="fa-solid fa-font mr-1 text-accent text-xs" />{totalWords.toLocaleString()} 字</span>
                  <span><i className="fa-solid fa-check-circle mr-1 text-accent text-xs" />{publishedCount} 章已发布</span>
                </div>
                {series.tags.length > 0 && (
                  <div className="flex gap-1.5 mb-2">
                    {series.tags.map((t) => <span key={t} className="tag text-xs">{t}</span>)}
                  </div>
                )}
                <p className="text-sm text-muted whitespace-pre-line">{series.description || "暂无简介"}</p>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button className="text-xs text-accent hover:bg-accent-light px-3 py-1.5 rounded-md transition-colors border border-accent/30 bg-transparent cursor-pointer"
                  onClick={() => setEditSeries(!editSeries)}>
                  <i className="fa-solid fa-pen-to-square mr-1" />编辑信息
                </button>
                {series.status === "ongoing" ? (
                  <button className="text-xs text-muted hover:bg-gray-100 px-3 py-1.5 rounded-md transition-colors border border-rule bg-transparent cursor-pointer"
                    onClick={() => handleSeriesStatus("completed")}>
                    <i className="fa-solid fa-check mr-1" />标记完结
                  </button>
                ) : (
                  <button className="text-xs text-muted hover:bg-gray-100 px-3 py-1.5 rounded-md transition-colors border border-rule bg-transparent cursor-pointer"
                    onClick={() => handleSeriesStatus("ongoing")}>
                    <i className="fa-solid fa-rotate mr-1" />恢复连载
                  </button>
                )}
              </div>
            </div>

            {/* 编辑面板 */}
            {editSeries && (
              <div className="mt-4 pt-4 border-t border-rule space-y-3">
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  className="hidden"
                  onChange={handleCoverUpload}
                />
                <div>
                  <label className="text-xs text-muted block mb-1">封面图片</label>
                  <div className="flex items-center gap-3">
                    {editCover ? (
                      <div className="relative w-20">
                        <img src={editCover} alt="封面" className="w-20 h-28 object-cover rounded-lg border border-rule" />
                        <button
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[0.6rem] flex items-center justify-center border-none cursor-pointer"
                          onClick={() => setEditCover("")}
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    ) : null}
                    <button
                      className="text-xs text-accent border border-accent/30 rounded-lg px-3 py-1.5 bg-transparent cursor-pointer hover:bg-accent-light"
                      onClick={() => coverFileInputRef.current?.click()}
                      disabled={uploadingCover}
                    >
                      {uploadingCover ? (
                        <><i className="fa-solid fa-spinner animate-spin mr-1" />上传中...</>
                      ) : (
                        <><i className="fa-solid fa-cloud-arrow-up mr-1" />上传封面</>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">标签</label>
                  <div className="tag-input-wrap" onClick={() => { const inp = document.querySelector<HTMLInputElement>(".series-edit-tag-input"); inp?.focus(); }}>
                    {editTags.map((tag) => (
                      <span key={tag} className="tag-pill">
                        {tag}{" "}
                        <button onClick={() => setEditTags(editTags.filter((t) => t !== tag))}>&times;</button>
                      </span>
                    ))}
                    <input
                      type="text"
                      className="tag-input-inner series-edit-tag-input"
                      placeholder="输入标签，按回车添加..."
                      value={editTagInput}
                      onChange={(e) => setEditTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); const t = editTagInput.trim(); if (t && !editTags.includes(t)) { setEditTags([...editTags, t]); setEditTagInput(""); } }
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">简介</label>
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                    className="w-full px-3 py-1.5 text-sm border border-rule rounded-lg bg-card focus:outline-none focus:border-accent resize-none" />
                </div>
                <div className="flex gap-2">
                  <button className="submit-btn text-sm px-4 py-1.5" onClick={handleSaveSeries}>保存</button>
                  <button className="text-sm text-muted hover:text-warm px-4 py-1.5 border border-rule rounded-lg bg-transparent cursor-pointer"
                    onClick={() => { setEditSeries(false); setEditDesc(series.description || ""); setEditCover(series.cover_url || ""); setEditTags(series.tags || []); }}>取消</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-rule p-5 mb-6">
            <h1 className="text-xl font-bold text-warm">{decodedName}</h1>
            <p className="text-sm text-muted mt-1">该作品尚未在 series 表中注册，请先创建 series 元数据。</p>
          </div>
        )}

        {/* 章节管理 */}
        <div className="bg-card rounded-xl border border-rule overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-rule">
            <h2 className="font-semibold text-warm">
              章节管理
              <span className="text-xs text-muted ml-2 font-normal">共 {chapters.length} 章</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSort}
                className="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors px-2 py-1 rounded-md hover:bg-accent-light/30"
                title={sortOrder === "asc" ? "切换为倒序" : "切换为正序"}
              >
                <i className={`fa-solid fa-arrow-down-${sortOrder === "asc" ? "1-9" : "9-1"} text-[0.7rem]`} />
                <span>{sortOrder === "asc" ? "正序" : "倒序"}</span>
              </button>
              <Link href={`/create?seriesName=${encodeURIComponent(decodedName)}`} className="btn-accent text-xs no-underline">
                <i className="fa-solid fa-plus mr-1" />新建章节
              </Link>
            </div>
          </div>

          {chapters.length === 0 ? (
            <div className="text-center py-16">
              <i className="fa-solid fa-feather-pointed text-4xl text-accent/20 mb-3 block" />
              <p className="text-muted mb-4">还没有任何章节</p>
              <Link href={`/create?seriesName=${encodeURIComponent(decodedName)}`} className="btn-accent no-underline text-sm">
                <i className="fa-solid fa-plus mr-1" />新建第一章
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-rule">
              {sortedChapters.map((ch) => (
                <div key={ch.id} className="flex items-center px-5 py-3.5 hover:bg-paper dark:hover:bg-[#333] transition-colors">
                  <span className="text-xs text-muted w-12 flex-shrink-0">第{ch.chapter_number}章</span>
                  <div className="flex-1 min-w-0">
                    <Link href={`/read/${ch.id}`} className="text-sm text-warm hover:text-accent no-underline truncate block" target="_blank">
                      {ch.chapter_title || ch.title || "无标题"}
                    </Link>
                    {ch.review_status === "rejected" && ch.review_reason && (
                      <p className="text-xs text-red-500 mt-0.5">
                        <i className="fa-solid fa-circle-exclamation mr-1" />{ch.review_reason}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted flex-shrink-0 ml-3">{ch.word_count?.toLocaleString() || 0} 字</span>
                  <span className={`text-[0.6rem] px-2 py-0.5 rounded-full flex-shrink-0 ml-3 ${
                    ch.review_status === "rejected" ? "bg-red-50 text-red-600 border border-red-200" :
                    ch.status === "published" ? "bg-green-50 text-green-600 border border-green-200" : "bg-orange-50 text-orange-500 border border-orange-200"
                  }`}>
                    {ch.review_status === "rejected" ? "未过审" : ch.status === "published" ? "已发布" : "草稿"}
                  </span>
                  <span className="text-xs text-muted flex-shrink-0 ml-3 w-20 text-right">
                    {new Date(ch.updated_at || ch.created_at).toLocaleDateString("zh-CN")}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    <Link href={`/create?editPost=${ch.id}`} className="text-xs text-accent hover:bg-accent-light px-2 py-1 rounded-md transition-colors no-underline">
                      <i className="fa-solid fa-pen-to-square" />
                    </Link>
                    <button className="text-xs text-red-400 hover:bg-red-50 px-2 py-1 rounded-md transition-colors border-none bg-transparent cursor-pointer"
                      onClick={() => handleDeleteChapter(ch.id)}>
                      <i className="fa-solid fa-trash-can" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}