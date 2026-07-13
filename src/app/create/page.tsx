"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import { createClient } from "@/lib/supabase/browser";
import { useMarkdownEditor } from "@/lib/useMarkdownEditor";

marked.setOptions({ breaks: true, gfm: true });

// ============ 类型定义 ============

type ViewType = "select" | "text" | "image" | "series-create" | "series-detail" | "chapter-create";

interface SeriesInfo {
  id: string;
  name: string;
  description: string;
  tags: string[];
  status: "ongoing" | "completed";
  series_type: "fanfic" | "original";
  cover_url: string | null;
  chapter_count: number;
  created_at: string;
}

interface ChapterInfo {
  id: string;
  title: string;
  chapter_number: number;
  word_count: number;
  created_at: string;
}

// ============ 工具栏组件（共用） ============

function EditorToolbar({
  onBold, onItalic, onUnderline, onStrikethrough,
  onHr, onImage, previewMode, onTogglePreview,
  uploadingImage, uploadedCount,
}: {
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrikethrough: () => void;
  onHr: () => void;
  onImage: () => void;
  previewMode: boolean;
  onTogglePreview: () => void;
  uploadingImage: boolean;
  uploadedCount: number;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap p-2 rounded-lg bg-white border border-rule sticky top-[72px] z-40">
      <button className="tool-btn" onClick={onBold} title="加粗" type="button">
        <i className="fa-solid fa-bold" />
      </button>
      <button className="tool-btn" onClick={onItalic} title="斜体" type="button">
        <i className="fa-solid fa-italic" />
      </button>
      <button className="tool-btn" onClick={onUnderline} title="下划线" type="button">
        <i className="fa-solid fa-underline" />
      </button>
      <button className="tool-btn" onClick={onStrikethrough} title="删除线" type="button">
        <i className="fa-solid fa-strikethrough" />
      </button>

      <span className="w-px h-5 bg-rule mx-1" />

      <button
        className={`tool-btn ${uploadingImage ? "opacity-50" : ""}`}
        onClick={onImage}
        title="上传图片"
        disabled={uploadingImage}
        type="button"
      >
        <i className={`fa-solid ${uploadingImage ? "fa-spinner animate-spin" : "fa-image"}`} />
      </button>
      <button className="tool-btn" onClick={onHr} title="分割线" type="button">
        <i className="fa-solid fa-minus" />
      </button>

      <span className="flex-1" />

      {uploadedCount > 0 && (
        <span className="text-xs text-muted mr-2">
          <i className="fa-solid fa-check-circle text-green-500 mr-1" />
          {uploadedCount} 张
        </span>
      )}

      <button
        className={`tool-btn ${previewMode ? "active" : ""}`}
        onClick={onTogglePreview}
        title={previewMode ? "编辑" : "预览"}
        type="button"
      >
        <i className={`fa-solid fa-${previewMode ? "pen-to-square" : "eye"}`} />
        <span className="text-xs ml-1 hidden sm:inline">{previewMode ? "编辑" : "预览"}</span>
      </button>
    </div>
  );
}

// ============ 标签输入组件（共用） ============

