"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { compressImage } from "@/lib/image";
import { renderSafeMarkdown } from "@/lib/markdown";
import { useMarkdownEditor } from "@/lib/useMarkdownEditor";
import { screenImageLocally, type LocalImageScreening } from "@/lib/localImageScreening";
import { assertCanPublish } from "@/lib/userRestrictions";
import { addTags, MAX_TAGS_PER_WORK } from "@/lib/tagRules";

function notifyStatsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("inkland:stats-changed"));
}

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function submissionErrorMessage(error: { message?: string }, fallback: string) {
  const message = error?.message || "";
  if (message.includes("ERR_SAME_AS_REJECTED")) {
    return "作品内容与上次打回时相同，请修改后再提交审核";
  }
  if (message.includes("normalize_content_for_compare") || message.includes("posts_guard_unchanged_resubmission")) {
    return "审核拦截功能未完整部署，请先在 Supabase SQL Editor 执行 user-enforcement-v1.sql 后重试";
  }
  return fallback;
}

// ============ 类型定义 ============

type ViewType = "select" | "text" | "image" | "series-create" | "series-detail" | "chapter-create";
const MAX_UPLOAD_IMAGES = 9;

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

interface UploadedImage {
  name: string;
  url: string;
  storedUrl: string;
  bucket?: string;
  path?: string;
  file?: File;
  localScreening?: Promise<LocalImageScreening>;
}

interface ReviewIssue {
  id?: string;
  category?: string | null;
  field_name?: string | null;
  location_type?: string | null;
  paragraph_index?: number | null;
  start_offset?: number | null;
  end_offset?: number | null;
  image_index?: number | null;
  quoted_text?: string | null;
  details?: string | null;
}

function privateImageMarker(path: string) {
  return `private://private-post-images/${path}`;
}

function VisibilityOptions({
  value,
  onChange,
  disabled,
}: {
  value: "public" | "followers_only" | "private";
  onChange: (value: "public" | "followers_only" | "private") => void;
  disabled?: boolean;
}) {
  return (
    <div className="form-section">
      <span className="form-label">可见范围</span>
      <div className="collection-options" role="radiogroup" aria-label="可见范围">
          <button type="button" className={`collection-option ${value === "public" ? "selected" : ""}`} onClick={() => onChange("public")} disabled={disabled} role="radio" aria-checked={value === "public"}>
          <span className="collection-option-copy"><span className="collection-option-text">公开</span><span className="collection-option-desc">所有人可见</span></span>
        </button>
        <button type="button" className={`collection-option ${value === "followers_only" ? "selected" : ""}`} onClick={() => onChange("followers_only")} disabled={disabled} role="radio" aria-checked={value === "followers_only"}>
          <span className="collection-option-copy"><span className="collection-option-text">仅关注用户可见</span><span className="collection-option-desc">只有关注作者的人可见</span></span>
        </button>
        <button type="button" className={`collection-option ${value === "private" ? "selected" : ""}`} onClick={() => onChange("private")} disabled={disabled} role="radio" aria-checked={value === "private"}>
          <span className="collection-option-copy"><span className="collection-option-text">仅自己可见</span><span className="collection-option-desc">保存为草稿，仅作者本人可见</span></span>
        </button>
      </div>
    </div>
  );
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
    <div className="editor-toolbar">
      <button className="toolbar-btn" onClick={onBold} title="加粗" type="button">
        <i className="fa-solid fa-bold" />
      </button>
      <button className="toolbar-btn" onClick={onItalic} title="斜体" type="button">
        <i className="fa-solid fa-italic" />
      </button>
      <button className="toolbar-btn" onClick={onUnderline} title="下划线" type="button">
        <i className="fa-solid fa-underline" />
      </button>
      <button className="toolbar-btn" onClick={onStrikethrough} title="删除线" type="button">
        <i className="fa-solid fa-strikethrough" />
      </button>

      <div className="toolbar-divider" />

      <button
        className={`toolbar-btn ${uploadingImage ? "opacity-50" : ""}`}
        onClick={onImage}
        title="上传图片"
        disabled={uploadingImage}
        type="button"
      >
        <i className={`fa-solid ${uploadingImage ? "fa-spinner animate-spin" : "fa-image"}`} />
      </button>
      <button className="toolbar-btn" onClick={onHr} title="分割线" type="button">
        <i className="fa-solid fa-minus" />
      </button>

      <div className="editor-preview-toggle">
        <button
          className={`preview-toggle-btn ${!previewMode ? "active" : ""}`}
          onClick={() => { if (previewMode) onTogglePreview(); }}
          type="button"
        >
          编辑
        </button>
        <button
          className={`preview-toggle-btn ${previewMode ? "active" : ""}`}
          onClick={() => { if (!previewMode) onTogglePreview(); }}
          type="button"
        >
          预览
        </button>
      </div>
    </div>
  );
}

function ArticleToolbar({ onCommand, onFormat, onImport, onPreview, editorTools = false, expanded = false, onToggleExpanded, fontSize = 16, onFontSizeChange }: { onCommand: (command: string, value?: string) => void; onFormat: () => void; onImport: () => void; onPreview: () => void; editorTools?: boolean; expanded?: boolean; onToggleExpanded?: () => void; fontSize?: number; onFontSizeChange?: (value: number) => void }) {
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const fontSizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fontSizeOpen) return;
    const close = (event: PointerEvent) => {
      if (!fontSizeRef.current?.contains(event.target as Node)) setFontSizeOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [fontSizeOpen]);

  const button = (icon: string, label: string, onClick: () => void) => (
    <button type="button" className="tb-btn" aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
    </button>
  );

  return (
    <div className={`editor-toolbar ${editorTools ? "unified-editor-toolbar" : ""}`} role="toolbar" aria-label="格式化工具栏">
      {button("fa-rotate-left", "撤销", () => onCommand("undo"))}
      {button("fa-rotate-right", "重做", () => onCommand("redo"))}
      {button("fa-bold", "加粗", () => onCommand("bold"))}
      {button("fa-italic", "斜体", () => onCommand("italic"))}
      {button("fa-underline", "下划线", () => onCommand("underline"))}
      {button("fa-strikethrough", "删除线", () => onCommand("strikeThrough"))}
      {button("fa-align-left", "左对齐", () => onCommand("justifyLeft"))}
      {button("fa-align-center", "居中", () => onCommand("justifyCenter"))}
      {button("fa-align-right", "右对齐", () => onCommand("justifyRight"))}
      {button("fa-minus", "分割线", () => onCommand("insertHorizontalRule"))}
      {button("fa-wand-magic-sparkles", "一键排版", onFormat)}
      {button("fa-file-import", "导入文档", onImport)}
      {button("fa-eye", "预览", onPreview)}
      {editorTools && <div className="editor-font-size-control" ref={fontSizeRef}>
        <button type="button" className={`tb-btn ${fontSizeOpen ? "active" : ""}`} aria-label="调节字号" title="调节字号" aria-expanded={fontSizeOpen} onClick={() => setFontSizeOpen((open) => !open)}><i className="fa-solid fa-font" /></button>
        {fontSizeOpen && <div className="editor-font-size-popover" role="dialog" aria-label="调节正文字号"><span className="font-size-letter font-size-small" aria-hidden="true">A</span><span className="editor-font-size-track"><span className="editor-font-size-ticks" aria-hidden="true"><i /><i /><i /><i /></span><input type="range" min="12" max="26" step="1" value={fontSize} aria-label="正文字号" onChange={(event) => onFontSizeChange?.(Number(event.target.value))} /></span><span className="font-size-letter font-size-large" aria-hidden="true">A</span></div>}
      </div>}
      {editorTools && <button type="button" className={`tb-btn ${expanded ? "active" : ""}`} aria-label={expanded ? "退出专注模式" : "放大编辑器"} title={expanded ? "退出专注模式" : "放大编辑器"} onClick={onToggleExpanded}><i className={`fa-solid ${expanded ? "fa-compress" : "fa-expand"}`} /></button>}
    </div>
  );
}

function htmlToMarkdown(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");

  const render = (node: Node, inPre = false): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const content = Array.from(element.childNodes).map((child) => render(child, inPre || tag === "pre")).join("");

    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return `**${content}**`;
    if (tag === "em" || tag === "i") return `*${content}*`;
    if (tag === "u") return `<u>${content}</u>`;
    if (tag === "s" || tag === "del") return `~~${content}~~`;
    if (tag === "code" && !inPre) return `\`${content}\``;
    if (tag === "a") return `[${content}](${element.getAttribute("href") || ""})`;
    if (tag === "hr") return "\n---\n";
    if (tag === "blockquote") return content.split("\n").map((line) => line ? `> ${line}` : "> ").join("\n") + "\n";
    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      return Array.from(element.children).map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${render(item).trim()}`).join("\n") + "\n";
    }
    if (tag === "li") return content;
    if (tag === "pre") return `\n\`\`\`\n${element.textContent || ""}\n\`\`\`\n`;
    if (["p", "div"].includes(tag)) return `${content}\n\n`;
    if (["h1", "h2", "h3"].includes(tag)) return `${content}\n`;
    return content;
  };

  return render(doc.body).replace(/\n{3,}/g, "\n\n").trim();
}