function TagInput({
  tags, setTags, inputVal, setInputVal, recommended, wrapperClass,
}: {
  tags: string[];
  setTags: (v: string[]) => void;
  inputVal: string;
  setInputVal: (v: string) => void;
  recommended: string[];
  wrapperClass: string;
}) {
  const addTag = () => {
    const t = inputVal.trim();
    if (t && !tags.includes(t)) { setTags([...tags, t]); setInputVal(""); }
  };

  return (
    <div>
      <div
        className="tag-input-wrap"
        onClick={() => {
          const inp = document.querySelector<HTMLInputElement>(`.${wrapperClass}`);
          inp?.focus();
        }}
      >
        {tags.map((tag) => (
          <span key={tag} className="tag-pill">
            {tag}{" "}
            <button onClick={() => setTags(tags.filter((t) => t !== tag))}>&times;</button>
          </span>
        ))}
        <input
          type="text"
          className={`tag-input-inner ${wrapperClass}`}
          placeholder="输入标签，按回车添加..."
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addTag(); }
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="text-xs text-muted">近期使用：</span>
        {recommended.map((tag) => (
          <button
            key={tag}
            className="text-xs text-accent bg-transparent border-none cursor-pointer hover:underline"
            onClick={() => { if (!tags.includes(tag)) setTags([...tags, tag]); }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ 发布页头 ============

function PublishHeader({
  title, onSubmit, submitting,
}: {
  title: string;
  onSubmit?: () => void;
  submitting?: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-rule">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="btn-ghost no-underline">
          <i className="fa-solid fa-arrow-left mr-1" />返回
        </Link>
        <span className="text-sm font-medium text-warm">{title}</span>
        {onSubmit ? (
          <button className="submit-btn" onClick={onSubmit} disabled={submitting}>
            <i className="fa-solid fa-paper-plane mr-1" />
            {submitting ? "发布中..." : "发布"}
          </button>
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}

// ============ 主组件 ============

export default function CreatePage() {
  const supabase = createClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const editor = useMarkdownEditor();

  // ---- 视图 ----
  const [view, setView] = useState<ViewType>("select");
  const [initDone, setInitDone] = useState(false);

  // ---- 处理 URL 参数 ----
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editSeries = params.get("editSeries");
    const editPost = params.get("editPost");
    const seriesName = params.get("seriesName");

    if (editSeries) {
      // 直接跳转到连载管理页面
      router.push("/studio");
      setInitDone(true);
    } else if (seriesName) {
      // 从 URL 参数 ?seriesName=xxx 创建章节
      setSeriesNameFromUrl(seriesName);
      const initChapter = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setInitDone(true); return; }
        // 计算下一个章节号
        const { data: chapters } = await supabase
          .from("posts")
          .select("chapter_number")
          .eq("user_id", user.id)
          .eq("series_name", seriesName)
          .eq("post_type", "serial")
          .order("chapter_number", { ascending: false })
          .limit(1);
        const nextNum = chapters && chapters.length > 0
          ? ((chapters[0] as Record<string, unknown>).chapter_number as number) + 1
          : 1;
        setChapterNumberFromUrl(nextNum);
        setView("chapter-create");
        setInitDone(true);
      };
      initChapter();
    } else if (editPost) {
      // 加载已有作品进行编辑
      setEditPostId(editPost);
      const loadPost = async () => {
        const { data } = await supabase
          .from("posts")
          .select("id, title, content, post_type, cover_url, series_name, chapter_number, review_status, review_reason")
          .eq("id", editPost)
          .single();
        if (data) {
          const p = data as unknown as Record<string, unknown>;
          setTitle(p.title as string || "");
          editor.setContent(p.content as string || "");
          setEditingPostSeriesName((p.series_name as string) || null);
          if (p.review_status === "rejected") {
            setReviewRejectionReason((p.review_reason as string) || "未提供原因");
          }
          if (p.post_type === "illustration") {
            setView("image");
            // 提取已有图片
            const content = p.content as string;
            const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
            const existingImages: { name: string; url: string }[] = [];
            let match;
            while ((match = imgRegex.exec(content)) !== null) {
              existingImages.push({ name: match[1], url: match[2] });
            }
            setUploadedImages(existingImages);
            // 提取图片描述
            let textOnly = content.replace(/!\[.*?\]\(.*?\)/g, "").trim();
            const titleText = (p.title as string || "").trim();
            if (titleText && textOnly.startsWith(titleText)) {
              textOnly = textOnly.substring(titleText.length).trim();
            }
            setImageDesc(textOnly);
          } else {
            setView("text");
          }
          // 加载已有标签
          const { data: ptData } = await supabase
            .from("post_tags")
            .select("tags(name)")
            .eq("post_id", editPost);
          if (ptData) {
            const existingTags = (ptData as Array<{ tags: { name: string }[] | { name: string } | null }>)
              .map((pt) => {
                if (!pt.tags) return null;
                if (Array.isArray(pt.tags)) return pt.tags[0]?.name;
                return pt.tags.name;
              })
              .filter(Boolean) as string[];
            setTags(existingTags);
          }
        }
      };
      loadPost();
      setInitDone(true);
    } else {
      setInitDone(true);
    }
  }, []);

  // ---- 通用字段 ----
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [previewMode, setPreviewMode] = useState(false);

  // ---- 图片 ----
  const [uploadedImages, setUploadedImages] = useState<{ name: string; url: string }[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageDesc, setImageDesc] = useState("");

  // ---- 合集 ----
  const [collectionMode, setCollectionMode] = useState<"none" | "select" | "create">("none");
  const [collectionName, setCollectionName] = useState("");
  const [collectionDesc, setCollectionDesc] = useState("");
  const [collectionTags, setCollectionTags] = useState<string[]>([]);
  const [collectionTagInput, setCollectionTagInput] = useState("");
  const [existingCollections, setExistingCollections] = useState<{ name: string; count: number }[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");

  // ---- 长篇连载 ----
  const [currentSeries, setCurrentSeries] = useState<SeriesInfo | null>(null);
  const [chapterList, setChapterList] = useState<ChapterInfo[]>([]);
  const [newSeriesName, setNewSeriesName] = useState("");
  const [newSeriesDesc, setNewSeriesDesc] = useState("");
  const [newSeriesTags, setNewSeriesTags] = useState<string[]>([]);
  const [newSeriesTagInput, setNewSeriesTagInput] = useState("");
  const [newSeriesStatus, setNewSeriesStatus] = useState<"ongoing" | "completed">("ongoing");
  const [newSeriesType, setNewSeriesType] = useState<"fanfic" | "original">("fanfic");
  const [editingSeries, setEditingSeries] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [newSeriesCover, setNewSeriesCover] = useState<string | null>(null);

  // ---- 编辑模式 ----
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const [reviewRejectionReason, setReviewRejectionReason] = useState<string | null>(null);
  const [editingPostSeriesName, setEditingPostSeriesName] = useState<string | null>(null);
  const [seriesNameFromUrl, setSeriesNameFromUrl] = useState<string | null>(null);
  const [chapterNumberFromUrl, setChapterNumberFromUrl] = useState<number>(1);

  const wordCount = editor.content.replace(/\s/g, "").length;
  const [recommendedTags, setRecommendedTags] = useState<string[]>(["HE", "BE", "短篇", "正剧向", "已完结"]);

  // 加载近期使用标签
  useEffect(() => {
    const loadRecentTags = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // 获取用户最近的 post_ids
      const { data: posts } = await supabase
        .from("posts")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!posts || posts.length === 0) return;
      const postIds = (posts as Record<string, unknown>[]).map((p) => p.id as string);
      // 从 post_tags 获取这些 post 的 tag_id
      const { data: postTags } = await supabase
        .from("post_tags")
        .select("tag_id")
        .in("post_id", postIds);
      if (!postTags || postTags.length === 0) return;
      // 去重并获取 tag_id 列表
      const tagIds = [...new Set((postTags as Record<string, unknown>[]).map((pt) => pt.tag_id as string))];
      // 查询 tags 表获取标签名
      const { data: tags } = await supabase
        .from("tags")
        .select("id, name")
        .in("id", tagIds);
      if (tags && tags.length > 0) {
        const tagNames = (tags as Record<string, unknown>[]).map((t) => t.name as string);
        const unique = [...new Set(tagNames)].slice(0, 10);
        if (unique.length > 0) setRecommendedTags(unique);
      }
    };
    loadRecentTags();
  }, []);

  // ============ 图片上传 ============

  const uploadImageToStorage = useCallback(async (file: File): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录后再上传图片"); return null; }

    const fileExt = file.name.split(".").pop() || "png";
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt}`;

    const { error } = await supabase.storage
      .from("post-images")
      .upload(fileName, file, { upsert: true });

    if (error) {
      if (error.message?.includes("Bucket") || error.message?.includes("not found")) {
        setErrorMsg("图片上传失败：存储桶 'post-images' 未创建。请在 Supabase Dashboard → Storage 中创建名为 'post-images' 的公开存储桶，并添加 INSERT 和 SELECT 策略。");
      } else {
        setErrorMsg(`图片上传失败: ${error.message}`);
      }
      return null;
    }
    const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(fileName);
    return urlData?.publicUrl || null;
  }, [supabase]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    setErrorMsg("");
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { setErrorMsg(`"${file.name}" 不是图片文件，已跳过`); continue; }
      const url = await uploadImageToStorage(file);
      if (url) {
        setUploadedImages((prev) => [...prev, { name: file.name, url }]);
        editor.insertAtCursor(`![${file.name}](${url})\n`);
      }
    }
    setUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadImageToStorage, editor]);

  const triggerImageUpload = () => fileInputRef.current?.click();

  // ============ 封面上传 ============

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setErrorMsg("请选择图片文件");
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("封面图片大小不能超过5MB");
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
      return;
    }
    setUploadingCover(true);
    setErrorMsg("");
    const url = await uploadImageToStorage(file);
    if (url) {
      setNewSeriesCover(url);
    }
    setUploadingCover(false);
    if (coverFileInputRef.current) coverFileInputRef.current.value = "";
  }, [uploadImageToStorage]);

  const triggerCoverUpload = () => coverFileInputRef.current?.click();

  // ============ 加载合集列表 ============

  const loadCollections = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("posts")
      .select("series_name")
      .eq("user_id", user.id)
      .not("series_name", "is", null)
      .neq("series_name", "");
    if (data) {
      const map = new Map<string, number>();
      for (const row of data) {
        const name = (row as Record<string, unknown>).series_name as string;
        map.set(name, (map.get(name) || 0) + 1);
      }
      const list: { name: string; count: number }[] = [];
      map.forEach((count, name) => list.push({ name, count }));
      setExistingCollections(list);
    }
  }, [supabase]);

  const loadChapters = useCallback(async (seriesName: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("posts")
      .select("id, title, chapter_number, word_count, created_at")
      .eq("user_id", user.id)
      .eq("series_name", seriesName)
      .eq("post_type", "serial")
      .neq("chapter_number", 0)
      .order("chapter_number", { ascending: true });

    if (data) {
      setChapterList(data as unknown as ChapterInfo[]);
    }
  }, [supabase]);

  useEffect(() => {
    if (view === "text" && collectionMode === "select") loadCollections();
  }, [view, collectionMode, loadCollections]);

  // ============ 保存标签 ============

  const saveTags = async (userId: string, postId?: string) => {
    if (tags.length === 0) return;
    let pid = postId;
    if (!pid) {
      const { data: posts } = await supabase
        .from("posts")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      pid = posts?.[0]?.id;
    }
    if (!pid) return;
    for (const tagName of tags) {
      const { data: existing } = await supabase.from("tags").select("id").eq("name", tagName).single();
      let tagId: string;
      if (existing) {
        tagId = existing.id;
      } else {
        const { data: newTag } = await supabase.from("tags").insert({ name: tagName, type: "fandom", post_count: 0 }).select("id").single();
        tagId = newTag!.id;
      }
      await supabase.from("post_tags").insert({ post_id: pid, tag_id: tagId });
    }
  };

  // ============ 发布单篇 ============

  const submitText = async () => {
    if (!editor.content.trim()) { setErrorMsg("请填写内容"); return; }
    setSubmitting(true);
    setErrorMsg("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    let finalSeriesName: string | null = null;
    if (collectionMode === "select" && selectedCollection) finalSeriesName = selectedCollection;
    if (collectionMode === "create" && collectionName.trim()) finalSeriesName = collectionName.trim();

    const postData: Record<string, unknown> = {
      title: title.trim() || "无标题",
      content: editor.content.trim(),
      word_count: wordCount,
      status: "published",
      post_type: uploadedImages.length > 0 ? "illustration" : "novel",
    };
    if (finalSeriesName) postData.series_name = finalSeriesName;

    if (editPostId) {
      const { error } = await supabase.from("posts").update(postData).eq("id", editPostId);
      if (error) { setErrorMsg(`更新失败: ${error.message}`); setSubmitting(false); return; }
    } else {
      const { error } = await supabase.from("posts").insert({ ...postData, user_id: user.id });
      if (error) { setErrorMsg(`发布失败: ${error.message}`); setSubmitting(false); return; }
    }

    await saveTags(user.id, editPostId || undefined);
    router.push("/");
    router.refresh();
  };

  // ============ 发布图片 ============

  const submitImage = async () => {
    if (uploadedImages.length === 0) { setErrorMsg("请至少上传一张图片"); return; }
    setSubmitting(true);
    setErrorMsg("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    const imageMd = uploadedImages.map((img) => `![${img.name}](${img.url})`).join("\n\n");
    const parts: string[] = [];
    if (title.trim()) parts.push(title.trim());
    if (imageDesc.trim()) parts.push(imageDesc.trim());
    parts.push(imageMd);
    const fullContent = parts.join("\n\n");

    const postData = {
      title: title.trim() || "图片分享",
      content: fullContent,
      word_count: fullContent.replace(/\s/g, "").length,
      status: "published",
      post_type: "illustration",
    };

    if (editPostId) {
      const { error } = await supabase.from("posts").update(postData).eq("id", editPostId);
      if (error) { setErrorMsg(`更新失败: ${error.message}`); setSubmitting(false); return; }
    } else {
      const { error } = await supabase.from("posts").insert({ ...postData, user_id: user.id });
      if (error) { setErrorMsg(`发布失败: ${error.message}`); setSubmitting(false); return; }
    }

    await saveTags(user.id, editPostId || undefined);
    router.push("/");
    router.refresh();
  };

  // ============ 创建/编辑连载 ============

  const createSeries = async () => {
    if (!newSeriesName.trim()) { setErrorMsg("请填写连载名称"); return; }
    setSubmitting(true);
    setErrorMsg("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    const seriesData = {
      name: newSeriesName.trim(),
      description: newSeriesDesc || null,
      cover_url: newSeriesCover || null,
      tags: newSeriesTags,
      status: newSeriesStatus,
      series_type: newSeriesType,
    };

    if (editingSeries && editingSeriesId) {
      const { error } = await supabase.from("series").update(seriesData).eq("id", editingSeriesId);
      if (error) { setErrorMsg(`更新失败: ${error.message}`); setSubmitting(false); return; }
      setSubmitting(false);
      router.push(`/studio/series/${encodeURIComponent(newSeriesName.trim())}`);
    } else {
      const { error } = await supabase.from("series").insert({ ...seriesData, user_id: user.id });
      if (error) { setErrorMsg(`创建失败: ${error.message}`); setSubmitting(false); return; }
      setSubmitting(false);
      router.push(`/studio/series/${encodeURIComponent(newSeriesName.trim())}`);
    }
  };

  // ============ 新增章节 ============

  const submitChapter = async () => {
    if (!title.trim()) { setErrorMsg("请填写章节标题"); return; }
    if (!editor.content.trim()) { setErrorMsg("请填写章节内容"); return; }

    const targetSeriesName = seriesNameFromUrl || currentSeries?.name;
    if (!targetSeriesName) return;

    setSubmitting(true);
    setErrorMsg("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    const nextChapter = seriesNameFromUrl
      ? chapterNumberFromUrl
      : chapterList.length > 0
        ? Math.max(...chapterList.map((c) => c.chapter_number)) + 1
        : 1;

    const { error } = await supabase.from("posts").insert({
      user_id: user.id,
      title: title.trim(),
      content: editor.content.trim(),
      word_count: editor.content.replace(/\s/g, "").length,
      status: "published",
      post_type: "serial",
      series_name: targetSeriesName,
      chapter_number: nextChapter,
      chapter_title: title.trim(),
    });

    // 如果 chapter_number 列不存在，去掉重试
    if (error) {
      if (error.message?.includes("chapter_number")) {
        // 列不存在，去掉 chapter_number 和 chapter_title 重试
        const { error: err2 } = await supabase.from("posts").insert({
          user_id: user.id,
          title: title.trim(),
          content: editor.content.trim(),
          word_count: editor.content.replace(/\s/g, "").length,
          status: "published",
          post_type: "serial",
          series_name: targetSeriesName,
        });
        if (err2) { setErrorMsg(`发布失败: ${err2.message}`); setSubmitting(false); return; }
      } else {
        setErrorMsg(`发布失败: ${error.message}`);
        setSubmitting(false);
        return;
      }
    }

    await saveTags(user.id);
    setSubmitting(false);
    if (seriesNameFromUrl) {
      router.push(`/studio/series/${encodeURIComponent(targetSeriesName)}`);
    } else {
      loadChapters(targetSeriesName);
      setView("series-detail");
      setTitle("");
      editor.setContent("");
      setTags([]);
    }
  };

  // ============ 渲染 HTML ============

  const renderHTML = () => ({ __html: marked.parse(editor.content) as string });

  // ============ 共用编辑器区域 ============

  const renderEditor = (placeholder: string) => (
    <>
      <EditorToolbar
        onBold={editor.bold} onItalic={editor.italic} onUnderline={editor.underline}
        onStrikethrough={editor.strikethrough} onHr={editor.hr} onImage={triggerImageUpload}
        previewMode={previewMode} onTogglePreview={() => setPreviewMode(!previewMode)}
        uploadingImage={uploadingImage} uploadedCount={uploadedImages.length}
      />
      <div className="min-h-[350px]">
        {previewMode ? (
          <div
            className="p-6 rounded-lg bg-white border border-rule min-h-[350px]"
            style={{
              fontFamily: '"Noto Serif SC", "Songti SC", "SimSun", serif',
              fontSize: "17px", lineHeight: 2, color: "#2c2416",
            }}
            dangerouslySetInnerHTML={renderHTML()}
          />
        ) : (
          <textarea
            ref={editor.textareaRef}
            className="editor-area"
            placeholder={placeholder}
            value={editor.content}
            onChange={(e) => editor.setContentRaw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Tab" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); editor.insertAtCursor("  "); } }}
          />
        )}
      </div>
      <div className="text-xs text-muted text-right mt-1">
        {wordCount.toLocaleString()} 字
      </div>
    </>
  );

  // ============ 共用错误提示 ============

  const renderError = () =>
    errorMsg && (
      <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
        <i className="fa-solid fa-circle-exclamation mr-1" />{errorMsg}
      </p>
    );

  // ============ 审核未通过提示 ============

  const renderRejectionBanner = () =>
    reviewRejectionReason && (
      <div className="bg-red-50 border border-red-300 rounded-lg p-4">
        <p className="text-sm text-red-600 font-medium">
          <i className="fa-solid fa-triangle-exclamation mr-2" />
          该作品未通过审核，原因：{reviewRejectionReason}
        </p>
      </div>
    );

  // ============ 视图路由 ============

  // ---- 类型选择 ----
  if (view === "select") {
    const types = [
      { view: "text" as ViewType, icon: "fa-file-lines", color: "#b8752e", label: "发布单篇", desc: "短文、随笔、博客式内容" },
      { view: "image" as ViewType, icon: "fa-images", color: "#e67e22", label: "发布图片", desc: "单张或多张图片分享" },
      { view: "series-create" as ViewType, icon: "fa-book-open", color: "#8e44ad", label: "长篇连载", desc: "分章节的小说连载" },
    ];

    return (
      <div className="min-h-screen bg-paper">
        <header className="sticky top-0 z-50 bg-white border-b border-rule">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="btn-ghost no-underline">
              <i className="fa-solid fa-arrow-left mr-1" />返回
            </Link>
            <span className="text-sm font-medium text-warm">选择发布类型</span>
            <span />
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-10">
          <h2 className="text-xl font-bold text-warm mb-2">选择发布类型</h2>
          <p className="text-sm text-muted mb-8">请根据你的内容选择合适的发布方式</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {types.map((t) => (
              <button
                key={t.view}
                className="flex flex-col items-center gap-3 p-6 rounded-xl bg-white border border-rule hover:border-accent hover:shadow-md transition-all cursor-pointer"
                onClick={() => { setErrorMsg(""); setView(t.view); if (t.view === "series-create") { setNewSeriesName(""); setNewSeriesDesc(""); setNewSeriesTags([]); setNewSeriesCover(null); setNewSeriesStatus("ongoing"); setNewSeriesType("fanfic"); setEditingSeries(false); setEditingSeriesId(null); } }}
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center"
                  style={{ background: `${t.color}15`, color: t.color }}
                >
                  <i className={`fa-solid ${t.icon} text-2xl`} />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-warm mb-0.5">{t.label}</h3>
                  <p className="text-xs text-muted">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ---- 发布单篇 ----
  if (view === "text") {
    return (
      <div className="min-h-screen bg-paper">
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
        <PublishHeader title={editPostId ? "编辑作品" : "发布单篇"} onSubmit={submitText} submitting={submitting} />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-5">
            {renderRejectionBanner()}
            {editingPostSeriesName && (
              <div className="text-sm text-muted bg-gray-50 border border-rule rounded-lg p-3">
                <i className="fa-solid fa-layer-group mr-1.5 text-accent" />
                所属合集：<span className="font-medium text-warm">{editingPostSeriesName}</span>
                <span className="text-xs text-muted ml-2">（只读，不可修改）</span>
              </div>
            )}
            <input
              type="text" placeholder="作品标题（选填）" className="input-field text-lg font-medium"
              style={{ padding: "14px 16px" }} value={title} onChange={(e) => setTitle(e.target.value)}
            />
            {renderEditor("开始创作你的故事...\n\n**加粗** | *斜体* | <u>下划线</u> | ~~删除线~~\n![图片描述](图片链接)\n--- 分割线")}
            <TagInput
              tags={tags} setTags={setTags} inputVal={tagInput} setInputVal={setTagInput}
              recommended={recommendedTags} wrapperClass="tag-main-input"
            />

            {/* 合集 - 仅新建时显示，编辑已有 series_name 时隐藏 */}
            {!editingPostSeriesName && (
              <div className="p-4 rounded-lg bg-white border border-rule">
                <label className="text-sm font-medium text-warm block mb-3">
                  <i className="fa-solid fa-layer-group mr-1.5 text-accent" />加入合集
                </label>
                <div className="flex gap-3 flex-wrap mb-3">
                  {[
                    { mode: "none" as const, label: "不加入合集" },
                    { mode: "select" as const, label: "选择已有合集" },
                    { mode: "create" as const, label: "创建新合集" },
                  ].map((opt) => (
                    <label key={opt.mode} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      collectionMode === opt.mode ? "border-accent bg-accent-light text-accent" : "border-rule text-muted hover:border-accent"
                    }`}>
                      <input type="radio" name="collectionMode" className="sr-only"
                        checked={collectionMode === opt.mode} onChange={() => setCollectionMode(opt.mode)} />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {collectionMode === "select" && (
                  <div className="pt-3 border-t border-rule">
                    <select className="input-field" value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}>
                      <option value="">-- 请选择合集 --</option>
                      {existingCollections.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}（{c.count} 篇）</option>
                      ))}
                    </select>
                  </div>
                )}
                {collectionMode === "create" && (
                  <div className="pt-3 border-t border-rule space-y-3">
                    <input className="input-field" placeholder="合集名称（≤15字）" value={collectionName} onChange={(e) => setCollectionName(e.target.value)} />
                    <input className="input-field" placeholder="合集简介（≤80字）" value={collectionDesc} onChange={(e) => setCollectionDesc(e.target.value)} />
                    <TagInput
                      tags={collectionTags} setTags={setCollectionTags}
                      inputVal={collectionTagInput} setInputVal={setCollectionTagInput}
                      recommended={recommendedTags} wrapperClass="tag-collection-input"
                    />
                  </div>
                )}
              </div>
            )}

            {renderError()}
            <div className="flex items-center justify-between pt-4 border-t border-rule">
              <div className="text-xs text-muted">发布即同意 <a href="#" className="text-accent">社区公约</a> 和 <a href="#" className="text-accent">创作规范</a></div>
              <button className="submit-btn" onClick={submitText} disabled={submitting}>
                <i className="fa-solid fa-paper-plane mr-1" />{submitting ? "发布中..." : (editPostId ? "保存" : "发布")}
              </button>
            </div>
          </div>
        </main>
        <div className="h-16" />
      </div>
    );
  }

  // ---- 发布图片 ----
  if (view === "image") {
    return (
      <div className="min-h-screen bg-paper">
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
        <PublishHeader title={editPostId ? "编辑图片" : "发布图片"} onSubmit={submitImage} submitting={submitting} />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-5">
            {renderRejectionBanner()}
            <input
              type="text" placeholder="为图片添加标题（选填）" className="input-field text-lg"
              style={{ padding: "14px 16px" }} value={title} onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="input-field resize-none"
              rows={3}
              placeholder="写一些关于图片的看法或说明（选填）"
              value={imageDesc}
              onChange={(e) => setImageDesc(e.target.value)}
            />
            <div
              className="border-2 border-dashed border-rule rounded-xl p-8 text-center cursor-pointer hover:border-accent transition-colors bg-white"
              onClick={triggerImageUpload}
            >
              <i className="fa-solid fa-cloud-arrow-up text-4xl text-muted mb-3 block" />
              <p className="text-sm text-muted mb-1">点击上传图片</p>
              <p className="text-xs text-muted">支持 JPG、PNG、GIF、WEBP，可多选</p>
              {uploadingImage && <p className="text-xs text-accent mt-2"><i className="fa-solid fa-spinner animate-spin mr-1" />上传中...</p>}
            </div>
            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {uploadedImages.map((img, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-rule bg-white">
                    <img src={img.url} alt={img.name} className="w-full aspect-square object-cover" />
                    <button
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setUploadedImages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <TagInput
              tags={tags} setTags={setTags} inputVal={tagInput} setInputVal={setTagInput}
              recommended={recommendedTags} wrapperClass="tag-image-input"
            />
            {renderError()}
            <div className="flex items-center justify-between pt-4 border-t border-rule">
              <div className="text-xs text-muted">发布即同意 <a href="#" className="text-accent">社区公约</a></div>
              <button className="submit-btn" onClick={submitImage} disabled={submitting || uploadingImage}>
                <i className="fa-solid fa-paper-plane mr-1" />{submitting ? "发布中..." : (editPostId ? "保存" : "发布")}
              </button>
            </div>
          </div>
        </main>
        <div className="h-16" />
      </div>
    );
  }

  // ---- 长篇连载 - 创建/编辑 ----
  if (view === "series-create") {
    return (
      <div className="min-h-screen bg-paper">
        <header className="sticky top-0 z-50 bg-white border-b border-rule">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <button className="btn-ghost" onClick={() => { router.push("/studio"); setEditingSeries(false); setEditingSeriesId(null); }}>
              <i className="fa-solid fa-arrow-left mr-1" />返回
            </button>
            <span className="text-sm font-medium text-warm">{editingSeries ? "编辑连载" : "创建连载"}</span>
            <button className="submit-btn" onClick={createSeries} disabled={submitting}>
              {submitting ? "保存中..." : "确认"}
            </button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-5">
            <div>
              <label className="text-sm text-muted block mb-1">连载封面（选填）</label>
              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={handleCoverUpload}
              />
              {newSeriesCover ? (
                <div className="relative w-40">
                  <img
                    src={newSeriesCover}
                    alt="封面预览"
                    className="w-full aspect-[3/4] object-cover rounded-lg border border-rule"
                  />
                  <button
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
                    onClick={() => setNewSeriesCover(null)}
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              ) : (
                <div
                  className="w-40 aspect-[3/4] border-2 border-dashed border-rule rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-accent transition-colors bg-white"
                  onClick={triggerCoverUpload}
                >
                  {uploadingCover ? (
                    <i className="fa-solid fa-spinner animate-spin text-2xl text-muted" />
                  ) : (
                    <>
                      <i className="fa-solid fa-cloud-arrow-up text-2xl text-muted mb-1" />
                      <span className="text-xs text-muted">上传封面</span>
                    </>
                  )}
                </div>
              )}
              <p className="text-xs text-muted mt-1.5">建议尺寸 600x800 像素，jpg/png/jpeg，不超过5MB</p>
            </div>
            <input className="input-field" placeholder="连载名称（必填，≤15字）" value={newSeriesName} onChange={(e) => setNewSeriesName(e.target.value)} />
            <textarea className="input-field resize-none" rows={3} placeholder="连载简介（选填，≤80字）" value={newSeriesDesc} onChange={(e) => setNewSeriesDesc(e.target.value)} />
            <TagInput
              tags={newSeriesTags} setTags={setNewSeriesTags} inputVal={newSeriesTagInput} setInputVal={setNewSeriesTagInput}
              recommended={recommendedTags} wrapperClass="tag-series-input"
            />
            <div className="flex gap-6">
              <div>
                <label className="text-sm text-muted block mb-2">作品状态</label>
                <div className="flex gap-3">
                  {[
                    { value: "ongoing" as const, label: "连载中" },
                    { value: "completed" as const, label: "已完结" },
                  ].map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      newSeriesStatus === opt.value ? "border-accent bg-accent-light text-accent" : "border-rule text-muted hover:border-accent"
                    }`}>
                      <input type="radio" name="seriesStatus" className="sr-only"
                        checked={newSeriesStatus === opt.value} onChange={() => setNewSeriesStatus(opt.value)} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-muted block mb-2">作品类型</label>
                <div className="flex gap-3">
                  {[
                    { value: "fanfic" as const, label: "同人" },
                    { value: "original" as const, label: "原创" },
                  ].map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      newSeriesType === opt.value ? "border-accent bg-accent-light text-accent" : "border-rule text-muted hover:border-accent"
                    }`}>
                      <input type="radio" name="seriesType" className="sr-only"
                        checked={newSeriesType === opt.value} onChange={() => setNewSeriesType(opt.value)} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {renderError()}
          </div>
        </main>
      </div>
    );
  }

  // ---- 长篇连载 - 章节管理 ----
  if (view === "series-detail" && currentSeries) {
    return (
      <div className="min-h-screen bg-paper">
        <header className="sticky top-0 z-50 bg-white border-b border-rule">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <button className="btn-ghost" onClick={() => router.push(`/studio/series/${encodeURIComponent(currentSeries.name)}`)}>
              <i className="fa-solid fa-arrow-left mr-1" />返回
            </button>
            <span className="text-sm font-medium text-warm">章节管理</span>
            <button className="submit-btn" onClick={() => { setTitle(""); editor.setContent(""); setTags([]); setUploadedImages([]); setSeriesNameFromUrl(null); setView("chapter-create"); }}>
              <i className="fa-solid fa-plus mr-1" />新增章节
            </button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="mb-6 p-4 rounded-xl bg-white border border-rule">
            <h3 className="font-bold text-lg text-warm">{currentSeries.name}</h3>
            <p className="text-sm text-muted mt-1">
              {currentSeries.series_type === "fanfic" ? "同人" : "原创"} · {currentSeries.status === "ongoing" ? "连载中" : "已完结"} · {chapterList.length} 章
            </p>
          </div>
          {chapterList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted mb-4">暂无章节</p>
              <button className="submit-btn" onClick={() => { setTitle(""); editor.setContent(""); setTags([]); setUploadedImages([]); setSeriesNameFromUrl(null); setView("chapter-create"); }}>
                <i className="fa-solid fa-plus mr-1" />新增第一章
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {chapterList.map((ch) => (
                <div key={ch.id} className="flex items-center gap-4 p-3 rounded-lg bg-white border border-rule">
                  <span className="text-sm text-muted font-mono w-10 text-center">第{ch.chapter_number}章</span>
                  <Link href={`/read/${ch.id}`} className="flex-1 text-sm text-warm no-underline hover:text-accent truncate font-medium">
                    {ch.title}
                  </Link>
                  <span className="text-xs text-muted">{ch.word_count?.toLocaleString() || 0}字</span>
                  <span className="text-xs text-muted">{ch.created_at ? new Date(ch.created_at).toLocaleDateString("zh-CN") : ""}</span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ---- 长篇连载 - 新增章节 ----
  if (view === "chapter-create") {
    const targetSeriesName = seriesNameFromUrl || currentSeries?.name;
    const displayChapterNum = seriesNameFromUrl ? chapterNumberFromUrl : chapterList.length + 1;

    return (
      <div className="min-h-screen bg-paper">
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
        <PublishHeader
          title={seriesNameFromUrl ? `新建章节 - ${seriesNameFromUrl}` : "新增章节"}
          onSubmit={submitChapter}
          submitting={submitting}
        />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-5">
            {targetSeriesName && (
              <div className="text-sm text-muted">
                <i className="fa-solid fa-book-open mr-1 text-accent" />
                {targetSeriesName} · 第 {displayChapterNum} 章
              </div>
            )}
            <input
              type="text" placeholder="章节标题（必填）" className="input-field text-lg font-medium"
              style={{ padding: "14px 16px" }} value={title} onChange={(e) => setTitle(e.target.value)}
            />
            {renderEditor("请输入章节内容...")}
            <TagInput
              tags={tags} setTags={setTags} inputVal={tagInput} setInputVal={setTagInput}
              recommended={recommendedTags} wrapperClass="tag-chapter-input"
            />
            {renderError()}
            <div className="flex items-center justify-between pt-4 border-t border-rule">
              <div className="text-xs text-muted">发布即同意 <a href="#" className="text-accent">社区公约</a></div>
              <button className="submit-btn" onClick={submitChapter} disabled={submitting}>
                <i className="fa-solid fa-paper-plane mr-1" />{submitting ? "发布中..." : "发布"}
              </button>
            </div>
          </div>
        </main>
        <div className="h-16" />
      </div>
    );
  }

  return null;
}