function ArticleEditorSurface({
  value,
  onChange,
  previewTitle,
  onPreview,
  editorTools = false,
}: {
  value: string;
  onChange: (value: string) => void;
  previewTitle?: string;
  onPreview?: () => void;
  editorTools?: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importError, setImportError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(16);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const currentMarkdown = htmlToMarkdown(surface.innerHTML);
    if (currentMarkdown.trim() !== value.trim()) {
      surface.innerHTML = renderSafeMarkdown(value || "");
    }
  }, [value]);

  useEffect(() => {
    if (!previewOpen) return;
    const closePreview = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", closePreview);
    return () => document.removeEventListener("keydown", closePreview);
  }, [previewOpen]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const exitExpanded = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", exitExpanded);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", exitExpanded); };
  }, [expanded]);

  const exec = (command: string, commandValue?: string) => {
    if (command === "createLink" && !commandValue) return;
    surfaceRef.current?.focus();
    document.execCommand(command, false, commandValue);
    if (surfaceRef.current) onChange(htmlToMarkdown(surfaceRef.current.innerHTML));
  };

  return (
    <div className={`editor-wrap ${expanded ? "editor-wrap-expanded" : ""}`}>
      <input ref={importRef} type="file" accept=".txt,.text,.md,.markdown,.log,.csv,text/plain,text/markdown,text/csv" hidden onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const extension = file.name.toLowerCase().split(".").pop() || "";
        const allowedExtensions = new Set(["txt", "text", "md", "markdown", "log", "csv"]);
        if (!allowedExtensions.has(extension)) {
          setImportError("仅支持 TXT、Markdown、LOG 和 CSV 文本文件");
          event.target.value = "";
          return;
        }
        const text = await file.text();
        setImportError("");
        onChange(text);
        event.target.value = "";
      }} />
      <ArticleToolbar editorTools={editorTools} expanded={expanded} onToggleExpanded={() => setExpanded((current) => !current)} fontSize={editorFontSize} onFontSizeChange={setEditorFontSize} onCommand={exec} onImport={() => importRef.current?.click()} onPreview={() => { if (onPreview) onPreview(); else setPreviewOpen(true); }} onFormat={() => {
        const plain = surfaceRef.current?.innerText || value.replace(/[#*_~>`\[\]()]/g, "");
        const paragraphs = plain.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        const html = paragraphs.map((line) => `<p>${line.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char] || char))}</p>`).join("");
        if (surfaceRef.current) surfaceRef.current.innerHTML = html;
        onChange(paragraphs.join("\n\n"));
      }} />
      <div className="editor-body">
        <div
          ref={surfaceRef}
          className="editor-content"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          style={editorTools ? { fontSize: `${editorFontSize}px` } : undefined}
          onInput={(event) => onChange(htmlToMarkdown(event.currentTarget.innerHTML))}
          onPaste={(event) => {
            event.preventDefault();
            const plainText = event.clipboardData.getData("text/plain");
            if (!plainText) return;
            document.execCommand("insertText", false, plainText);
            if (surfaceRef.current) onChange(htmlToMarkdown(surfaceRef.current.innerHTML));
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              exec("insertText", "  ");
            }
          }}
        />
      </div>
      {importError && <div className="editor-import-error" role="alert"><i className="fa-solid fa-circle-exclamation" />{importError}</div>}
      {previewOpen && <div className={`modal-overlay active ${previewTitle ? "chapter-preview-overlay" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }}><div className={`modal editor-preview-modal ${previewTitle ? "chapter-preview-modal" : ""}`} role="dialog" aria-modal="true"><button type="button" className="modal-close chapter-preview-close" onClick={() => setPreviewOpen(false)} aria-label="关闭"><i className="fa-solid fa-xmark" /></button>{previewTitle ? <><h1 className="chapter-preview-title">{previewTitle}</h1><div className="editor-preview chapter-preview-body active" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(value) }} /></> : <><div className="modal-title-row"><h2 className="modal-title">内容预览</h2></div><div className="editor-preview active" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(value) }} /></>}</div></div>}
      <div className="editor-footer">
        <span><i className="fa-solid fa-check" /> 草稿已保存</span>
        <span className="char-count">{value.replace(/\s/g, "").length} 字</span>
      </div>
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
    if (t && !tags.includes(t)) { setTags(addTags(tags, [t])); setInputVal(""); }
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
            onClick={() => { const t = tag.trim(); if (t && !tags.includes(t)) setTags(addTags(tags, [t])); }}
          >
            {tag}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted mt-1">{tags.length}/{MAX_TAGS_PER_WORK} 个标签</p>
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
    <header className="sticky top-0 z-50 bg-card border-b border-rule">
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

export function CreateWorkspace({ initialView = "select" }: { initialView?: ViewType }) {
  const supabase = createClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editor = useMarkdownEditor();

  // ---- 视图 ----
  const [view, setView] = useState<ViewType>(initialView);
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
        let { data, error: loadError } = await supabase
          .from("posts")
          .select("id, title, content, author_note, post_type, cover_url, series_name, chapter_number, review_status, review_reason, status, published_at, visibility, pending_review_status, pending_review_reason, pending_version_id, published_version_number")
          .eq("id", editPost)
          .single();
        if (loadError?.message.includes("author_note")) {
          const fallback = await supabase
            .from("posts")
            .select("id, title, content, post_type, cover_url, series_name, chapter_number, review_status, review_reason, status, published_at, visibility, pending_review_status, pending_review_reason, pending_version_id, published_version_number")
            .eq("id", editPost)
            .single();
          data = fallback.data ? { ...fallback.data, author_note: null } : null;
          loadError = fallback.error;
        }
        if (loadError || !data) {
          setErrorMsg(`加载作品失败：${loadError?.message || "未找到该作品"}`);
          return;
        }
        if (data) {
          let p = data as unknown as Record<string, unknown>;
          // 有冻结版本时（提交待审或被管理员打回），加载冻结版本进入编辑器：
          // 已发布作品的 posts 行始终保留旧公开版本，作者应基于自己提交的新版本修改。
          const pendingVersionId = (p.pending_version_id as string) || null;
          if (pendingVersionId) {
            const { data: versionData } = await supabase
              .from("post_versions")
              .select("title, content, author_note, series_name, chapter_number, chapter_title, word_count, published_at, post_type, visibility")
              .eq("id", pendingVersionId)
              .maybeSingle();
            if (versionData) {
              p = { ...p, ...(versionData as unknown as Record<string, unknown>) };
            }
          }
          // 最近一次打回通知里附带的问题清单（含 OCR 图片内文字定位）。
          const { data: rejectionNotice } = await supabase
            .from("notifications")
            .select("metadata")
            .eq("template_key", "post_review_rejected")
            .eq("related_entity_id", editPost)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const noticeMeta = rejectionNotice?.metadata as { issues?: ReviewIssue[] } | null;
          if (noticeMeta?.issues?.length) setReviewIssues(noticeMeta.issues);

          const savedPublishedAt = (p.published_at as string) || null;
          setTitle(p.title as string || "");
          setVisibility(p.visibility === "followers_only" || p.visibility === "private" ? p.visibility : "public");
          setEditingPublishedAt(savedPublishedAt);
          if (p.status === "draft" && savedPublishedAt && new Date(savedPublishedAt).getTime() > Date.now()) {
            const localSchedule = toLocalDateTimeValue(savedPublishedAt);
            setScheduleValue(localSchedule);
            setScheduleTime(localSchedule.slice(11, 16));
            setScheduleMonth(localSchedule.slice(0, 7));
          }
          editor.setContent(p.content as string || "");
          setAuthorNote((p.author_note as string) || "");
          setEditingPostSeriesName((p.series_name as string) || null);
          if (p.post_type === "serial") {
            const editingSeriesName = (p.series_name as string) || null;
            let editingChapterNumber = (p.chapter_number as number) || null;
            if (!editingChapterNumber && editingSeriesName) {
              const { data: previousChapters } = await supabase
                .from("posts")
                .select("chapter_number")
                .eq("series_name", editingSeriesName)
                .eq("post_type", "serial")
                .not("chapter_number", "is", null)
                .gt("chapter_number", 0)
                .order("chapter_number", { ascending: false })
                .limit(1);
              const latestNumber = previousChapters?.[0]?.chapter_number as number | undefined;
              editingChapterNumber = (latestNumber || 0) + 1;
            }
            setSeriesNameFromUrl(editingSeriesName);
            setChapterNumberFromUrl(editingChapterNumber || 1);
          }
          const pendingReviewStatus = (p.pending_review_status as string) || null;
          setPendingReviewStatus(pendingReviewStatus);
          setPublishedVersionNumber((p.published_version_number as number) ?? null);
          if (pendingReviewStatus === "rejected") {
            setReviewRejectionReason((p.pending_review_reason as string) || (p.review_reason as string) || "未提供原因");
          } else if (p.review_status === "rejected") {
            setReviewRejectionReason((p.review_reason as string) || "未提供原因");
          }
          if (p.post_type === "illustration") {
            setView("image");
            // 提取已有图片
            const content = p.content as string;
            const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
            const existingImages: UploadedImage[] = [];
            let match;
            while ((match = imgRegex.exec(content)) !== null) {
              const storedUrl = match[2];
              let previewUrl = storedUrl;
              const privateMatch = storedUrl.match(/^private:\/\/private-post-images\/(.+)$/);
              if (privateMatch) {
                const { data: signedData } = await supabase.storage.from("private-post-images").createSignedUrl(privateMatch[1], 3600);
                previewUrl = signedData?.signedUrl || storedUrl;
              }
              existingImages.push({ name: match[1], url: previewUrl, storedUrl });
            }
            setUploadedImages(existingImages);
            // 提取图片描述
            let textOnly = content.replace(/!\[.*?\]\(.*?\)/g, "").trim();
            const titleText = (p.title as string || "").trim();
            if (titleText && textOnly.startsWith(titleText)) {
              textOnly = textOnly.substring(titleText.length).trim();
            }
            setImageDesc(textOnly);
          } else if (p.post_type === "serial") {
            setView("chapter-create");
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
      loadPost().finally(() => setInitDone(true));
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
  const [successMsg, setSuccessMsg] = useState("");
  const [successAction, setSuccessAction] = useState<"publish" | "collection" | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"public" | "followers_only" | "private">("public");

  useEffect(() => {
    if (!successMsg || successAction !== "publish") return;
    const redirectTimer = window.setTimeout(() => {
      router.push(editPostId ? "/studio" : "/");
      router.refresh();
    }, 1400);
    return () => window.clearTimeout(redirectTimer);
  }, [successMsg, successAction, editPostId, router]);

  // ---- 图片 ----
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
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
  const [collectionSelectOpen, setCollectionSelectOpen] = useState(false);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [publishModal, setPublishModal] = useState<"schedule" | "draft" | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [scheduleTime, setScheduleTime] = useState("20:00");

  // ---- 长篇连载 ----
  const [currentSeries, setCurrentSeries] = useState<SeriesInfo | null>(null);
  const [chapterList, setChapterList] = useState<ChapterInfo[]>([]);
  const [newSeriesName, setNewSeriesName] = useState("");
  const [newSeriesDesc, setNewSeriesDesc] = useState("");
  const [newSeriesTags, setNewSeriesTags] = useState<string[]>([]);
  const [newSeriesTagInput, setNewSeriesTagInput] = useState("");
  const [newSeriesType, setNewSeriesType] = useState<"fanfic" | "original">("original");
  const [newSeriesAudience, setNewSeriesAudience] = useState<"male" | "female" | null>(null);
  const [newSeriesGenre, setNewSeriesGenre] = useState("");
  const [editingSeries, setEditingSeries] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);

  // ---- 编辑模式 ----
  const [editingPublishedAt, setEditingPublishedAt] = useState<string | null>(null);
  const [reviewRejectionReason, setReviewRejectionReason] = useState<string | null>(null);
  const [pendingReviewStatus, setPendingReviewStatus] = useState<string | null>(null);
  const [publishedVersionNumber, setPublishedVersionNumber] = useState<number | null>(null);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [editingPostSeriesName, setEditingPostSeriesName] = useState<string | null>(null);
  const [seriesNameFromUrl, setSeriesNameFromUrl] = useState<string | null>(null);
  const [chapterNumberFromUrl, setChapterNumberFromUrl] = useState<number>(1);
  const [authorNote, setAuthorNote] = useState("");
  const [chapterTitleMode, setChapterTitleMode] = useState<"numbered" | "free">("numbered");
  const [chapterNumberOverride, setChapterNumberOverride] = useState<number | null>(null);
  const chapterPublishRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!publishMenuOpen || view !== "chapter-create") return;
    const closeChapterPublishMenu = (event: PointerEvent) => {
      if (!chapterPublishRef.current?.contains(event.target as Node)) setPublishMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeChapterPublishMenu);
    return () => document.removeEventListener("pointerdown", closeChapterPublishMenu);
  }, [publishMenuOpen, view]);

  const wordCount = editor.content.replace(/\s/g, "").length;
  const [recommendedTags, setRecommendedTags] = useState<string[]>([]);

  const calendarMonthDate = new Date(`${scheduleMonth}-01T00:00:00`);
  const calendarYear = calendarMonthDate.getFullYear();
  const calendarMonthIndex = calendarMonthDate.getMonth();
  const now = new Date();
  const todayLocalValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentCalendarMonth = todayLocalValue.slice(0, 7);
  const calendarDays = Array.from(
    { length: new Date(calendarYear, calendarMonthIndex + 1, 0).getDate() + new Date(calendarYear, calendarMonthIndex, 1).getDay() },
    (_, index) => index < new Date(calendarYear, calendarMonthIndex, 1).getDay() ? null : index - new Date(calendarYear, calendarMonthIndex, 1).getDay() + 1,
  );
  const scheduleSelectedDate = scheduleValue ? scheduleValue.slice(0, 10) : "";
  const scheduleHour = scheduleTime.split(":")[0] || "20";
  const scheduleMinute = scheduleTime.split(":")[1] || "00";
  const scheduleDisplayValue = scheduleValue
    ? new Date(scheduleValue).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
    : "选择公开日期";

  // 加载近期使用标签
  useEffect(() => {
    const loadRecentTags = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: recentTags } = await supabase
        .from("user_tag_usage")
        .select("last_used_at, tags(name)")
        .eq("user_id", user.id)
        .order("last_used_at", { ascending: false })
        .limit(10);
      if (!recentTags) return;
      const names = (recentTags as Array<Record<string, unknown>>)
        .map((row) => {
          const tag = row.tags as { name?: string } | { name?: string }[] | null;
          return Array.isArray(tag) ? tag[0]?.name : tag?.name;
        })
        .filter((name): name is string => Boolean(name));
      setRecommendedTags([...new Set(names)].slice(0, 10));
    };
    loadRecentTags();
  }, []);

  // ============ 图片上传 ============

  const uploadImageToStorage = useCallback(async (file: File): Promise<UploadedImage | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录后再上传图片"); return null; }

    let compressedFile: File;
    try {
      const result = await compressImage(file);
      compressedFile = result.file;
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "图片处理失败，请换一张图片重试");
      return null;
    }

    const fileExt = "webp";
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt}`;
    // 所有待审核图片先进入私有桶。审核通过后由服务端迁移到公开桶，
    // 避免“数据库暂时不可见，但拿到图片 URL 仍可访问”的绕过方式。
    const bucketName = "private-post-images";

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, compressedFile, { upsert: true, contentType: "image/webp" });

    if (error) {
      if (error.message?.includes("Bucket") || error.message?.includes("not found")) {
        setErrorMsg(`图片上传失败：存储桶 '${bucketName}' 未创建或策略未配置。`);
      } else {
        setErrorMsg(`图片上传失败: ${error.message}`);
      }
      return null;
    }
    const { data: signedData, error: signedError } = await supabase.storage.from(bucketName).createSignedUrl(fileName, 3600);
    if (signedError || !signedData?.signedUrl) {
      setErrorMsg("图片已上传，但临时预览链接生成失败，请检查私有 bucket 的 SELECT 策略。");
      return null;
    }
    return { name: file.name, url: signedData.signedUrl, storedUrl: privateImageMarker(fileName), bucket: bucketName, path: fileName, file: compressedFile };
  }, [supabase, visibility]);

  const handleVisibilityChange = useCallback(async (next: "public" | "followers_only" | "private") => {
    if (next === visibility || uploadedImages.length === 0) { setVisibility(next); return; }
    const previousVisibility = visibility;
    // 先立即反馈选择结果，图片存储位置在后台同步。
    setVisibility(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setVisibility(previousVisibility); setErrorMsg("请先登录"); return; }

    setUploadingImage(true);
    setErrorMsg("");
    // 审核完成前无论目标可见范围是什么，都只使用私有桶。
    const targetBucket = "private-post-images";
    const migrated: UploadedImage[] = [];
    try {
      for (const image of uploadedImages) {
        let sourceFile = image.file;
        if (!sourceFile) {
          const response = await fetch(image.url);
          if (!response.ok) throw new Error(`无法读取图片：${image.name}`);
          sourceFile = new File([await response.blob()], image.name, { type: "image/webp" });
        }
        const targetPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`;
        const { error: uploadError } = await supabase.storage.from(targetBucket).upload(targetPath, sourceFile, { upsert: true, contentType: "image/webp" });
        if (uploadError) throw uploadError;

        const { data, error } = await supabase.storage.from(targetBucket).createSignedUrl(targetPath, 3600);
        if (error || !data?.signedUrl) throw error || new Error("无法生成图片预览链接");
        const url = data.signedUrl;
        const storedUrl = privateImageMarker(targetPath);
        migrated.push({ ...image, url, storedUrl, bucket: targetBucket, path: targetPath, file: sourceFile });
      }
      const replacements = new Map<string, string>();
      uploadedImages.forEach((image, index) => replacements.set(image.url, migrated[index].url));
      editor.setContentRaw(replacements ? [...replacements.entries()].reduce((value, [from, to]) => value.split(from).join(to), editor.content) : editor.content);
      setUploadedImages(migrated);
      await Promise.all(uploadedImages
        .filter((image) => image.bucket && image.path)
        .map((image) => supabase.storage.from(image.bucket as string).remove([image.path as string])));
    } catch (error) {
      setVisibility(previousVisibility);
      setErrorMsg(error instanceof Error ? error.message : "图片可见范围切换失败，请重试");
    } finally {
      setUploadingImage(false);
    }
  }, [editor, supabase, uploadedImages, visibility]);

  const processImageFiles = useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_UPLOAD_IMAGES - uploadedImages.length;
    if (remaining <= 0) { setErrorMsg(`单篇作品最多上传 ${MAX_UPLOAD_IMAGES} 张图片`); return; }
    const selectedFiles = Array.from(files).slice(0, remaining);
    setUploadingImage(true);
    setErrorMsg("");
    if (files.length > remaining) setErrorMsg(`单篇作品最多上传 ${MAX_UPLOAD_IMAGES} 张图片，超出的图片未添加`);
    let addedCount = 0;
    for (const file of selectedFiles) {
      if (!file.type.startsWith("image/")) { setErrorMsg(`"${file.name}" 不是图片文件，已跳过`); continue; }
      if (file.size > 20 * 1024 * 1024) { setErrorMsg(`"${file.name}" 原文件超过 20MB，已跳过`); continue; }
      // 本地模型只是可选的预筛，不能阻止上传，也不能代替服务端审核。
      // 不把它放在上传链路中等待，避免用户看到漫长的“审核中”并误以为发布被卡住。
      const localScreening = screenImageLocally(file, uploadedImages.length + addedCount);
      const uploaded = await uploadImageToStorage(file);
      if (uploaded) {
        setUploadedImages((prev) => [...prev, { ...uploaded, localScreening }]);
        editor.insertAtCursor(`![${uploaded.name}](${uploaded.url})\n`);
        addedCount += 1;
      }
    }
    setUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadImageToStorage, editor, uploadedImages.length]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processImageFiles(e.target.files || []);
  }, [processImageFiles]);

  const triggerImageUpload = () => fileInputRef.current?.click();

  // ============ 加载合集列表 ============

  const loadCollections = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // series_name 为双语义字段：合集内的单篇与长篇连载的章节共用，
    // 必须排除 serial 行，否则连载名会混入合集选择列表
    const { data } = await supabase
      .from("posts")
      .select("series_name")
      .eq("user_id", user.id)
      .neq("post_type", "serial")
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
      list.sort((a, b) => b.count - a.count);
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
    if ((view === "text" || view === "image") && collectionMode === "select") loadCollections();
  }, [view, collectionMode, loadCollections]);

  // ============ 保存标签 ============

  const recordRecentTags = async (userId: string, tagNames: string[]) => {
    const uniqueNames = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];
    await Promise.all(uniqueNames.map(async (tagName) => {
      const { data: existing } = await supabase.from("tags").select("id").eq("name", tagName).maybeSingle();
      let tagId = existing?.id as string | undefined;
      if (!tagId) {
        const { data: newTag } = await supabase.from("tags").insert({ name: tagName, type: "fandom", post_count: 0 }).select("id").single();
        tagId = newTag?.id as string | undefined;
      }
      if (!tagId) return;
      await supabase.from("user_tag_usage").upsert(
        { user_id: userId, tag_id: tagId, last_used_at: new Date().toISOString() },
        { onConflict: "user_id,tag_id" },
      );
    }));
  };

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
    const tagIds = await Promise.all(tags.map(async (tagName) => {
      const { data: existing } = await supabase.from("tags").select("id").eq("name", tagName).maybeSingle();
      if (existing?.id) return existing.id as string;
      const { data: newTag } = await supabase.from("tags").insert({ name: tagName, type: "fandom", post_count: 0 }).select("id").single();
      return newTag?.id as string | undefined;
    }));
    await Promise.all([
      Promise.all(tagIds.filter((tagId): tagId is string => Boolean(tagId)).map((tagId) =>
        supabase.from("post_tags").insert({ post_id: pid, tag_id: tagId }),
      )),
      recordRecentTags(userId, tags),
    ]);
  };

  const renderNotice = () => (
    <>
      {errorMsg && (
        <div className="create-notice create-notice-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" /> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="create-success-overlay" role="status">
          <div className="create-success-dialog">
            <span className="create-success-icon"><i className="fa-solid fa-check" /></span>
            <strong>操作成功</strong>
            <p>{successMsg}{successAction === "publish" && <><br />即将返回{editPostId ? "创作中心" : "首页"}</>}</p>
            {successAction !== "publish" && (
              <button type="button" onClick={() => {
                setSuccessMsg("");
                setSuccessAction(null);
              }}>确认</button>
            )}
          </div>
        </div>
      )}
    </>
  );

  const createCollection = async () => {
    const name = collectionName.trim();
    if (!name) { setErrorMsg("请填写合集名称"); setSuccessMsg(""); return; }
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    setSuccessAction(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    const blocked = await assertCanPublish();
    if (blocked) { setErrorMsg(blocked); setSubmitting(false); return; }

    const { error } = await supabase.from("series").insert({
      user_id: user.id,
      name,
      description: collectionDesc.trim() || null,
      tags: [],
      status: "ongoing",
      series_type: "original",
    });
    if (error) {
      setErrorMsg(`创建合集失败：${error.message}`);
      setSubmitting(false);
      return;
    }

    setCollectionMode("select");
    setSelectedCollection(name);
    setCollectionName("");
    setCollectionDesc("");
    setSubmitting(false);
    setSuccessAction("collection");
    setSuccessMsg(`合集“${name}”创建成功，已自动选中`);
  };

  // ============ 发布单篇 ============

  const submitText = async (options?: { scheduledAt?: string }) => {
    if (!title.trim()) { setErrorMsg("请填写作品标题"); setSuccessMsg(""); return; }
    if (!editor.content.trim()) { setErrorMsg("请填写内容"); return; }
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    setSuccessAction(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    if (visibility !== "private") {
      const blocked = await assertCanPublish();
      if (blocked) { setErrorMsg(blocked); setSubmitting(false); return; }
    }

    let finalSeriesName: string | null = null;
    if (collectionMode === "select" && selectedCollection) finalSeriesName = selectedCollection;
    if (collectionMode === "create" && collectionName.trim()) finalSeriesName = collectionName.trim();

    const scheduledAt = visibility !== "private"
      ? (options?.scheduledAt || (scheduleValue ? new Date(scheduleValue).toISOString() : undefined))
      : undefined;
    const postData: Record<string, unknown> = {
      title: title.trim() || "无标题",
      content: uploadedImages.reduce((value, image) => value.split(image.url).join(image.storedUrl), editor.content.trim()),
      word_count: wordCount,
      status: "draft",
      review_status: visibility === "private" ? "approved" : "pending",
      post_type: uploadedImages.length > 0 ? "illustration" : "novel",
      visibility,
      published_at: visibility === "private" ? null : (scheduledAt || editingPublishedAt || new Date().toISOString()),
    };
    if (finalSeriesName) postData.series_name = finalSeriesName;

    let savedPostId = editPostId || undefined;
    let finalReviewStatus: string | undefined;
    if (editPostId) {
      const { data: updatedPost, error } = await supabase.from("posts").update(postData).eq("id", editPostId).select("review_status").single();
      if (error) { setErrorMsg(submissionErrorMessage(error, `更新失败: ${error.message}`)); setSubmitting(false); return; }
      finalReviewStatus = updatedPost?.review_status as string | undefined;
    } else {
      const { data: createdPost, error } = await supabase.from("posts").insert({ ...postData, user_id: user.id }).select("id, review_status").single();
      if (error) { setErrorMsg(submissionErrorMessage(error, `发布失败: ${error.message}`)); setSubmitting(false); return; }
      savedPostId = createdPost?.id;
      finalReviewStatus = createdPost?.review_status as string | undefined;
    }

    await saveTags(user.id, savedPostId);
    notifyStatsChanged();
    if (scheduledAt) {
      setSubmitting(false);
      setSuccessAction("publish");
      setSuccessMsg(`作品已提交审核，通过后将于 ${new Date(scheduledAt).toLocaleString("zh-CN")} 公开`);
      return;
    }
    if (visibility === "private") {
      setSubmitting(false);
      setSuccessAction("publish");
      setSuccessMsg("作品已保存为仅自己可见");
      return;
    }
    setSubmitting(false);
    setSuccessAction("publish");
    setSuccessMsg(finalReviewStatus === "approved" ? "作品已通过系统初筛并公开发布" : "作品已进入人工审核，审核通过后会公开");
  };

  // ============ 保存草稿 ============

  const handleSaveDraft = async () => {
    if (!title.trim()) { setErrorMsg("请填写作品标题"); setSuccessMsg(""); return; }
    if (!editor.content.trim()) { setErrorMsg("请先填写内容再保存草稿"); return; }
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    setSuccessAction(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    let finalSeriesName: string | null = null;
    if (selectedCollection) finalSeriesName = selectedCollection;

    const postData: Record<string, unknown> = {
      title: title.trim() || "无标题",
      content: editor.content.trim(),
      word_count: wordCount,
      status: "draft",
      post_type: "novel",
      visibility,
    };
    if (finalSeriesName) postData.series_name = finalSeriesName;

    const { data: createdPost, error } = await supabase.from("posts").insert({ ...postData, user_id: user.id }).select("id").single();
    if (error) { setErrorMsg(`保存失败: ${error.message}`); setSubmitting(false); return; }

    await saveTags(user.id, createdPost?.id);
    notifyStatsChanged();
    setSubmitting(false);
    setSuccessAction("publish");
    setSuccessMsg("草稿保存成功，当前编辑内容已保留");
  };

  // ============ 发布图片 ============

  const submitImage = async (options?: { scheduledAt?: string; draft?: boolean }) => {
    if (uploadedImages.length === 0) { setErrorMsg("请至少上传一张图片"); return; }
    if (tags.length === 0) { setErrorMsg("请至少添加一个标签"); return; }
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    setSuccessAction(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    if (!options?.draft && visibility !== "private") {
      const blocked = await assertCanPublish();
      if (blocked) { setErrorMsg(blocked); setSubmitting(false); return; }
    }

    const imageMd = uploadedImages.map((img) => `![${img.name}](${img.storedUrl})`).join("\n\n");
    const parts: string[] = [];
    if (title.trim()) parts.push(title.trim());
    if (imageDesc.trim()) parts.push(imageDesc.trim());
    parts.push(imageMd);
    const fullContent = parts.join("\n\n");
    const finalSeriesName = collectionMode === "select" && selectedCollection
      ? selectedCollection
      : collectionMode === "create" && collectionName.trim()
        ? collectionName.trim()
        : null;

    const scheduledAt = visibility !== "private" && !options?.draft
      ? (options?.scheduledAt || (scheduleValue ? new Date(scheduleValue).toISOString() : undefined))
      : undefined;
    const postData: Record<string, unknown> = {
      title: title.trim() || "图片分享",
      content: fullContent,
      word_count: fullContent.replace(/\s/g, "").length,
      status: "draft",
      review_status: options?.draft || visibility === "private" ? "approved" : "pending",
      post_type: "illustration",
      visibility,
      published_at: visibility === "private" || options?.draft ? null : (scheduledAt || editingPublishedAt || new Date().toISOString()),
    };
    if (finalSeriesName) postData.series_name = finalSeriesName;

    let savedPostId = editPostId || undefined;
    let finalReviewStatus: string | undefined;
    if (editPostId) {
      const { data: updatedPost, error } = await supabase.from("posts").update(postData).eq("id", editPostId).select("review_status").single();
      if (error) { setErrorMsg(submissionErrorMessage(error, `更新失败: ${error.message}`)); setSubmitting(false); return; }
      finalReviewStatus = updatedPost?.review_status as string | undefined;
    } else {
      const { data: createdPost, error } = await supabase.from("posts").insert({ ...postData, user_id: user.id }).select("id, review_status").single();
      if (error) { setErrorMsg(submissionErrorMessage(error, `发布失败: ${error.message}`)); setSubmitting(false); return; }
      savedPostId = createdPost?.id;
      finalReviewStatus = createdPost?.review_status as string | undefined;
    }

    if (!options?.draft && visibility !== "private" && savedPostId && finalReviewStatus === "pending") {
      // 发布与自动审核解耦：作品先进入“已发布/审核中”状态，审核服务在后台完成。
      // 前端不再等待 ModelScope/NudeNet，也不把服务异常误报成发布失败。
      const localResults = await Promise.all(uploadedImages.map((image) => image.localScreening?.catch(() => undefined)));
      const clientFindings = localResults.flatMap((result) => result?.findings || []);
      void fetch("/api/moderation/screen-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: savedPostId, clientFindings }),
        keepalive: true,
      }).catch(() => undefined);
    }

    await saveTags(user.id, savedPostId);
    notifyStatsChanged();
    setSubmitting(false);
    if (scheduledAt) {
      setSuccessAction("publish");
      setSuccessMsg(`作品已提交审核，通过后将于 ${new Date(scheduledAt).toLocaleString("zh-CN")} 公开`);
    } else if (options?.draft) {
      setSuccessAction("publish");
      setSuccessMsg("草稿保存成功");
    } else if (visibility === "private") {
      setSuccessAction("publish");
      setSuccessMsg("作品已保存为仅自己可见");
    } else {
      setSuccessAction("publish");
      setSuccessMsg(finalReviewStatus === "approved" ? "作品已发布" : "作品已发布，正在自动审核；审核完成前仅自己可见");
    }
  };

  const handleSaveImageDraft = async () => {
    if (uploadedImages.length === 0) { setErrorMsg("请至少上传一张图片"); return; }
    if (tags.length === 0) { setErrorMsg("请至少添加一个标签"); return; }
    await submitImage({ draft: true });
  };

  const renderImagePublishModal = () => publishModal && (
    <div className="publish-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setPublishModal(null); }}>
      <div className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="image-publish-modal-title">
        <div className="publish-modal-header">
          <div className={`publish-modal-icon publish-modal-icon-${publishModal}`}>
            <i className={`fa-solid ${publishModal === "schedule" ? "fa-clock" : "fa-bookmark"}`} />
          </div>
          <button type="button" className="publish-modal-close" aria-label="关闭弹窗" onClick={() => setPublishModal(null)} disabled={submitting}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="publish-modal-copy">
          <h2 id="image-publish-modal-title">
            {publishModal === "schedule" ? "定时发布" : "保存为草稿"}
          </h2>
          <p>
            {publishModal === "schedule" ? "选择作品公开的日期和时间，完成后点击发布作品提交。" : "当前图片、标题、说明和标签都会保留，之后可以继续编辑。"}
          </p>
        </div>
        {publishModal === "schedule" && (
          <div className="publish-modal-field">
            <span className="publish-schedule-label">公开日期和时间</span>
            <span className="publish-schedule-fields">
              <span className="publish-datetime-picker">
                <span className="publish-picker-label">公开日期</span>
                <button type="button" className={`publish-datetime-trigger ${scheduleValue ? "selected" : ""}`} onClick={() => { setSchedulePickerOpen(!schedulePickerOpen); setTimePickerOpen(false); }} aria-expanded={schedulePickerOpen}>
                  <span><i className="fa-regular fa-calendar-days" /> {scheduleDisplayValue}</span>
                  <i className={`fa-solid fa-chevron-down ${schedulePickerOpen ? "up" : ""}`} />
                </button>
                {schedulePickerOpen && (
                  <span className="publish-calendar-popover" role="dialog" aria-label="选择公开日期">
                    <span className="publish-calendar-header">
                      <button type="button" aria-label="上个月" disabled={scheduleMonth <= currentCalendarMonth} onClick={() => {
                        const previous = new Date(calendarYear, calendarMonthIndex - 1, 1);
                        setScheduleMonth(`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`);
                      }}><i className="fa-solid fa-chevron-left" /></button>
                      <strong>{calendarYear} 年 {calendarMonthIndex + 1} 月</strong>
                      <button type="button" aria-label="下个月" onClick={() => {
                        const next = new Date(calendarYear, calendarMonthIndex + 1, 1);
                        setScheduleMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
                      }}><i className="fa-solid fa-chevron-right" /></button>
                    </span>
                    <span className="publish-calendar-weekdays">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</span>
                    <span className="publish-calendar-grid">
                      {calendarDays.map((day, index) => {
                        if (!day) return <span key={`image-empty-${index}`} />;
                        const dayValue = `${scheduleMonth}-${String(day).padStart(2, "0")}`;
                        const isSelected = scheduleSelectedDate === dayValue;
                        const isToday = todayLocalValue === dayValue;
                        const isPast = dayValue < todayLocalValue;
                        return <button type="button" key={dayValue} disabled={isPast} className={`${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${isPast ? "past" : ""}`} onClick={() => { if (isPast) return; setScheduleValue(`${dayValue}T${scheduleTime}`); setSchedulePickerOpen(false); }}>{day}</button>;
                      })}
                    </span>
                  </span>
                )}
              </span>
              <span className="publish-time-picker">
                <span className="publish-picker-label">公开时间</span>
                <button type="button" className={`publish-time-trigger ${timePickerOpen ? "open" : ""}`} onClick={() => { setTimePickerOpen(!timePickerOpen); setSchedulePickerOpen(false); }} aria-expanded={timePickerOpen}>
                  <span><i className="fa-regular fa-clock" /> {scheduleTime}</span>
                  <i className={`fa-solid fa-chevron-down ${timePickerOpen ? "up" : ""}`} />
                </button>
                {timePickerOpen && (
                  <span className="publish-time-popover" role="dialog" aria-label="选择公开时间">
                    <span className="publish-time-popover-title">选择小时和分钟</span>
                    <span className="publish-time-columns">
                      <span className="publish-time-column"><span>小时</span><span className="publish-time-options publish-hour-options">
                        {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((hour) => <button type="button" key={hour} className={scheduleHour === hour ? "selected" : ""} onClick={() => { const nextTime = `${hour}:${scheduleMinute}`; setScheduleTime(nextTime); if (scheduleSelectedDate) setScheduleValue(`${scheduleSelectedDate}T${nextTime}`); }}>{hour}</button>)}
                      </span></span>
                      <span className="publish-time-column"><span>分钟</span><span className="publish-time-options publish-minute-options">
                        {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => <button type="button" key={minute} className={scheduleMinute === minute ? "selected" : ""} onClick={() => { const nextTime = `${scheduleHour}:${minute}`; setScheduleTime(nextTime); if (scheduleSelectedDate) setScheduleValue(`${scheduleSelectedDate}T${nextTime}`); setTimePickerOpen(false); }}>{minute}</button>)}
                      </span></span>
                    </span>
                  </span>
                )}
              </span>
            </span>
          </div>
        )}
        <div className="publish-modal-actions">
          <button type="button" className="publish-modal-button publish-modal-button-secondary" onClick={() => setPublishModal(null)} disabled={submitting}>取消</button>
          <button type="button" className="publish-modal-button publish-modal-button-primary" disabled={submitting} onClick={() => {
            if (publishModal === "schedule") {
              if (!scheduleValue) { setErrorMsg("请选择公开时间"); return; }
              const date = new Date(scheduleValue);
              if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) { setErrorMsg("公开时间必须晚于当前时间"); return; }
              setErrorMsg(""); setSchedulePickerOpen(false); setTimePickerOpen(false); setPublishModal(null);
            } else if (publishModal === "draft") {
              setPublishModal(null); handleSaveImageDraft();
            }
          }}>
            {submitting ? "处理中..." : publishModal === "schedule" ? "完成选择" : "保存草稿"}
          </button>
        </div>
      </div>
    </div>
  );

  // ============ 创建/编辑连载 ============

  const createSeries = async () => {
    if (!newSeriesName.trim()) { setErrorMsg("请填写连载名称"); return; }
    if (newSeriesName.trim().length > 20) { setErrorMsg("连载名称不能超过20个字"); return; }
    if (!newSeriesDesc.trim()) { setErrorMsg("请填写连载简介"); return; }
    if (!newSeriesAudience) { setErrorMsg("请先选择男频或女频"); return; }
    if (!newSeriesGenre) { setErrorMsg("请选择作品类型"); return; }
    if (newSeriesDesc.length > 500) { setErrorMsg("连载简介不能超过500个字"); return; }
    setSubmitting(true);
    setErrorMsg("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    const blocked = await assertCanPublish();
    if (blocked) { setErrorMsg(blocked); setSubmitting(false); return; }

    const seriesData = {
      name: newSeriesName.trim(),
      description: newSeriesDesc || null,
      cover_url: null,
      tags: Array.from(new Set([newSeriesAudience === "male" ? "男频" : "女频", newSeriesGenre, ...newSeriesTags])),
      status: "ongoing" as const,
      series_type: newSeriesGenre === "同人" ? "fanfic" : "original",
      review_status: "pending" as const,
    };

    if (editingSeries && editingSeriesId) {
      const { error } = await supabase.from("series").update(seriesData).eq("id", editingSeriesId);
      if (error) { setErrorMsg(`更新失败: ${error.message}`); setSubmitting(false); return; }
      await recordRecentTags(user.id, newSeriesTags);
      notifyStatsChanged();
      setSubmitting(false);
      router.push(`/studio/series/${encodeURIComponent(newSeriesName.trim())}`);
    } else {
      const { error } = await supabase.from("series").insert({ ...seriesData, user_id: user.id });
      if (error) { setErrorMsg(`创建失败: ${error.message}`); setSubmitting(false); return; }
      await recordRecentTags(user.id, newSeriesTags);
      notifyStatsChanged();
      setSubmitting(false);
      router.push(`/studio/series/${encodeURIComponent(newSeriesName.trim())}`);
    }
  };

  // ============ 新增章节 ============

  const submitChapter = async (options?: { scheduledAt?: string; draft?: boolean }) => {
    if (!title.trim()) { setErrorMsg("请填写章节标题"); return; }
    if (!editor.content.trim()) { setErrorMsg("请填写章节内容"); return; }
    if (authorNote.length > 500) { setErrorMsg("作者的话不能超过500个字"); return; }

    const targetSeriesName = seriesNameFromUrl || currentSeries?.name;
    if (!targetSeriesName) return;

    setSubmitting(true);
    setErrorMsg("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg("请先登录"); setSubmitting(false); return; }

    if (!options?.draft) {
      const blocked = await assertCanPublish();
      if (blocked) { setErrorMsg(blocked); setSubmitting(false); return; }
    }

    const nextChapter = chapterNumberOverride ?? (seriesNameFromUrl
      ? chapterNumberFromUrl
      : chapterList.length > 0
        ? Math.max(...chapterList.map((c) => c.chapter_number)) + 1
        : 1);

    const moderationContent = [
      editor.content.trim(),
      authorNote.trim() ? `\n\n<!-- 作者的话：${authorNote.trim()} -->` : "",
    ].join("");
    const scheduledAt = options?.scheduledAt;
    const chapterData = {
      user_id: user.id,
      title: title.trim(),
      content: moderationContent,
      author_note: authorNote.trim() || null,
      word_count: editor.content.replace(/\s/g, "").length,
      status: options?.draft || scheduledAt ? "draft" : "published",
      // 章节也必须先经过 posts 的文字关键词初筛；不能依赖默认的 approved。
      review_status: options?.draft ? "approved" : "pending",
      published_at: options?.draft ? null : (scheduledAt || new Date().toISOString()),
      post_type: "serial",
      series_name: targetSeriesName,
      chapter_number: nextChapter,
      chapter_title: title.trim(),
    };
    const { error } = editPostId
      ? await supabase.from("posts").update(chapterData).eq("id", editPostId).eq("user_id", user.id)
      : await supabase.from("posts").insert(chapterData);

    // 兼容尚未部署作者话/章节字段的数据库，但不能因单个缺失字段丢掉其他章节信息。
    if (error) {
      const missingAuthorNote = error.message?.includes("author_note");
      const missingChapterFields = error.message?.includes("chapter_number") || error.message?.includes("chapter_title");
      if (missingChapterFields || missingAuthorNote) {
        const fallbackChapterData = {
          user_id: user.id,
          title: title.trim(),
          content: moderationContent,
          ...(missingAuthorNote ? {} : { author_note: authorNote.trim() || null }),
          word_count: editor.content.replace(/\s/g, "").length,
          status: options?.draft || scheduledAt ? "draft" : "published",
          review_status: options?.draft ? "approved" : "pending",
          published_at: options?.draft ? null : (scheduledAt || new Date().toISOString()),
          post_type: "serial",
          series_name: targetSeriesName,
          ...(missingChapterFields ? {} : {
            chapter_number: nextChapter,
            chapter_title: title.trim(),
          }),
        };
        const { error: err2 } = editPostId
          ? await supabase.from("posts").update(fallbackChapterData).eq("id", editPostId).eq("user_id", user.id)
          : await supabase.from("posts").insert(fallbackChapterData);
        if (err2) { setErrorMsg(submissionErrorMessage(err2, `发布失败: ${err2.message}`)); setSubmitting(false); return; }
      } else {
        setErrorMsg(submissionErrorMessage(error, `发布失败: ${error.message}`));
        setSubmitting(false);
        return;
      }
    }

    await saveTags(user.id);
    notifyStatsChanged();
    setSubmitting(false);
    if (seriesNameFromUrl) {
      router.push(`/studio/series/${encodeURIComponent(targetSeriesName)}`);
    } else {
      loadChapters(targetSeriesName);
      setView("series-detail");
      setTitle("");
      editor.setContent("");
      setAuthorNote("");
      setTags([]);
    }
  };

  const openChapterPreview = (seriesName: string, chapterNumber: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("inkland:chapter-preview", JSON.stringify({
      seriesName,
      chapterNumber,
      title: title.trim(),
      titleMode: chapterTitleMode,
      content: editor.content,
      authorNote: authorNote.trim(),
      wordCount: editor.content.replace(/\s/g, "").length,
      returnUrl: `${window.location.pathname}${window.location.search}`,
    }));
    window.location.assign("/create/chapter-preview");
  };

  const renderChapterPublishModal = () => publishModal && (
    <div className="publish-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setPublishModal(null); }}>
      <div className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="chapter-publish-modal-title">
        <div className="publish-modal-header"><div className={`publish-modal-icon publish-modal-icon-${publishModal}`}><i className={`fa-solid ${publishModal === "schedule" ? "fa-clock" : "fa-bookmark"}`} /></div><button type="button" className="publish-modal-close" aria-label="关闭弹窗" onClick={() => setPublishModal(null)}><i className="fa-solid fa-xmark" /></button></div>
        <div className="publish-modal-copy"><h2 id="chapter-publish-modal-title">{publishModal === "schedule" ? "定时发布" : "保存为草稿"}</h2><p>{publishModal === "schedule" ? "选择章节公开的日期和时间。" : "当前章节标题、正文和作者的话都会保留，之后可以继续编辑。"}</p></div>
        {publishModal === "schedule" && <div className="publish-modal-field"><span className="publish-schedule-label">公开日期和时间</span><input type="datetime-local" value={scheduleValue} min={toLocalDateTimeValue(new Date(Date.now() + 60_000).toISOString())} onChange={(event) => setScheduleValue(event.target.value)} /></div>}
        <div className="publish-modal-actions"><button type="button" className="publish-modal-button publish-modal-button-primary" disabled={submitting} onClick={() => {
          if (publishModal === "schedule") {
            const date = new Date(scheduleValue);
            if (!scheduleValue || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) { setErrorMsg("公开时间必须晚于当前时间"); return; }
            setErrorMsg(""); setPublishModal(null); setPublishMenuOpen(false);
          } else { setPublishModal(null); setPublishMenuOpen(false); void submitChapter({ draft: true }); }
        }}>{submitting ? "处理中..." : publishModal === "schedule" ? "完成选择" : "保存草稿"}</button></div>
      </div>
    </div>
  );

  // ============ 渲染 HTML ============

  const renderHTML = () => ({ __html: renderSafeMarkdown(editor.content) });

  // ============ 共用编辑器区域 ============

  const renderEditor = (placeholder: string) => (
    <>
      <EditorToolbar
        onBold={editor.bold} onItalic={editor.italic} onUnderline={editor.underline}
        onStrikethrough={editor.strikethrough} onHr={editor.hr} onImage={triggerImageUpload}
        previewMode={previewMode} onTogglePreview={() => setPreviewMode(!previewMode)}
        uploadingImage={uploadingImage} uploadedCount={uploadedImages.length}
      />
      <div className="editor-wrapper">
        {previewMode ? (
          <div
            className="editor-preview active"
            dangerouslySetInnerHTML={renderHTML()}
          />
        ) : (
          <textarea
            ref={editor.textareaRef}
            className="editor-textarea"
            placeholder={placeholder}
            value={editor.content}
            onChange={(e) => editor.setContentRaw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Tab" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); editor.insertAtCursor("  "); } }}
          />
        )}
      </div>

    </>
  );

  // ============ 共用错误提示 ============

  const renderError = () =>
    errorMsg && (
      <div className="create-form-error" role="alert">
        <span className="create-form-error-icon"><i className="fa-solid fa-circle-exclamation" /></span>
        <span className="create-form-error-copy">
          <strong>还不能发布</strong>
          <span>{errorMsg}</span>
        </span>
      </div>
    );

  if (!initDone) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center" role="status" aria-live="polite">
        <span className="text-muted">正在加载作品…</span>
      </div>
    );
  }

  // ============ 审核未通过提示 ============

  const fieldLabel = (field?: string | null) => {
    switch (field) {
      case "title": return "标题";
      case "content": return "正文";
      case "author_note": return "作者的话";
      case "image_ocr": return "图片中的文字";
      case "image": return "图片";
      default: return "作品内容";
    }
  };

  const locateReviewIssue = (issue: ReviewIssue) => {
    const field = issue.field_name || (issue.location_type === "image" || issue.location_type === "image_ocr" ? "image_ocr" : "content");
    const scrollTo = (el: Element | null, focus = false) => {
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (focus && el instanceof HTMLElement) el.focus({ preventScroll: true });
      el.animate?.(
        [
          { outline: "2px solid #ef4444", outlineOffset: "2px" },
          { outline: "2px solid transparent", outlineOffset: "2px" },
        ],
        { duration: 1600, easing: "ease-out" },
      );
    };

    if (field === "title") {
      if (view === "image") scrollTo(document.getElementById("imageTitle"), true);
      else if (view === "chapter-create") scrollTo(document.getElementById("chapterTitle"), true);
      else scrollTo(document.getElementById("articleTitle"), true);
      return;
    }
    if (field === "author_note") {
      scrollTo(document.getElementById("chapterAuthorNote"), true);
      return;
    }
    if (field === "image" || field === "image_ocr") {
      if (view !== "image") setView("image");
      window.setTimeout(() => {
        const grid = document.querySelector<HTMLElement>("#page-create .image-grid");
        const index = issue.image_index ?? 0;
        scrollTo(grid?.querySelectorAll<HTMLElement>(".image-grid-item")?.[index] || grid);
      }, 80);
      return;
    }
    // 正文 / 图片说明
    if (view === "image") {
      scrollTo(document.getElementById("imageDescription"), true);
      return;
    }
    scrollTo(document.querySelector<HTMLElement>("#page-create .editor-content"));
  };

  const renderRejectionBanner = () =>
    reviewRejectionReason && (
      <div className="review-rejection-banner" role="alert">
        <div className="review-rejection-head">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <strong>作品未通过审核</strong>
        </div>
        <p className="review-rejection-reason">{reviewRejectionReason}</p>
        {publishedVersionNumber != null && (
          <p className="review-rejection-note">
            <i className="fa-solid fa-circle-info" aria-hidden="true" />
            旧版本仍公开可见，不会受到影响；修改并重新提交后，通过审核的新版本才会替换旧版本。
          </p>
        )}
        {reviewIssues.length > 0 && (
          <div className="review-issues">
            <div className="review-issues-title">本次标记的问题（{reviewIssues.length}）</div>
            <ul className="review-issues-list">
              {reviewIssues.map((issue, index) => (
                <li key={issue.id || index} className="review-issue-item">
                  <span className="review-issue-index">{index + 1}</span>
                  <span className="review-issue-field">{fieldLabel(issue.field_name)}</span>
                  {issue.location_type === "paragraph" && issue.paragraph_index != null && (
                    <span className="review-issue-pos">第 {issue.paragraph_index} 段</span>
                  )}
                  {issue.image_index != null && (
                    <span className="review-issue-pos">第 {issue.image_index + 1} 张图</span>
                  )}
                  {issue.quoted_text && <span className="review-issue-quote">「{issue.quoted_text}」</span>}
                  {issue.details && <span className="review-issue-details">{issue.details}</span>}
                  <button type="button" className="review-issue-locate" onClick={() => locateReviewIssue(issue)}>
                    <i className="fa-solid fa-crosshairs" aria-hidden="true" /> 定位
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );

  const renderPendingReviewBanner = () =>
    pendingReviewStatus === "pending" && (
      <div className="review-pending-banner" role="status">
        <i className="fa-solid fa-hourglass-half" aria-hidden="true" />
        {publishedVersionNumber != null
          ? "修改已提交人工审核，旧版本继续公开；审核通过后新版本会自动替换。"
          : "作品已进入人工审核，审核通过后会公开。"}
      </div>
    );

  // ============ 视图路由 ============

  // ---- 类型选择 ----
  if (view === "select") {
    const types = [
      { view: "text" as ViewType, icon: "fa-file-lines", label: "发布单篇", desc: "发布独立的文章，支持 Markdown 编辑，适合短篇故事、随笔、杂谈" },
      { view: "image" as ViewType, icon: "fa-image", label: "发布图片", desc: "上传插画、漫画或摄影作品，配以文字说明，展示你的视觉创作" },
      { view: "series-create" as ViewType, icon: "fa-book", label: "长篇连载", desc: "创建长篇连载作品，支持多章节管理，适合小说、长篇等持续创作" },
    ];

    return (
      <div id="page-create" className="min-h-screen bg-paper">
        <div className="page-container">
          <div className="form-view active" id="view-type-select">
            <h1 className="view-title">选择发布类型</h1>
            <p className="view-subtitle">选择你想要发布的作品类型，开始创作之旅</p>
            <div className="type-cards">
              {types.map((t) => (
                <button
                  key={t.view}
                  type="button"
                  className="type-card"
                  onClick={() => {
                    setErrorMsg("");
                    if (t.view === "text") router.push("/create/article");
                    else if (t.view === "image") router.push("/create/image");
                    else if (t.view === "series-create") {
                      setNewSeriesName(""); setNewSeriesDesc(""); setNewSeriesTags([]); setNewSeriesType("original");
                      setEditingSeries(false); setEditingSeriesId(null); router.push("/create/series");
                    }
                  }}
                >
                  <div className="type-card-icon">
                    <i className={`fa-solid ${t.icon}`} />
                  </div>
                  <div className="type-card-title">{t.label}</div>
                  <div className="type-card-desc">{t.desc}</div>
                </button>
              ))}
              <Link href="/studio/import" className="type-card">
                <div className="type-card-icon">
                  <i className="fa-solid fa-file-import" aria-hidden="true" />
                </div>
                <div className="type-card-title">批量导入作品</div>
                <div className="type-card-desc">从本地文档、Notion 或飞书一次导入多篇内容，确认后统一编辑和发布</div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- 发布单篇 ----
  if (view === "text") {
    return (
      <main id="page-create" className="publish-page publish-article-page">
        <div className="publish-container">
          <div className="publish-form">
            {renderNotice()}
            {renderRejectionBanner()}
            {renderPendingReviewBanner()}
            <div className="form-section">
              <label className="form-label" htmlFor="articleTitle">作品标题 <span className="required-mark">*</span></label>
              <input
                id="articleTitle"
                type="text"
                className="form-input"
                placeholder="请输入作品标题"
                required
                maxLength={50}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className="title-character-count" aria-live="polite">{title.length}/50</div>
            </div>

            <div className="form-section">
              <label className="form-label">正文</label>
              <ArticleEditorSurface value={editor.content} onChange={editor.setContentRaw} editorTools />
            </div>

            <div className="form-section">
              <label className="form-label" htmlFor="articleTagInput">标签</label>
              <div className="tag-input-wrapper" onClick={() => document.getElementById("articleTagInput")?.focus()}>
                {tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                    <button type="button" className="tag-chip-remove" aria-label={`删除标签 ${tag}`} onClick={() => setTags(tags.filter((item) => item !== tag))}>
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </span>
                ))}
                <input
                  id="articleTagInput"
                  type="text"
                  className="tag-input-field"
                  placeholder="输入标签，按回车添加"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const tag = tagInput.trim();
                      if (tag && !tags.includes(tag)) { setTags(addTags(tags, [tag])); setTagInput(""); }
                    }
                  }}
                />
              </div>
              <div className="tag-suggestions">
                <span className="tag-suggestion-label">近期使用标签</span>
                {recommendedTags.map((tag) => (
                  <button type="button" key={tag} className="tag-suggestion-chip" onClick={() => { const t = tag.trim(); if (t && !tags.includes(t)) setTags(addTags(tags, [t])); }}>
                    {tag}
                  </button>
                ))}
                <span className="tag-suggestion-label">每篇最多 {MAX_TAGS_PER_WORK} 个标签，当前 {tags.length} 个</span>
              </div>
            </div>

            <div className="form-section">
              <span className="form-label">加入合集</span>
              <div className="collection-options" role="radiogroup" aria-label="加入合集">
                {[
                  { value: "none" as const, title: "不加入合集", desc: "作品将独立发布，不归属任何合集" },
                  { value: "select" as const, title: "选择已有合集", desc: "将作品加入你已创建的合集" },
                  { value: "create" as const, title: "创建新合集", desc: "为此作品创建一个全新的合集" },
                ].map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`collection-option ${collectionMode === option.value ? "selected" : ""}`}
                    onClick={() => setCollectionMode(option.value)}
                    role="radio"
                    aria-checked={collectionMode === option.value}
                  >
                    <span className="collection-option-copy">
                      <span className="collection-option-text">{option.title}</span>
                      <span className="collection-option-desc">{option.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              {collectionMode === "select" && (
                <div className="collection-existing-select show">
                  <div className={`custom-select ${collectionSelectOpen ? "open" : ""}`}>
                  <button type="button" className="custom-select-trigger" onClick={() => setCollectionSelectOpen(!collectionSelectOpen)}>
                    <span className={`custom-select-value ${selectedCollection ? "selected" : ""}`}>{selectedCollection || "请选择合集..."}</span>
                    <i className="fa-solid fa-chevron-down custom-select-arrow" />
                  </button>
                  {collectionSelectOpen && (
                    <div className="custom-select-dropdown">
                      {existingCollections.map((collection) => (
                        <button type="button" key={collection.name} className={`custom-select-option ${selectedCollection === collection.name ? "selected" : ""}`} onClick={() => { setSelectedCollection(collection.name); setCollectionSelectOpen(false); }}>
                          {collection.name}（{collection.count} 篇）
                        </button>
                      ))}
                      {existingCollections.length === 0 && <div className="custom-select-empty">暂无可选合集</div>}
                    </div>
                  )}
                  </div>
                </div>
              )}
              {collectionMode === "create" && (
                <div className="collection-new-form show">
                  <input className="form-input" placeholder="合集名称" maxLength={50} value={collectionName} onChange={(e) => setCollectionName(e.target.value)} />
                  <input className="form-input" placeholder="合集简介（选填）" maxLength={200} value={collectionDesc} onChange={(e) => setCollectionDesc(e.target.value)} />
                  <button type="button" className="btn-collection-create" onClick={createCollection} disabled={submitting}>
                    <i className="fa-solid fa-check" /> 创建合集
                  </button>
                </div>
              )}
            </div>

            <VisibilityOptions
              value={visibility}
              disabled={uploadingImage}
              onChange={(next) => { void handleVisibilityChange(next); }}
            />

            {errorMsg && !successMsg && renderError()}

            <div className="publish-footer">
              <Link href="/guidelines" className="publish-guidelines"><i className="fa-solid fa-shield-halved" /> 社区公约与发布规范</Link>
              <div className="publish-actions">
                {scheduleValue && visibility !== "private" && (
                  <div className="scheduled-summary" role="status">
                    <i className="fa-regular fa-clock" />
                    <span>定时于 {new Date(scheduleValue).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 发布</span>
                    <button type="button" aria-label="清除定时发布" onClick={() => setScheduleValue("")}><i className="fa-solid fa-xmark" /></button>
                  </div>
                )}
                <div className="publish-dropdown">
                  <div className="btn-publish-split">
                    <button type="button" className="btn-publish" onClick={() => submitText(scheduleValue && visibility !== "private" ? { scheduledAt: new Date(scheduleValue).toISOString() } : undefined)} disabled={submitting || uploadingImage}>
                      <i className={`fa-solid ${submitting || uploadingImage ? "fa-spinner fa-spin" : "fa-paper-plane"}`} />
                      {submitting ? "发布中..." : uploadingImage ? "准备图片中..." : (editPostId ? "保存修改" : "发布作品")}
                    </button>
                    <button type="button" className="btn-publish-arrow" aria-label="更多发布选项" onClick={() => setPublishMenuOpen(!publishMenuOpen)}>
                      <i className="fa-solid fa-chevron-down" />
                    </button>
                  </div>
                  {publishMenuOpen && (
                    <div className="publish-dropdown-menu show">
                      <button
                        type="button"
                        className="publish-dropdown-item"
                        onClick={() => {
                          setPublishMenuOpen(false);
                          setErrorMsg("");
                          setPublishModal("schedule");
                        }}
                      >
                        <i className="fa-solid fa-clock" /> 定时发布
                      </button>
                      <button type="button" className="publish-dropdown-item" onClick={() => { setPublishMenuOpen(false); setPublishModal("draft"); }}><i className="fa-solid fa-bookmark" /> 保存为草稿</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {publishModal && (
          <div className="publish-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setPublishModal(null); }}>
            <div className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-modal-title">
              <div className="publish-modal-header">
                <div className={`publish-modal-icon publish-modal-icon-${publishModal}`}>
                  <i className={`fa-solid ${publishModal === "schedule" ? "fa-clock" : "fa-bookmark"}`} />
                </div>
                <button type="button" className="publish-modal-close" aria-label="关闭弹窗" onClick={() => setPublishModal(null)} disabled={submitting}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <div className="publish-modal-copy">
                <h2 id="publish-modal-title">
                  {publishModal === "schedule" ? "定时发布" : "保存为草稿"}
                </h2>
                <p>
                  {publishModal === "schedule" ? "选择作品公开的日期和时间，完成后点击发布作品提交。" : "当前标题、正文和标签都会保留，之后可以继续编辑。"}
                </p>
              </div>
              {publishModal === "schedule" && (
                <div className="publish-modal-field">
                  <span className="publish-schedule-label">公开日期和时间</span>
                  <span className="publish-schedule-fields">
                    <span className="publish-datetime-picker">
                      <span className="publish-picker-label">公开日期</span>
                      <button type="button" className={`publish-datetime-trigger ${scheduleValue ? "selected" : ""}`} onClick={() => { setSchedulePickerOpen(!schedulePickerOpen); setTimePickerOpen(false); }} aria-expanded={schedulePickerOpen}>
                        <span><i className="fa-regular fa-calendar-days" /> {scheduleDisplayValue}</span>
                        <i className={`fa-solid fa-chevron-down ${schedulePickerOpen ? "up" : ""}`} />
                      </button>
                      {schedulePickerOpen && (
                        <span className="publish-calendar-popover" role="dialog" aria-label="选择公开日期">
                        <span className="publish-calendar-header">
                          <button type="button" aria-label="上个月" disabled={scheduleMonth <= currentCalendarMonth} onClick={() => {
                            const previous = new Date(calendarYear, calendarMonthIndex - 1, 1);
                            setScheduleMonth(`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`);
                          }}><i className="fa-solid fa-chevron-left" /></button>
                          <strong>{calendarYear} 年 {calendarMonthIndex + 1} 月</strong>
                          <button type="button" aria-label="下个月" onClick={() => {
                            const next = new Date(calendarYear, calendarMonthIndex + 1, 1);
                            setScheduleMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
                          }}><i className="fa-solid fa-chevron-right" /></button>
                        </span>
                        <span className="publish-calendar-weekdays">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</span>
                        <span className="publish-calendar-grid">
                          {calendarDays.map((day, index) => {
                            if (!day) return <span key={`empty-${index}`} />;
                            const dayValue = `${scheduleMonth}-${String(day).padStart(2, "0")}`;
                            const isSelected = scheduleSelectedDate === dayValue;
                            const isToday = todayLocalValue === dayValue;
                            const isPast = dayValue < todayLocalValue;
                            return (
                              <button type="button" key={dayValue} disabled={isPast} className={`${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${isPast ? "past" : ""}`} onClick={() => { if (isPast) return; setScheduleValue(`${dayValue}T${scheduleTime}`); setSchedulePickerOpen(false); }}>
                                {day}
                              </button>
                            );
                          })}
                        </span>
                      </span>
                      )}
                    </span>
                    <span className="publish-time-picker">
                      <span className="publish-picker-label">公开时间</span>
                      <button type="button" className={`publish-time-trigger ${timePickerOpen ? "open" : ""}`} onClick={() => { setTimePickerOpen(!timePickerOpen); setSchedulePickerOpen(false); }} aria-expanded={timePickerOpen}>
                        <span><i className="fa-regular fa-clock" /> {scheduleTime}</span>
                        <i className={`fa-solid fa-chevron-down ${timePickerOpen ? "up" : ""}`} />
                      </button>
                      {timePickerOpen && (
                        <span className="publish-time-popover" role="dialog" aria-label="选择公开时间">
                          <span className="publish-time-popover-title">选择小时和分钟</span>
                          <span className="publish-time-columns">
                            <span className="publish-time-column">
                              <span>小时</span>
                              <span className="publish-time-options publish-hour-options">
                                {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((hour) => (
                                  <button type="button" key={hour} className={scheduleHour === hour ? "selected" : ""} onClick={() => { const nextTime = `${hour}:${scheduleMinute}`; setScheduleTime(nextTime); if (scheduleSelectedDate) setScheduleValue(`${scheduleSelectedDate}T${nextTime}`); }}>
                                    {hour}
                                  </button>
                                ))}
                              </span>
                            </span>
                            <span className="publish-time-column">
                              <span>分钟</span>
                              <span className="publish-time-options publish-minute-options">
                                {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => (
                                  <button type="button" key={minute} className={scheduleMinute === minute ? "selected" : ""} onClick={() => { const nextTime = `${scheduleHour}:${minute}`; setScheduleTime(nextTime); if (scheduleSelectedDate) setScheduleValue(`${scheduleSelectedDate}T${nextTime}`); setTimePickerOpen(false); }}>
                                    {minute}
                                  </button>
                                ))}
                              </span>
                            </span>
                          </span>
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              )}
              <div className="publish-modal-actions">
                <button type="button" className="publish-modal-button publish-modal-button-secondary" onClick={() => setPublishModal(null)} disabled={submitting}>取消</button>
                <button
                  type="button"
                  className="publish-modal-button publish-modal-button-primary"
                  disabled={submitting}
                  onClick={() => {
                    if (publishModal === "schedule") {
                      if (!scheduleValue) { setErrorMsg("请选择公开时间"); return; }
                      const date = new Date(scheduleValue);
                      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) { setErrorMsg("公开时间必须晚于当前时间"); return; }
                      setErrorMsg("");
                      setSchedulePickerOpen(false);
                      setTimePickerOpen(false);
                      setPublishModal(null);
                    } else if (publishModal === "draft") {
                      setPublishModal(null);
                      handleSaveDraft();
                    }
                  }}
                >
                  {submitting ? "处理中..." : publishModal === "schedule" ? "完成选择" : "保存草稿"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ---- 发布图片 ----
  if (view === "image") {
    return (
      <div id="page-create" className="publish-page publish-article-page min-h-screen bg-paper">
        <div className="publish-container">
          <div className="publish-form">
            {renderNotice()}
            {renderRejectionBanner()}
            {renderPendingReviewBanner()}

            {/* 作品标题 */}
            <div className="form-section">
              <label className="form-label">作品标题</label>
              <input
                id="imageTitle"
                type="text" className="form-input" placeholder="（选填）" maxLength={100}
                value={title} onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* 图片上传 */}
            <div className="form-section">
              <label className="form-label">上传图片</label>
              <div
                className="image-upload-area"
                onClick={triggerImageUpload}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void processImageFiles(event.dataTransfer.files);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") triggerImageUpload();
                }}
                aria-label="上传图片"
              >
                <i className="fa-solid fa-cloud-arrow-up image-upload-icon"></i>
                <div className="image-upload-title">点击或拖拽上传图片</div>
                {uploadingImage && (
                  <div className="image-upload-progress">
                    <i className="fa-solid fa-spinner fa-spin" aria-label="上传中" />
                    <span>正在上传图片，请稍候...</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="image-upload-input"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
              />
              {uploadedImages.length > 0 && (
                <div className="image-grid">
                  {uploadedImages.map((img, i) => (
                    <div key={i} className="image-grid-item">
                      <img src={img.url} alt={img.name} />
                      <div className="image-grid-item-overlay">
                        <button
                          className="image-grid-item-delete"
                          onClick={() => setUploadedImages((prev) => prev.filter((_, j) => j !== i))}
                          title="删除图片"
                        >
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 图片说明 */}
            <div className="form-section">
              <label className="form-label">图片说明</label>
              <textarea
                id="imageDescription"
                className="form-textarea"
                placeholder="分享一些关于图片的看法或说明（选填）"
                maxLength={2000}
                value={imageDesc}
                onChange={(e) => setImageDesc(e.target.value)}
              />
            </div>

            {/* 标签 */}
            <div className="form-section">
              <label className="form-label">标签</label>
              <div className="tag-input-wrapper" onClick={() => { const inp = document.querySelector<HTMLInputElement>('#page-create .tag-input-field'); inp?.focus(); }}>
                {tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                    <span className="tag-chip-remove" onClick={() => setTags(tags.filter((t) => t !== tag))}>
                      <i className="fa-solid fa-xmark"></i>
                    </span>
                  </span>
                ))}
                <input
                  type="text"
                  className="tag-input-field"
                  placeholder="输入标签，按回车添加"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const t = tagInput.trim();
                      if (t && !tags.includes(t)) {
                        setTags(addTags(tags, [t]));
                        setTagInput("");
                      }
                    }
                  }}
                />
              </div>
              <div className="tag-suggestions">
                <span className="tag-suggestion-label">近期使用标签</span>
                {recommendedTags.map((tag) => (
                  <span
                    key={tag}
                    className="tag-suggestion-chip"
                    onClick={() => { const t = tag.trim(); if (t && !tags.includes(t)) setTags(addTags(tags, [t])); }}
                  >
                    {tag}
                  </span>
                ))}
                <span className="tag-suggestion-label">每篇最多 {MAX_TAGS_PER_WORK} 个标签，当前 {tags.length} 个</span>
              </div>
            </div>

            {/* 加入合集 */}
            <div className="form-section">
              <span className="form-label">加入合集</span>
              <div className="collection-options" role="radiogroup" aria-label="加入合集">
                {[
                  { value: "none" as const, title: "不加入合集", desc: "作品将独立发布，不归属任何合集" },
                  { value: "select" as const, title: "选择已有合集", desc: "将作品加入你已创建的合集" },
                  { value: "create" as const, title: "创建新合集", desc: "为此作品创建一个全新的合集" },
                ].map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`collection-option ${collectionMode === option.value ? "selected" : ""}`}
                    onClick={() => setCollectionMode(option.value)}
                    role="radio"
                    aria-checked={collectionMode === option.value}
                  >
                    <span className="collection-option-copy">
                      <span className="collection-option-text">{option.title}</span>
                      <span className="collection-option-desc">{option.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              {collectionMode === "select" && (
                <div className="collection-existing-select show">
                  <div className={`custom-select ${collectionSelectOpen ? "open" : ""}`}>
                    <button type="button" className="custom-select-trigger" onClick={() => setCollectionSelectOpen(!collectionSelectOpen)}>
                      <span className={`custom-select-value ${selectedCollection ? "selected" : ""}`}>{selectedCollection || "请选择合集..."}</span>
                      <i className="fa-solid fa-chevron-down custom-select-arrow" />
                    </button>
                    {collectionSelectOpen && (
                      <div className="custom-select-dropdown">
                        {existingCollections.map((collection) => (
                          <button type="button" key={collection.name} className={`custom-select-option ${selectedCollection === collection.name ? "selected" : ""}`} onClick={() => { setSelectedCollection(collection.name); setCollectionSelectOpen(false); }}>
                            {collection.name}（{collection.count} 篇）
                          </button>
                        ))}
                        {existingCollections.length === 0 && <div className="custom-select-empty">暂无可选合集</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {collectionMode === "create" && (
                <div className="collection-new-form show">
                  <input className="form-input" placeholder="合集名称" maxLength={50} value={collectionName} onChange={(e) => setCollectionName(e.target.value)} />
                  <input className="form-input" placeholder="合集简介（选填）" maxLength={200} value={collectionDesc} onChange={(e) => setCollectionDesc(e.target.value)} />
                  <button type="button" className="btn-collection-create" onClick={createCollection} disabled={submitting}>
                    <i className="fa-solid fa-check" /> 创建合集
                  </button>
                </div>
              )}
            </div>

            <VisibilityOptions
              value={visibility}
              disabled={uploadingImage}
              onChange={(next) => { void handleVisibilityChange(next); }}
            />

            {/* Footer */}
            <div className="publish-footer">
              <Link href="/guidelines" className="publish-guidelines">
                <i className="fa-solid fa-shield-halved"></i> 社区公约与发布规范
              </Link>
              <div className="publish-actions">
                {scheduleValue && visibility !== "private" && (
                  <div className="scheduled-summary" role="status">
                    <i className="fa-regular fa-clock" />
                    <span>定时于 {new Date(scheduleValue).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 发布</span>
                    <button type="button" aria-label="清除定时发布" onClick={() => setScheduleValue("")}><i className="fa-solid fa-xmark" /></button>
                  </div>
                )}
                <div className="publish-dropdown">
                  <div className="btn-publish-split">
                    <button type="button" className="btn-publish" onClick={() => submitImage(scheduleValue && visibility !== "private" ? { scheduledAt: new Date(scheduleValue).toISOString() } : undefined)} disabled={submitting || uploadingImage}>
                      <i className={`fa-solid ${submitting ? "fa-spinner fa-spin" : "fa-paper-plane"}`} />
                      {submitting ? "发布中..." : (editPostId ? "保存修改" : "发布作品")}
                    </button>
                    <button type="button" className="btn-publish-arrow" aria-label="更多发布选项" onClick={() => setPublishMenuOpen(!publishMenuOpen)}>
                      <i className="fa-solid fa-chevron-down" />
                    </button>
                  </div>
                  {publishMenuOpen && (
                    <div className="publish-dropdown-menu show">
                      <button type="button" className="publish-dropdown-item" onClick={() => { setPublishMenuOpen(false); setErrorMsg(""); setPublishModal("schedule"); }}>
                        <i className="fa-solid fa-clock" /> 定时发布
                      </button>
                      <button type="button" className="publish-dropdown-item" onClick={() => { setPublishMenuOpen(false); setPublishModal("draft"); }}>
                        <i className="fa-solid fa-bookmark" /> 保存为草稿
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {renderImagePublishModal()}
          </div>
        </div>
      </div>
    );
  }

  // ---- 长篇连载 - 创建/编辑 ----
  if (view === "series-create") {
    return (
      <main id="page-create" className="publish-page publish-series-page">
        <div className="publish-container">
          <div className="publish-form">
            <div className="form-section">
              <label className="form-label" htmlFor="seriesName">连载名称</label>
              <input
                id="seriesName"
                type="text"
                className="form-input"
                placeholder="连载名称（必填）"
                maxLength={20}
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
              />
              <div className={`series-field-count ${newSeriesName.length >= 18 ? "warning" : ""}`}>{newSeriesName.length} / 20</div>
            </div>

            <div className="form-section">
              <label className="form-label" htmlFor="seriesDescription">连载简介</label>
              <textarea
                id="seriesDescription"
                className="form-textarea"
                placeholder="连载简介（必填）"
                maxLength={500}
                required
                aria-required="true"
                value={newSeriesDesc}
                onChange={(e) => setNewSeriesDesc(e.target.value)}
              />
              <div className={`series-field-count ${newSeriesDesc.length >= 450 ? "warning" : ""}`}>{newSeriesDesc.length} / 500</div>
            </div>

            <div className="form-section series-type-section">
              <span className="form-label">作品类型</span>
              <div className="radio-options series-audience-options" role="radiogroup" aria-label="作品频道">
                {[{ value: "male" as const, label: "男频" }, { value: "female" as const, label: "女频" }].map((option) => (
                  <button key={option.value} type="button" className={`radio-option ${newSeriesAudience === option.value ? "selected" : ""}`} onClick={() => { setNewSeriesAudience(option.value); setNewSeriesGenre(""); setNewSeriesType("original"); }} role="radio" aria-checked={newSeriesAudience === option.value}><span className="radio-option-text">{option.label}</span></button>
                ))}
              </div>
              {newSeriesAudience && <div className="series-genre-options" role="radiogroup" aria-label="作品分类">
                {(newSeriesAudience === "male" ? ["玄幻","奇幻","武侠","仙侠","都市","种田","现实","军事","历史","游戏","体育","科幻","同人","灵异"] : ["古言","仙侠","现言","玄幻","悬疑","科幻","游戏","年代","快穿","民国","同人"]).map((genre) => (
                  <button key={genre} type="button" className={newSeriesGenre === genre ? "selected" : ""} onClick={() => { setNewSeriesGenre(genre); setNewSeriesType(genre === "同人" ? "fanfic" : "original"); }} role="radio" aria-checked={newSeriesGenre === genre}>{genre}</button>
                ))}
              </div>}
            </div>

            <div className="form-section">
              <label className="form-label" htmlFor="seriesTagInput">标签</label>
              <div className="tag-input-wrapper" onClick={() => document.getElementById("seriesTagInput")?.focus()}>
                {newSeriesTags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                    <button
                      type="button"
                      className="tag-chip-remove"
                      aria-label={`删除标签 ${tag}`}
                      onClick={() => setNewSeriesTags(newSeriesTags.filter((item) => item !== tag))}
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </span>
                ))}
                <input
                  id="seriesTagInput"
                  type="text"
                  className="tag-input-field"
                  placeholder="输入标签，按回车添加"
                  value={newSeriesTagInput}
                  onChange={(e) => setNewSeriesTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const tag = newSeriesTagInput.trim();
                      if (tag && !newSeriesTags.includes(tag)) {
                        setNewSeriesTags(addTags(newSeriesTags, [tag]));
                        setNewSeriesTagInput("");
                      }
                    }
                  }}
                />
              </div>
              <div className="tag-suggestions">
                <span className="tag-suggestion-label">近期使用标签</span>
                {recommendedTags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    className="tag-suggestion-chip"
                    onClick={() => { const t = tag.trim(); if (t && !newSeriesTags.includes(t)) setNewSeriesTags(addTags(newSeriesTags, [t])); }}
                  >
                    {tag}
                  </button>
                ))}
                <span className="tag-suggestion-label">每篇最多 {MAX_TAGS_PER_WORK} 个标签，当前 {newSeriesTags.length} 个</span>
              </div>
            </div>

            {renderError()}

            <div className="publish-footer">
              <Link href="/settings" className="publish-guidelines">
                <i className="fa-solid fa-shield-halved" /> 社区公约与发布规范
              </Link>
              <button type="button" className="btn-publish" onClick={createSeries} disabled={submitting}>
                <i className={`fa-solid ${submitting ? "fa-spinner fa-spin" : "fa-paper-plane"}`} />
                {submitting ? "发布中..." : (editingSeries ? "保存修改" : "发布长篇")}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---- 长篇连载 - 章节管理 ----
  if (view === "series-detail" && currentSeries) {
    return (
      <div className="min-h-screen bg-paper chapter-create-page">
        <header className="sticky top-0 z-50 bg-card border-b border-rule">
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
          <div className="mb-6 p-4 rounded-xl bg-card border border-rule">
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
                <div key={ch.id} className="flex items-center gap-4 p-3 rounded-lg bg-card border border-rule">
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
    const displayChapterNum = chapterNumberOverride ?? (seriesNameFromUrl ? chapterNumberFromUrl : chapterList.length + 1);
    const isEditingChapter = Boolean(editPostId);

    return (
      <div className="min-h-screen bg-paper publish-article-page chapter-create-page" id="page-create">
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
        <main className="chapter-container">
          {renderRejectionBanner()}
          {renderPendingReviewBanner()}
          {targetSeriesName && (
            <div className="serial-info-card">
              <div className="serial-info-body">
                <div className="serial-info-name">{targetSeriesName}</div>
                <div className="serial-info-meta">
                  <span className="serial-info-status"><span className="serial-info-status-label">连载中</span></span>
                  <span className="dot" />
                  <span><i className="fa-solid fa-layer-group" /> {isEditingChapter ? `正在编辑第 ${displayChapterNum} 章` : `即将更新第 ${displayChapterNum} 章`}</span>
                </div>
              </div>
            </div>
          )}
            <section className="form-section chapter-title-section">
              <div className="form-section-header chapter-title-header">
                <label className="form-label" htmlFor="chapterTitle">章节标题</label>
                <button type="button" className="chapter-title-mode-button" aria-pressed={chapterTitleMode === "free"} onClick={() => setChapterTitleMode((mode) => mode === "numbered" ? "free" : "numbered")}>
                  <i className="fa-solid fa-repeat" aria-hidden="true" />
                  {chapterTitleMode === "numbered" ? "切换为无序号标题" : "切换为章节序号标题"}
                </button>
              </div>
              <div className={`chapter-title-row ${chapterTitleMode === "free" ? "is-free-title" : ""}`}>
                {chapterTitleMode === "numbered" && <>
                  <span className="chapter-title-prefix">第</span>
                  <input className="chapter-number-input" type="text" inputMode="numeric" pattern="[0-9]*" aria-label="章节序号" value={displayChapterNum} onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "");
                    const nextNumber = Number.parseInt(digits, 10);
                    if (Number.isFinite(nextNumber) && nextNumber > 0) setChapterNumberOverride(nextNumber);
                  }} />
                  <span className="chapter-title-prefix chapter-title-prefix--spacer">章</span>
                </>}
                <input id="chapterTitle" type="text" placeholder="章节标题（30字以内）" className="chapter-name-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} />
              </div>
            </section>
            <section className="form-section chapter-editor-section">
              <div className="form-section-header"><label className="form-label">正文内容</label></div>
              <ArticleEditorSurface value={editor.content} onChange={editor.setContentRaw} editorTools onPreview={() => openChapterPreview(targetSeriesName || "未命名连载", displayChapterNum)} />
            </section>
            <section className="form-section chapter-author-note-field">
              <div className="form-section-header"><label className="form-label" htmlFor="chapterAuthorNote">作者的话</label></div>
              <textarea
                id="chapterAuthorNote"
                className="author-note-input"
                value={authorNote}
                onChange={(event) => setAuthorNote(event.target.value)}
                placeholder="在这里写下你想对读者说的话..."
                maxLength={500}
                rows={3}
              />
              <div className={`author-note-footer ${authorNote.length >= 450 ? "warning" : ""}`}>{authorNote.length} / 500</div>
            </section>
            {renderError()}
            <div className="publish-action-bar">
              <div className="publish-actions-right">
                {scheduleValue && <div className="scheduled-summary" role="status">
                  <i className="fa-regular fa-clock" />
                  <span>定时于 {new Date(scheduleValue).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 发布</span>
                  <button type="button" aria-label="清除定时发布" onClick={() => setScheduleValue("")}><i className="fa-solid fa-xmark" /></button>
                </div>}
                <div className="publish-dropdown" ref={chapterPublishRef}>
                  <div className="btn-publish-split">
                  <button type="button" className="btn-publish" onClick={() => void submitChapter(scheduleValue ? { scheduledAt: new Date(scheduleValue).toISOString() } : undefined)} disabled={submitting}>
                    <i className={`fa-solid ${submitting ? "fa-spinner fa-spin" : "fa-paper-plane"}`} />
                    {submitting ? "保存中..." : isEditingChapter ? "保存修改" : "立即发布"}
                  </button>
                  <button type="button" className="btn-publish-arrow" aria-label="更多发布选项" aria-expanded={publishMenuOpen} onClick={() => setPublishMenuOpen((open) => !open)}><i className={`fa-solid fa-chevron-down ${publishMenuOpen ? "up" : ""}`} /></button>
                  </div>
                  {publishMenuOpen && <div className="publish-dropdown-menu show">
                    <button type="button" className="publish-dropdown-item" onClick={() => { setPublishMenuOpen(false); setErrorMsg(""); setPublishModal("schedule"); }}><i className="fa-solid fa-clock" />定时发布</button>
                    <button type="button" className="publish-dropdown-item" onClick={() => { setPublishMenuOpen(false); setErrorMsg(""); setPublishModal("draft"); }}><i className="fa-solid fa-bookmark" />保存为草稿</button>
                  </div>}
                </div>
              </div>
            </div>
            {renderChapterPublishModal()}
        </main>
      </div>
    );
  }

  return null;
}
