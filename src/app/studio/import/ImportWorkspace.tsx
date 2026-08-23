"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import mammoth from "mammoth";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/browser";
import { assertCanPublish } from "@/lib/userRestrictions";
import { cleanImportHeading, splitImportChapters, type ImportChapter } from "@/lib/importChapterDetection";
import styles from "./import.module.css";

const ACCEPTED_EXTENSIONS = new Set(["txt", "text", "md", "markdown", "html", "htm", "docx", "epub"]);
const MAX_FILE_COUNT = 50;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

interface ParsedWork {
  id: string;
  title: string;
  content: string;
  sourceName: string;
  sourceType: string;
  sourceHash: string;
  wordCount: number;
  selected: boolean;
  tags: string[];
  warning?: string;
  sourceUrl?: string;
  sourceBatchId?: string;
  sourcePlanId?: string;
  groupMode?: "single" | "collection" | "serial";
  groupName?: string;
  groupDescription?: string;
  groupTags?: string[];
  chapterNumber?: number;
  chapterTitle?: string;
  detectedEncoding?: string;
}

interface PublishResult {
  workId: string;
  title: string;
  status: "waiting" | "publishing" | "success" | "failed";
  message: string;
}

const renderStatusMark = (status: PublishResult["status"]) => {
  if (status === "success") return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (status === "failed") return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><line x1="4" y1="4" x2="11" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><line x1="11" y1="4" x2="4" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
  if (status === "publishing") return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.8" /><path d="M7.5 1.5a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  return null;
};

interface TextImportPlan {
  id: string;
  fileName: string;
  sourceType: string;
  sourceUrl?: string;
  bytes?: ArrayBuffer;
  canChangeEncoding: boolean;
  encoding: string;
  detectedEncoding: string;
  content: string;
  chapters: ImportChapter[];
  mode: "single" | "collection" | "serial";
  groupName: string;
  groupDescription: string;
  groupTags: string[];
}

interface ParsedFileResult {
  works: ParsedWork[];
  textPlan?: TextImportPlan;
}

interface ProviderStatus {
  configured: boolean;
  connected: boolean;
  workspaceName?: string | null;
}

interface ImportStatus {
  notion: ProviderStatus;
  feishu: ProviderStatus;
}

function getExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() || "";
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "未命名作品";
}

function countWords(content: string) {
  return content.replace(/\s/g, "").length;
}

function normalizeContent(content: string) {
  return content.replace(/\r\n?/g, "\n").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

const TEXT_ENCODINGS = ["utf-8", "gb18030", "big5", "utf-16le", "utf-16be"] as const;
const SOURCE_TABS = [
  ["local", "本地文档", "DOCX / TXT / MD / HTML / EPUB"],
  ["notion", "Notion", "官方授权导入"],
  ["feishu", "飞书", "官方授权导入"],
  ["export", "其他在线文档", "先导出，再导入"],
] as const;
type SourceTabKey = (typeof SOURCE_TABS)[number][0];

function EncodingSelect({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (encoding: string) => void }) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 220, maxHeight: 240 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 220);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openAbove = spaceBelow < 220 && rect.top > spaceBelow;
    const availableHeight = Math.max(120, openAbove ? rect.top - 14 : spaceBelow);
    const maxHeight = Math.min(240, availableHeight);
    setMenuPosition({
      top: openAbove ? Math.max(8, rect.top - maxHeight - 6) : rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const focusOption = (index: number) => {
    const nextIndex = (index + TEXT_ENCODINGS.length) % TEXT_ENCODINGS.length;
    optionRefs.current[nextIndex]?.focus();
  };

  const openAndFocusSelected = () => {
    if (disabled) return;
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(Math.max(0, TEXT_ENCODINGS.indexOf(value as (typeof TEXT_ENCODINGS)[number]))));
  };

  return <div className={styles.encodingSelect} ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className={styles.encodingTrigger}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={menuId}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openAndFocusSelected();
        }
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <span>{value.toUpperCase()}</span>
      <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} aria-hidden="true" />
    </button>
    {open && typeof document !== "undefined" && createPortal(<div ref={menuRef} id={menuId} className={styles.encodingMenu} role="listbox" aria-label="文字编码" style={menuPosition}>
      {TEXT_ENCODINGS.map((encoding, index) => <button
        key={encoding}
        ref={(element) => { optionRefs.current[index] = element; }}
        type="button"
        role="option"
        aria-selected={encoding === value}
        className={encoding === value ? styles.encodingOptionSelected : ""}
        onClick={() => { onChange(encoding); setOpen(false); triggerRef.current?.focus(); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); focusOption(index + 1); }
          if (event.key === "ArrowUp") { event.preventDefault(); focusOption(index - 1); }
          if (event.key === "Home") { event.preventDefault(); focusOption(0); }
          if (event.key === "End") { event.preventDefault(); focusOption(TEXT_ENCODINGS.length - 1); }
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
        }}
      >
        <span>{encoding.toUpperCase()}</span>
        {encoding === value && <i className="fa-solid fa-check" aria-hidden="true" />}
      </button>)}
    </div>, document.body)}
  </div>;
}

function decodeText(bytes: ArrayBuffer, encoding: string) {
  return new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, "");
}

function textDecodeScore(value: string, encoding: string) {
  const replacement = (value.match(/\uFFFD/g) || []).length;
  const controls = (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  const cjk = (value.match(/[\u3400-\u9FFF]/g) || []).length;
  const mojibake = (value.match(/(?:Ã.|Â.|锟斤拷)/g) || []).length;
  const preference = encoding === "utf-8" ? 4 : encoding === "gb18030" ? 2 : 0;
  return cjk * 0.15 + preference - replacement * 80 - controls * 30 - mojibake * 12;
}

function detectTextEncoding(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  if (data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) return "utf-8";
  if (data[0] === 0xFF && data[1] === 0xFE) return "utf-16le";
  if (data[0] === 0xFE && data[1] === 0xFF) return "utf-16be";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return TEXT_ENCODINGS
      .filter((encoding) => !encoding.startsWith("utf-16"))
      .map((encoding) => ({ encoding, score: textDecodeScore(decodeText(bytes, encoding), encoding) }))
      .sort((a, b) => b.score - a.score)[0]?.encoding || "gb18030";
  }
}

function htmlToMarkdown(html: string) {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  documentNode.querySelectorAll("script,style,noscript,iframe,form,button,input").forEach((node) => node.remove());

  const renderNode = (node: Node, inPre = false): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const content = Array.from(element.childNodes).map((child) => renderNode(child, inPre || tag === "pre")).join("");
    if (tag === "br") return "\n";
    if (["strong", "b"].includes(tag)) return `**${content}**`;
    if (["em", "i"].includes(tag)) return `*${content}*`;
    if (["s", "del"].includes(tag)) return `~~${content}~~`;
    if (tag === "code" && !inPre) return `\`${content}\``;
    if (tag === "a") return `[${content}](${element.getAttribute("href") || ""})`;
    if (tag === "blockquote") return `${content.split("\n").map((line) => line ? `> ${line}` : "> ").join("\n")}\n\n`;
    if (tag === "pre") return `\n\`\`\`\n${element.textContent || ""}\n\`\`\`\n`;
    if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${content.trim()}\n\n`;
    if (tag === "li") return content.trim();
    if (["ul", "ol"].includes(tag)) {
      const ordered = tag === "ol";
      return `${Array.from(element.children).map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${renderNode(item).trim()}`).join("\n")}\n\n`;
    }
    if (["p", "div", "section", "article"].includes(tag)) return `${content.trim()}\n\n`;
    return content;
  };

  return normalizeContent(renderNode(documentNode.body));
}

async function hashContent(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeParsedWork(input: Omit<ParsedWork, "id" | "sourceHash" | "wordCount" | "selected" | "tags">): Promise<ParsedWork> {
  const content = normalizeContent(input.content);
  if (!content) throw new Error(`${input.sourceName} 没有可导入的正文`);
  return {
    ...input,
    id: crypto.randomUUID(),
    content,
    sourceHash: await hashContent(`${input.title}\n${content}`),
    wordCount: countWords(content),
    selected: true,
    tags: [],
  };
}

function resolveZipPath(baseFile: string, href: string) {
  const base = baseFile.split("/").slice(0, -1);
  const parts = [...base, ...decodeURIComponent(href.split("#")[0]).split("/")];
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

async function parseEpub(file: File): Promise<ParsedWork[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error(`${file.name} 不是有效的 EPUB 文件`);
  const container = new DOMParser().parseFromString(await containerFile.async("string"), "application/xml");
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error(`${file.name} 缺少 EPUB 内容目录`);
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`${file.name} 的 EPUB 内容目录无法读取`);
  const opf = new DOMParser().parseFromString(await opfFile.async("string"), "application/xml");
  const bookTitle = opf.querySelector("metadata title")?.textContent?.trim() || titleFromFileName(file.name);
  const manifest = new Map<string, string>();
  opf.querySelectorAll("manifest item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") || "";
    if (id && href && /xhtml|html/.test(mediaType)) manifest.set(id, resolveZipPath(opfPath, href));
  });
  const chapterPaths = Array.from(opf.querySelectorAll("spine itemref"))
    .map((item) => manifest.get(item.getAttribute("idref") || ""))
    .filter((value): value is string => Boolean(value));
  const chapters: ParsedWork[] = [];
  for (const [index, path] of chapterPaths.entries()) {
    const chapterFile = zip.file(path);
    if (!chapterFile) continue;
    const html = await chapterFile.async("string");
    const documentNode = new DOMParser().parseFromString(html, "text/html");
    const heading = documentNode.querySelector("h1,h2,h3")?.textContent?.trim();
    const pageTitle = documentNode.querySelector("title")?.textContent?.trim();
    const title = heading || pageTitle || (chapterPaths.length === 1 ? bookTitle : `${bookTitle} · 第${index + 1}章`);
    const content = htmlToMarkdown(html);
    if (!content) continue;
    chapters.push(await makeParsedWork({
      title,
      content,
      sourceName: `${file.name} · ${title}`,
      sourceType: "epub",
      warning: "EPUB 已按阅读顺序拆分；图片、脚注跳转和复杂样式不会导入，请检查正文。",
    }));
  }
  if (chapters.length === 0) throw new Error(`${file.name} 没有识别到可导入的章节`);
  return chapters;
}

async function buildTextWorks(plan: TextImportPlan): Promise<ParsedWork[]> {
  const sourceLabel = plan.canChangeEncoding ? "TXT" : "在线文档";
  const common = {
    sourceType: plan.sourceType,
    sourceUrl: plan.sourceUrl,
    sourceBatchId: plan.id,
    sourcePlanId: plan.id,
    detectedEncoding: plan.canChangeEncoding ? plan.encoding : undefined,
    groupDescription: plan.groupDescription,
    groupTags: plan.groupTags,
  };
  if (plan.mode === "single" || plan.chapters.length < 2) {
    return [await makeParsedWork({
      ...common,
      title: titleFromFileName(plan.fileName),
      content: plan.content,
      sourceName: plan.fileName,
      groupMode: "single",
      warning: plan.chapters.length >= 2
        ? `检测到 ${plan.chapters.length} 个章节标题，目前选择保持整篇。`
        : `没有识别到至少两个常见章节标题；这份${sourceLabel}将保持整篇，你仍可在下方检查并编辑正文。`,
    })];
  }

  return Promise.all(plan.chapters.map((chapter, index) => makeParsedWork({
    ...common,
    title: chapter.title,
    content: chapter.content,
    sourceName: `${plan.fileName} · ${chapter.title}`,
    groupMode: plan.mode,
    groupName: plan.groupName.trim() || titleFromFileName(plan.fileName),
    chapterNumber: plan.mode === "serial" ? (chapter.number || index + 1) : undefined,
    chapterTitle: plan.mode === "serial" ? chapter.title : undefined,
    warning: `已从同一份${sourceLabel}中拆出第 ${index + 1}/${plan.chapters.length} 部分，并保留“${plan.groupName.trim() || titleFromFileName(plan.fileName)}”分组关系。`,
  })));
}

async function parseTextFile(file: File): Promise<ParsedFileResult> {
  const bytes = await file.arrayBuffer();
  const detectedEncoding = detectTextEncoding(bytes);
  const content = normalizeContent(decodeText(bytes, detectedEncoding));
  const chapters = splitImportChapters(content);
  const plan: TextImportPlan = {
    id: crypto.randomUUID(),
    fileName: file.name,
    sourceType: getExtension(file.name),
    bytes,
    canChangeEncoding: true,
    encoding: detectedEncoding,
    detectedEncoding,
    content,
    chapters,
    mode: chapters.length >= 2 ? "serial" : "single",
    groupName: titleFromFileName(file.name),
    groupDescription: "",
    groupTags: [],
  };
  return { works: await buildTextWorks(plan), textPlan: plan };
}

async function parseFile(file: File): Promise<ParsedFileResult> {
  const extension = getExtension(file.name);
  let content = "";
  let warning: string | undefined;

  if (extension === "txt" || extension === "text") return parseTextFile(file);
  if (extension === "epub") return { works: await parseEpub(file) };
  if (extension === "docx") {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    content = result.value;
    warning = "Word 仅提取正文；复杂排版、批注、修订历史、文档元数据和图片不会导入。";
  } else {
    const raw = await file.text();
    if (extension === "html" || extension === "htm") content = htmlToMarkdown(raw);
    else content = normalizeContent(raw);
  }

  const title = titleFromFileName(file.name);
  return { works: [await makeParsedWork({
    title,
    content,
    sourceName: file.name,
    sourceType: extension,
    warning,
  })] };
}

function TagEditor({ tags = [], onChange, disabled = false }: { tags?: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");
  const addTag = () => {
    const nextTags = value.split(/[\s,，]+/).map((tag) => tag.trim()).filter(Boolean);
    if (nextTags.length === 0) return;
    onChange(Array.from(new Set([...tags, ...nextTags])).slice(0, 10));
    setValue("");
  };
  return (
    <div className={styles.tagEditor}>
      <div className={styles.tagList}>
        {tags.map((tag) => (
          <span className={styles.tag} key={tag}>{tag}<button type="button" disabled={disabled} aria-label={`删除标签 ${tag}`} onClick={() => onChange(tags.filter((item) => item !== tag))}>×</button></span>
        ))}
      </div>
      <div className={styles.tagInputRow}>
        <input value={value} disabled={disabled} placeholder="多个标签可用逗号或空格隔开" onChange={(event) => setValue(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} />
        <button type="button" disabled={disabled} onClick={addTag}>添加</button>
      </div>
    </div>
  );
}

function SchedulePicker({ disabled, onChange }: { disabled?: boolean; onChange: (value: string) => void }) {
  const [value, setValue] = useState("");
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [scheduleTime, setScheduleTime] = useState("20:00");

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
  const scheduleSelectedDate = value ? value.slice(0, 10) : "";
  const scheduleHour = scheduleTime.split(":")[0] || "20";
  const scheduleMinute = scheduleTime.split(":")[1] || "00";
  const scheduleDisplayValue = value
    ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
    : "选择公开日期";

  const openDatePicker = () => { setSchedulePickerOpen(!schedulePickerOpen); setTimePickerOpen(false); };
  const openTimePicker = () => { setTimePickerOpen(!timePickerOpen); setSchedulePickerOpen(false); };
  const changeValue = (nextValue: string) => { setValue(nextValue); onChange(nextValue); };

  return (
    <div className={styles.schedulePickerFields}>
      <div className={styles.schedulePickerField}>
        <span className={styles.schedulePickerLabel}>公开日期</span>
        <button type="button" className={`${styles.schedulePickerTrigger} ${value ? styles.schedulePickerSelected : ""}`} disabled={disabled} onClick={openDatePicker} aria-expanded={schedulePickerOpen}>
          <span><i className="fa-regular fa-calendar-days" aria-hidden="true" /> {scheduleDisplayValue}</span>
          <i className={`fa-solid fa-chevron-down ${schedulePickerOpen ? styles.schedulePickerChevronUp : ""}`} aria-hidden="true" />
        </button>
        {schedulePickerOpen && (
          <div className={styles.scheduleCalendarPopover} role="dialog" aria-label="选择公开日期">
            <div className={styles.scheduleCalendarHeader}>
              <button type="button" aria-label="上个月" disabled={scheduleMonth <= currentCalendarMonth} onClick={() => {
                const previous = new Date(calendarYear, calendarMonthIndex - 1, 1);
                setScheduleMonth(`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`);
              }}><i className="fa-solid fa-chevron-left" aria-hidden="true" /></button>
              <strong>{calendarYear} 年 {calendarMonthIndex + 1} 月</strong>
              <button type="button" aria-label="下个月" onClick={() => {
                const next = new Date(calendarYear, calendarMonthIndex + 1, 1);
                setScheduleMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
              }}><i className="fa-solid fa-chevron-right" aria-hidden="true" /></button>
            </div>
            <div className={styles.scheduleCalendarWeekdays}>{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className={styles.scheduleCalendarGrid}>
              {calendarDays.map((day, index) => {
                if (!day) return <span key={`empty-${index}`} />;
                const dayValue = `${scheduleMonth}-${String(day).padStart(2, "0")}`;
                const isSelected = scheduleSelectedDate === dayValue;
                const isToday = todayLocalValue === dayValue;
                const isPast = dayValue < todayLocalValue;
                return (
                  <button type="button" key={dayValue} disabled={isPast} className={`${isSelected ? styles.scheduleDaySelected : ""} ${isToday ? styles.scheduleDayToday : ""} ${isPast ? styles.scheduleDayPast : ""}`} onClick={() => { if (isPast) return; changeValue(`${dayValue}T${scheduleTime}`); setSchedulePickerOpen(false); }}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className={styles.schedulePickerField}>
        <span className={styles.schedulePickerLabel}>公开时间</span>
        <button type="button" className={`${styles.schedulePickerTrigger} ${timePickerOpen ? styles.schedulePickerOpen : ""}`} disabled={disabled} onClick={openTimePicker} aria-expanded={timePickerOpen}>
          <span><i className="fa-regular fa-clock" aria-hidden="true" /> {scheduleTime}</span>
          <i className={`fa-solid fa-chevron-down ${timePickerOpen ? styles.schedulePickerChevronUp : ""}`} aria-hidden="true" />
        </button>
        {timePickerOpen && (
          <div className={styles.scheduleTimePopover} role="dialog" aria-label="选择公开时间">
            <span className={styles.scheduleTimePopoverTitle}>选择小时和分钟</span>
            <div className={styles.scheduleTimeColumns}>
              <div className={styles.scheduleTimeColumn}>
                <span>小时</span>
                <div className={styles.scheduleTimeOptions}>
                  {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((hour) => (
                    <button type="button" key={hour} className={scheduleHour === hour ? styles.scheduleTimeOptionSelected : ""} onClick={() => { const nextTime = `${hour}:${scheduleMinute}`; setScheduleTime(nextTime); if (scheduleSelectedDate) changeValue(`${scheduleSelectedDate}T${nextTime}`); }}>{hour}</button>
                  ))}
                </div>
              </div>
              <div className={styles.scheduleTimeColumn}>
                <span>分钟</span>
                <div className={styles.scheduleTimeOptions}>
                  {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => (
                    <button type="button" key={minute} className={scheduleMinute === minute ? styles.scheduleTimeOptionSelected : ""} onClick={() => { const nextTime = `${scheduleHour}:${minute}`; setScheduleTime(nextTime); if (scheduleSelectedDate) changeValue(`${scheduleSelectedDate}T${nextTime}`); setTimePickerOpen(false); }}>{minute}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImportWorkspace() {
  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleValueRef = useRef("");
  const sourceTabRefs = useRef<Record<SourceTabKey, HTMLButtonElement | null>>({
    local: null,
    notion: null,
    feishu: null,
    export: null,
  });
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [parsedWorks, setParsedWorks] = useState<ParsedWork[]>([]);
  const [textPlans, setTextPlans] = useState<TextImportPlan[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [copyrightConfirmed, setCopyrightConfirmed] = useState(false);
  const [publishMode, setPublishMode] = useState<"publish" | "draft" | "schedule">("publish");
  const [publishResults, setPublishResults] = useState<PublishResult[]>([]);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishComplete, setPublishComplete] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTabKey>("local");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [providerStatus, setProviderStatus] = useState<ImportStatus>({
    notion: { configured: false, connected: false },
    feishu: { configured: false, connected: false },
  });

  const refreshProviderStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/import/status", { cache: "no-store" });
      if (response.ok) setProviderStatus(await response.json() as ImportStatus);
    } catch {
      // 本地文件导入不依赖在线平台状态，状态读取失败时保持未连接即可。
    }
  }, []);

  const handleSourceTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = SOURCE_TABS.findIndex(([key]) => sourceTabRefs.current[key] === document.activeElement);
    const activeIndex = focusedIndex >= 0 ? focusedIndex : SOURCE_TABS.findIndex(([key]) => key === sourceTab);
    let nextIndex = activeIndex;
    if (event.key === "ArrowRight") nextIndex = (activeIndex + 1) % SOURCE_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (activeIndex - 1 + SOURCE_TABS.length) % SOURCE_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = SOURCE_TABS.length - 1;
    else return;
    event.preventDefault();
    sourceTabRefs.current[SOURCE_TABS[nextIndex][0]]?.focus();
  };

  useEffect(() => {
    // OAuth 状态只能在浏览器挂载后从同源接口读取。
    void refreshProviderStatus();
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthError = params.get("oauthError");
    if (connected === "notion" || connected === "feishu") {
      setSourceTab(connected);
      setNotice(`${connected === "notion" ? "Notion" : "飞书"} 已连接，现在可以粘贴文档链接并读取。`);
      window.history.replaceState({}, "", "/studio/import");
      void refreshProviderStatus();
    } else if (oauthError) {
      const providerName = oauthError.startsWith("notion") ? "Notion" : "飞书";
      setError(oauthError.endsWith("not_configured") ? `${providerName} 导入暂时不可用，请稍后再试。` : `${providerName} 授权失败或已取消，请重试。`);
      window.history.replaceState({}, "", "/studio/import");
    }
  }, [refreshProviderStatus]);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    setError("");
    setNotice("");
    if (files.length === 0) return;
    if (files.length > MAX_FILE_COUNT) { setError(`一次最多导入 ${MAX_FILE_COUNT} 个文件`); return; }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) { setError("本次文件总大小不能超过 100MB"); return; }
    const invalid = files.find((file) => !ACCEPTED_EXTENSIONS.has(getExtension(file.name)));
    if (invalid) { setError(`${invalid.name} 格式不支持`); return; }
    const oversized = files.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) { setError(`${oversized.name} 超过 20MB`); return; }

    setBusy(true);
    const nextWorks: ParsedWork[] = [];
    const nextTextPlans: TextImportPlan[] = [];
    const failures: string[] = [];
    for (const file of files) {
      try {
        const parsed = await parseFile(file);
        const sourceBatchId = parsed.textPlan?.id || crypto.randomUUID();
        nextWorks.push(...parsed.works.map((work) => ({ ...work, sourceBatchId })));
        if (parsed.textPlan) nextTextPlans.push(parsed.textPlan);
      }
      catch (parseError) { failures.push(parseError instanceof Error ? parseError.message : `${file.name} 解析失败`); }
    }
    const existingHashes = new Set(parsedWorks.map((work) => work.sourceHash));
    const uniqueWorks = nextWorks.filter((work) => {
      if (existingHashes.has(work.sourceHash)) return false;
      existingHashes.add(work.sourceHash);
      return true;
    });
    const includedPlanIds = new Set(uniqueWorks.map((work) => work.sourcePlanId).filter(Boolean));
    setParsedWorks((works) => [...works, ...uniqueWorks]);
    setTextPlans((plans) => [...plans, ...nextTextPlans.filter((plan) => includedPlanIds.has(plan.id))]);
    if (failures.length > 0) setError(failures.join("；"));
    setPublishResults([]);
    setPublishProgress(0);
    setPublishComplete(false);
    if (uniqueWorks.length > 0) setNotice(`本次新增 ${uniqueWorks.length} 篇内容；你可以继续使用其他方式导入，完成后再进入下一步。`);
    else if (nextWorks.length > 0) setNotice("这些内容已经在当前导入批次中，未重复添加。");
    setBusy(false);
  };

  const updateTextPlan = async (planId: string, changes: Partial<Pick<TextImportPlan, "encoding" | "mode" | "groupName">>) => {
    const current = textPlans.find((plan) => plan.id === planId);
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const encoding = changes.encoding || current.encoding;
      const content = changes.encoding && current.bytes ? normalizeContent(decodeText(current.bytes, encoding)) : current.content;
      const chapters = changes.encoding ? splitImportChapters(content) : current.chapters;
      const mode = changes.mode || (chapters.length >= 2 ? current.mode : "single");
      const nextPlan: TextImportPlan = { ...current, ...changes, encoding, content, chapters, mode };
      const works = await buildTextWorks(nextPlan);
      setTextPlans((plans) => plans.map((plan) => plan.id === planId ? nextPlan : plan));
      setParsedWorks((items) => [
        ...items.filter((work) => work.sourcePlanId !== planId),
        ...works,
      ]);
      setNotice(changes.encoding
        ? `已按 ${encoding.toUpperCase()} 重新读取“${current.fileName}”，识别到 ${chapters.length} 个章节。`
        : `已更新“${current.fileName}”的拆分方式，共生成 ${works.length} 篇内容。`);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "重新检测和拆分内容失败");
    } finally {
      setBusy(false);
    }
  };

  const connectProvider = (provider: "notion" | "feishu") => {
    setError("");
    if (!providerStatus[provider].configured) {
      setError(`${provider === "notion" ? "Notion" : "飞书"} 导入暂时不可用，请稍后再试。`);
      return;
    }
    const popup = window.open(`/api/import/${provider}/start`, `inkland-${provider}-oauth`, "popup,width=620,height=760");
    if (!popup) {
      // 部分内置浏览器会无条件拦截弹窗；改用当前页面授权，回调后仍能恢复文档链接。
      window.location.assign(`/api/import/${provider}/start`);
      return;
    }
    setNotice(`请在新窗口完成${provider === "notion" ? " Notion" : "飞书"}授权；当前导入批次会保留。`);
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/import/status", { cache: "no-store" });
        if (response.ok) {
          const status = await response.json() as ImportStatus;
          setProviderStatus(status);
          if (status[provider].connected) {
            window.clearInterval(timer);
            popup.close();
            setNotice(`${provider === "notion" ? "Notion" : "飞书"} 已连接，可以读取文档并继续加入当前批次。`);
            return;
          }
        }
      } catch {
        // 授权窗口仍在进行时继续轮询；超时或窗口关闭后会停止。
      }
      if (popup.closed || Date.now() - startedAt > 120_000) {
        window.clearInterval(timer);
        if (!providerStatus[provider].connected) setNotice("授权窗口已关闭；如未连接成功，可以重新尝试。");
      }
    }, 1000);
  };

  const readOnlineDocument = async (provider: "notion" | "feishu") => {
    if (!onlineUrl.trim()) { setError("请先粘贴文档链接"); return; }
    if (!providerStatus[provider].connected) { setError(`请先连接并授权${provider === "notion" ? " Notion" : "飞书"}`); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/import/${provider}/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: onlineUrl.trim() }),
      });
      const payload = await response.json() as { title?: string; content?: string; sourceName?: string; sourceType?: string; sourceUrl?: string; error?: string };
      if (!response.ok || !payload.title || !payload.content) throw new Error(payload.error || "在线文档读取失败");
      const sourceUrl = payload.sourceUrl || onlineUrl.trim();
      const normalizedTitle = payload.title.trim();
      const contentLines = normalizeContent(payload.content).split("\n");
      if (cleanImportHeading(contentLines[0] || "") === normalizedTitle) contentLines.shift();
      const content = normalizeContent(contentLines.join("\n"));
      if (textPlans.some((plan) => plan.sourceUrl === sourceUrl || (plan.sourceType === provider && plan.content === content))) {
        setNotice("这篇在线文档已经在当前导入批次中，未重复添加。");
        return;
      }
      const chapters = splitImportChapters(content);
      const plan: TextImportPlan = {
        id: crypto.randomUUID(),
        fileName: normalizedTitle,
        sourceType: payload.sourceType || provider,
        sourceUrl,
        canChangeEncoding: false,
        encoding: "utf-8",
        detectedEncoding: "utf-8",
        content,
        chapters,
        mode: chapters.length >= 2 ? "serial" : "single",
        groupName: normalizedTitle,
        groupDescription: "",
        groupTags: [],
      };
      const works = await buildTextWorks(plan);
      setTextPlans((plans) => [...plans, plan]);
      setParsedWorks((items) => [...items, ...works]);
      setPublishResults([]);
      setPublishProgress(0);
      setPublishComplete(false);
      setNotice(chapters.length >= 2
        ? "文档已加入当前导入批次；章节检测和拆分方式将在第二步确认。"
        : "文档已加入当前导入批次；你可以继续选择其他导入方式，完成后再进入下一步。");
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "在线文档读取失败");
    } finally {
      setBusy(false);
    }
  };

  const disconnectProvider = async (provider: "notion" | "feishu") => {
    await fetch("/api/import/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    await refreshProviderStatus();
    setNotice(`${provider === "notion" ? "Notion" : "飞书"} 已断开。`);
  };

  const saveTagsForPost = async (postId: string, tagNames: string[]) => {
    for (const tagName of tagNames) {
      const { data: existing, error: lookupError } = await supabase.from("tags").select("id").eq("name", tagName).maybeSingle();
      if (lookupError) throw lookupError;
      let tagId = existing?.id as string | undefined;
      if (!tagId) {
        const { data: created, error: createError } = await supabase.from("tags").insert({ name: tagName, type: "fandom", post_count: 0 }).select("id").single();
        if (createError) {
          const { data: racedTag } = await supabase.from("tags").select("id").eq("name", tagName).maybeSingle();
          tagId = racedTag?.id as string | undefined;
          if (!tagId) throw createError;
        } else tagId = created?.id as string | undefined;
      }
      if (!tagId) throw new Error(`标签“${tagName}”保存失败`);
      const { error: linkError } = await supabase.from("post_tags").insert({ post_id: postId, tag_id: tagId });
      if (linkError) throw linkError;
      await supabase.from("user_tag_usage").upsert(
        { user_id: user!.id, tag_id: tagId, last_used_at: new Date().toISOString() },
        { onConflict: "user_id,tag_id" },
      );
    }
  };

  const ensureImportGroup = async (work: ParsedWork) => {
    if (!work.groupName || work.groupMode === "single" || !work.groupMode) return;
    const { data: existing, error: findError } = await supabase
      .from("series")
      .select("id")
      .eq("user_id", user!.id)
      .eq("name", work.groupName)
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;
    if (existing?.id) {
      const { error: updateError } = await supabase.from("series").update({
        description: work.groupDescription?.trim() || "",
        ...(work.groupMode === "serial" ? { tags: work.groupTags || [] } : {}),
      }).eq("id", existing.id).eq("user_id", user!.id);
      if (updateError) throw updateError;
      return;
    }
    const { error: createError } = await supabase.from("series").insert({
      user_id: user!.id,
      name: work.groupName,
      description: work.groupDescription?.trim() || "",
      tags: work.groupMode === "serial" ? (work.groupTags || []) : [],
      status: "ongoing",
      series_type: "original",
    });
    if (createError) throw createError;
  };

  const updateGroupInformation = (planId: string, changes: Partial<Pick<TextImportPlan, "groupName" | "groupDescription" | "groupTags">>) => {
    setTextPlans((plans) => plans.map((plan) => plan.id === planId ? { ...plan, ...changes } : plan));
    setParsedWorks((works) => works.map((work) => work.sourcePlanId === planId ? {
      ...work,
      ...(changes.groupName !== undefined ? { groupName: changes.groupName } : {}),
      ...(changes.groupDescription !== undefined ? { groupDescription: changes.groupDescription } : {}),
      ...(changes.groupTags !== undefined ? { groupTags: changes.groupTags } : {}),
    } : work));
  };

  const validateEditingInformation = (items: ParsedWork[]) => {
    const grouped = new Map<string, ParsedWork>();
    items.filter((work) => work.groupMode === "serial" || work.groupMode === "collection").forEach((work) => grouped.set(work.sourcePlanId || work.groupName || work.id, work));
    for (const work of grouped.values()) {
      const label = work.groupMode === "serial" ? "长篇连载" : "合集";
      if (!work.groupName?.trim()) return `请填写${label}标题`;
      if (work.groupMode === "serial" && work.groupName.trim().length > 20) return "长篇连载标题不能超过20个字";
      if (!work.groupDescription?.trim()) return `请填写${label}简介`;
      if (work.groupDescription.trim().length > 500) return `${label}简介不能超过500个字`;
      if (work.groupMode === "serial" && (!work.groupTags || work.groupTags.length === 0)) return "请给长篇连载本身添加至少1个标签";
    }
    const missingWorkTags = items.filter((work) => work.groupMode !== "serial" && work.tags.length === 0);
    if (missingWorkTags.length > 0) return `还有 ${missingWorkTags.length} 篇单篇没有标签，请先补齐标签`;
    return null;
  };

  const applyBulkTags = () => {
    const tags = bulkTag.split(/[\s,，]+/).map((tag) => tag.trim()).filter(Boolean);
    if (tags.length === 0) { setError("请输入要批量添加的标签"); return; }
    const selected = parsedWorks.filter((work) => work.selected && work.groupMode !== "serial");
    if (selected.length === 0) { setError("请先选择要添加标签的作品"); return; }
    setParsedWorks((current) => current.map((work) => work.selected && work.groupMode !== "serial"
      ? { ...work, tags: Array.from(new Set([...work.tags, ...tags])).slice(0, 10) }
      : work));
    setBulkTag("");
  };

  const resetImport = () => {
    setCurrentStep(1);
    setParsedWorks([]);
    setTextPlans([]);
    setBulkTag("");
    setCopyrightConfirmed(false);
    setPublishMode("publish");
    scheduleValueRef.current = "";
    setPublishResults([]);
    setPublishProgress(0);
    setPublishComplete(false);
    setError("");
    setNotice("");
  };

  const removeImportedSource = (sourceBatchId: string | undefined, workId: string) => {
    if (sourceBatchId) {
      setParsedWorks((works) => works.filter((work) => work.sourceBatchId !== sourceBatchId));
      setTextPlans((plans) => plans.filter((plan) => plan.id !== sourceBatchId));
    } else {
      setParsedWorks((works) => works.filter((work) => work.id !== workId));
    }
  };

  const continueFromImport = () => {
    if (parsedWorks.length === 0) { setError("请先导入至少一份作品"); return; }
    setError("");
    setNotice("");
    setCurrentStep(2);
  };

  const continueFromConfirm = () => {
    const selected = parsedWorks.filter((work) => work.selected);
    if (selected.length === 0) { setError("请至少选择一篇作品"); return; }
    if (selected.some((work) => !work.title.trim() || !work.content.trim())) { setError("标题和正文不能为空"); return; }
    setError("");
    setNotice("");
    setCurrentStep(3);
  };

  const continueFromTags = () => {
    const selected = parsedWorks.filter((work) => work.selected);
    const validationError = validateEditingInformation(selected);
    if (validationError) { setError(validationError); return; }
    setError("");
    setNotice("");
    setCurrentStep(4);
  };

  const publishSelectedWorks = async () => {
    if (busy || publishComplete) return;
    if (!user) { setError("请先登录"); return; }
    const items = parsedWorks.filter((work) => work.selected);
    if (items.length === 0) { setError("请至少选择一篇作品"); return; }
    if (items.some((work) => !work.title.trim() || !work.content.trim())) { setError("标题和正文不能为空"); return; }
    const validationError = validateEditingInformation(items);
    if (validationError) { setError(validationError); return; }
    if (!copyrightConfirmed) { setError("请先确认你拥有所选内容的发布权"); return; }

    let scheduledAt: string | null = null;
    if (publishMode === "schedule") {
      const scheduleValue = scheduleValueRef.current;
      if (!scheduleValue) { setError("请先选择定时发布时间"); return; }
      const scheduledDate = new Date(scheduleValue);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) { setError("定时发布时间必须晚于当前时间"); return; }
      scheduledAt = scheduledDate.toISOString();
    }
    setBusy(true);
    if (publishMode !== "draft") {
      const blocked = await assertCanPublish();
      if (blocked) { setError(blocked); setBusy(false); return; }
    }

    setError("");
    setNotice("");
    setPublishComplete(false);
    setPublishProgress(0);
    setPublishResults(items.map((work) => ({ workId: work.id, title: work.title, status: "waiting", message: "等待处理" })));
    setCurrentStep(5);

    let successCount = 0;
    const ensuredGroups = new Set<string>();
    for (const [index, work] of items.entries()) {
      setPublishResults((results) => results.map((result) => result.workId === work.id ? { ...result, status: "publishing", message: "正在写入作品和标签" } : result));
      try {
        const groupKey = work.groupMode !== "single" && work.groupName ? `${work.groupMode}:${work.groupName}` : "";
        if (groupKey && !ensuredGroups.has(groupKey)) {
          await ensureImportGroup(work);
          ensuredGroups.add(groupKey);
        }
        const isSerial = work.groupMode === "serial";
        const postData: Record<string, unknown> = {
          user_id: user.id,
          title: work.title.trim(),
          content: work.content.trim(),
          word_count: countWords(work.content),
          status: publishMode === "publish" && isSerial ? "published" : "draft",
          review_status: publishMode === "draft" ? "approved" : "pending",
          published_at: publishMode === "draft" ? null : (scheduledAt || new Date().toISOString()),
          post_type: isSerial ? "serial" : "novel",
          visibility: "public",
        };
        if (work.groupName && work.groupMode !== "single") postData.series_name = work.groupName;
        if (isSerial) {
          postData.chapter_number = work.chapterNumber || 1;
          postData.chapter_title = work.chapterTitle || work.title.trim();
        }
        const { data: post, error: postError } = await supabase.from("posts").insert(postData).select("id, review_status, status").single();
        if (postError || !post?.id) throw postError || new Error("作品创建失败");
        try {
          if (!isSerial) await saveTagsForPost(post.id as string, work.tags);
        }
        catch (tagError) {
          await supabase.from("posts").delete().eq("id", post.id).eq("user_id", user.id);
          throw tagError;
        }
        successCount += 1;
        const successMessage = publishMode === "draft"
          ? "已保存到草稿箱"
          : publishMode === "schedule"
            ? `已提交审核，计划 ${new Date(scheduledAt!).toLocaleString("zh-CN")} 发布`
            : post.review_status === "approved" ? "已公开发布" : "已提交审核，审核通过后公开";
        setPublishResults((results) => results.map((result) => result.workId === work.id ? { ...result, status: "success", message: successMessage } : result));
      } catch (publishError) {
        setPublishResults((results) => results.map((result) => result.workId === work.id ? {
          ...result,
          status: "failed",
          message: publishError instanceof Error ? publishError.message : "处理失败",
        } : result));
      }
      setPublishProgress(Math.round(((index + 1) / items.length) * 100));
    }
    window.dispatchEvent(new Event("inkland:stats-changed"));
    setPublishComplete(true);
    setNotice(successCount === items.length
      ? `${items.length} 篇内容全部处理完成。`
      : `处理完成：成功 ${successCount} 篇，失败 ${items.length - successCount} 篇。`);
    setBusy(false);
  };

  if (authLoading) return <div className={styles.centerState}>正在加载...</div>;
  if (!user) return (
    <div id="page-create" className="min-h-screen bg-paper"><main className={styles.page}><div className={styles.centerState}><h1>批量导入作品</h1><p>登录后才能批量发布作品。</p><Link href="/login" className={styles.primaryButton}>登录</Link></div></main></div>
  );

  const selectedParsedCount = parsedWorks.filter((work) => work.selected).length;
  const selectedWithTagsCount = parsedWorks.filter((work) => work.selected && (work.groupMode === "serial" ? (work.groupTags?.length || 0) > 0 : work.tags.length > 0)).length;
  const publishDoneCount = publishResults.filter((result) => result.status === "success" || result.status === "failed").length;
  const publishSuccessCount = publishResults.filter((result) => result.status === "success").length;
  const publishFailedCount = publishResults.filter((result) => result.status === "failed").length;
  const publishingItem = publishResults.find((result) => result.status === "publishing");
  const activeGroupedPlans = textPlans.filter((plan) => plan.mode !== "single" && parsedWorks.some((work) => work.selected && work.sourcePlanId === plan.id));
  const importQueueEntries = Array.from(parsedWorks.reduce((groups, work) => {
    const key = work.sourceBatchId || work.id;
    const current = groups.get(key);
    if (current) current.works.push(work);
    else groups.set(key, { key, works: [work] });
    return groups;
  }, new Map<string, { key: string; works: ParsedWork[] }>()).values()).map((group) => {
    const first = group.works[0];
    const plan = textPlans.find((item) => item.id === first.sourcePlanId);
    return {
      key: group.key,
      title: plan?.fileName || first.sourceName.split(" · ")[0] || first.title,
      detail: `${first.sourceType.toUpperCase()} · ${group.works.reduce((total, work) => total + work.wordCount, 0).toLocaleString()} 字`,
      sourceBatchId: first.sourceBatchId,
      workId: first.id,
    };
  });

  return (
    <div id="page-create" className="min-h-screen bg-paper">
        <main className={styles.page}>
          <header className={styles.header}>
            <div><h1>批量导入作品</h1><p>汇集不同来源的作品，逐步确认内容和信息，再统一发布。</p></div>
          </header>

          <ol className={styles.steps} aria-label="导入步骤">
            <li aria-current={currentStep === 1 ? "step" : undefined} className={currentStep === 1 ? styles.activeStep : currentStep > 1 ? styles.completedStep : ""}><span>1</span>导入作品</li>
            <li aria-current={currentStep === 2 ? "step" : undefined} className={currentStep === 2 ? styles.activeStep : currentStep > 2 ? styles.completedStep : ""}><span>2</span>确认内容</li>
            <li aria-current={currentStep === 3 ? "step" : undefined} className={currentStep === 3 ? styles.activeStep : currentStep > 3 ? styles.completedStep : ""}><span>3</span>编辑信息</li>
            <li aria-current={currentStep === 4 ? "step" : undefined} className={currentStep === 4 ? styles.activeStep : currentStep > 4 ? styles.completedStep : ""}><span>4</span>确认发布</li>
            <li aria-current={currentStep === 5 ? "step" : undefined} className={currentStep === 5 ? styles.activeStep : ""}><span>5</span>发布结果</li>
          </ol>

          {error && sourceTab !== "notion" && sourceTab !== "feishu" && <div className={styles.errorNotice} role="alert">{error}</div>}
          {notice && parsedWorks.length === 0 && <div className={styles.successNotice} role="status">{notice}</div>}

          <section className={styles.panel}>
              {currentStep === 1 && <>
              <p className={styles.sourceGroupLabel}>导入方法</p>
              <div className={styles.sourceTabs} role="tablist" aria-label="选择导入来源" onKeyDown={handleSourceTabKeyDown}>
                {SOURCE_TABS.map(([key, title, description]) => (
                  <button key={key} id={`source-tab-${key}`} ref={(element) => { sourceTabRefs.current[key] = element; }} type="button" role="tab" aria-selected={sourceTab === key} aria-controls="import-source-panel" className={sourceTab === key ? styles.activeSource : ""} onClick={() => { setSourceTab(key); setOnlineUrl(""); setError(""); setNotice(""); }}>
                    <span><strong>{title}</strong><small>{description}</small></span>
                  </button>
                ))}
              </div>

              <div id="import-source-panel" role="tabpanel" aria-labelledby={`source-tab-${sourceTab}`} className={styles.sourceContentRow}>
              {sourceTab === "local" && <><div
                className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-label="点击上传本地文档"
                aria-disabled={busy}
                onClick={() => { if (!busy) fileInputRef.current?.click(); }}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (!busy && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={(event: DragEvent) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event: DragEvent) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event: DragEvent) => { event.preventDefault(); setDragging(false); void handleFiles(event.dataTransfer.files); }}
              >
                <i className="fa-solid fa-file-arrow-up" aria-hidden="true" />
                <strong className={styles.uploadHint}>点击上传文件</strong>
                <p>支持 DOCX、TXT、Markdown、HTML、EPUB；一次最多50个文件，单个不超过20MB。</p>
                {busy && <span className={styles.uploadBusy}>正在解析...</span>}
              </div><input ref={fileInputRef} type="file" hidden multiple accept=".txt,.text,.md,.markdown,.html,.htm,.docx,.epub,text/plain,text/markdown,text/html,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) void handleFiles(event.target.files); event.target.value = ""; }} /></>}

              {(sourceTab === "notion" || sourceTab === "feishu") && <div className={styles.onlinePanel}>
                <div className={styles.onlineHeading}>
                  <div><span className={styles.panelEyebrow}>在线文档</span><h2>从{sourceTab === "notion" ? " Notion" : "飞书"}导入</h2><p>先连接账号，再粘贴你要导入的文档链接。</p></div>
                  <span className={providerStatus[sourceTab].connected ? styles.connectedBadge : styles.disconnectedBadge}><i className={`fa-solid ${providerStatus[sourceTab].connected ? "fa-circle-check" : "fa-circle"}`} aria-hidden="true" />{providerStatus[sourceTab].connected ? "已连接" : "未连接"}</span>
                </div>
                {!providerStatus[sourceTab].connected ? <div className={styles.connectStage}>
                  <div className={styles.stageIcon}><i className="fa-solid fa-link" aria-hidden="true" /></div>
                  <div><strong>连接你的{sourceTab === "notion" ? " Notion" : "飞书"}账号</strong><p>授权完成后，回到这里粘贴并读取具体文档。</p></div>
                  <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => connectProvider(sourceTab)}>连接并授权</button>
                </div> : <div className={styles.readStage}>
                  <label className={styles.urlField}><span>文档链接</span><input type="url" value={onlineUrl} placeholder={sourceTab === "notion" ? "粘贴 Notion 页面链接" : "粘贴飞书文档或知识库链接"} onChange={(event) => setOnlineUrl(event.target.value)} /></label>
                  <div className={styles.onlineActions}>
                    <button type="button" className={styles.primaryButton} disabled={busy || !onlineUrl.trim()} onClick={() => void readOnlineDocument(sourceTab)}>{busy ? "正在读取..." : "粘贴链接并读取"}</button>
                    <button type="button" className={styles.textButton} onClick={() => void disconnectProvider(sourceTab)}>断开连接</button>
                  </div>
                </div>}
              </div>}

              {error && (sourceTab === "notion" || sourceTab === "feishu") && <div className={`${styles.errorNotice} ${styles.onlineResultNotice}`} role="alert">{error}</div>}

              {sourceTab === "export" && <div className={styles.onlinePanel}>
                <div className={styles.onlineHeading}><div><h2>导出文件后导入</h2><p>适用于石墨、Google 文档、Word Online、WPS、腾讯文档和语雀。</p></div><span className={styles.guideBadge}>DOCX / MD</span></div>
                <p className={styles.shimoSteps}>打开原文档，在“文件”或右上角菜单中选择“下载 / 导出”。优先选择 Word（DOCX）；有 Markdown 选项时也可以选择 MD。下载完成后，点击下方按钮选择文件；可以一次选择多份。</p>
                <button type="button" className={styles.primaryButton} onClick={() => { setSourceTab("local"); setOnlineUrl(""); setNotice("请选择刚刚导出的 DOCX 或 Markdown 文件；可以一次选择多份。"); window.setTimeout(() => fileInputRef.current?.click(), 0); }}>选择导出的文件</button>
              </div>}

              <aside className={styles.privacyBox}>
                <strong>导入隐私说明</strong>
                <ul><li>本地文件仅在浏览器解析，原文件不上传；确认发布、保存草稿或定时发布后，正文和标签才会写入 Inkland。</li><li>不导入批注、修订历史、作者元数据、评论或协作者信息；在线平台只读取你通过官方授权选择的文档，其他平台仅提供导出引导。</li></ul>
              </aside>
              </div>

              {parsedWorks.length > 0 && <div className={styles.importQueue}>
                <div className={styles.sectionHeader}><div><h2>当前队列</h2>{notice && <p className={styles.queueNotice} role="status">{notice}</p>}</div><button type="button" className={styles.textButton} onClick={resetImport}>清空全部</button></div>
                <ul>{importQueueEntries.map((entry) => <li key={entry.key}><div><strong>{entry.title}</strong><span>{entry.detail}</span></div><button type="button" className={styles.textButton} onClick={() => removeImportedSource(entry.sourceBatchId, entry.workId)}>移除作品</button></li>)}</ul>
              </div>}
              <div className={styles.stepActions}><span>已导入 {importQueueEntries.length} 份来源</span><button type="button" className={styles.primaryButton} disabled={busy || parsedWorks.length === 0} onClick={continueFromImport}>下一步</button></div>
              </>}

              {currentStep === 2 && <div className={styles.stepPage}>
                {textPlans.length > 0 && <div className={styles.textPlanList}>{textPlans.map((plan) => <section className={styles.textPlanCard} key={plan.id}>
                    <div className={styles.textPlanHeading}><div><strong>{plan.fileName}</strong><p>{plan.canChangeEncoding ? `当前编码：${plan.encoding.toUpperCase()}；` : `来源：${plan.sourceType.toUpperCase()}；`}{plan.chapters.length >= 2 ? `识别到 ${plan.chapters.length} 个章节标题` : "暂未识别到可拆分的章节"}</p></div>{plan.canChangeEncoding && <div className={styles.encodingField}><span>文字编码</span><EncodingSelect value={plan.encoding} disabled={busy} onChange={(encoding) => void updateTextPlan(plan.id, { encoding })} /></div>}</div>
                    {plan.chapters.length >= 2 ? <fieldset className={styles.splitOptions}><legend>导入类型</legend><label><input type="radio" name={`mode-${plan.id}`} checked={plan.mode === "serial"} onChange={() => void updateTextPlan(plan.id, { mode: "serial" })} />作为一部长篇的 {plan.chapters.length} 个章节</label><label><input type="radio" name={`mode-${plan.id}`} checked={plan.mode === "collection"} onChange={() => void updateTextPlan(plan.id, { mode: "collection" })} />作为一个合集里的 {plan.chapters.length} 篇单篇</label><label><input type="radio" name={`mode-${plan.id}`} checked={plan.mode === "single"} onChange={() => void updateTextPlan(plan.id, { mode: "single" })} />保持为一篇，不拆分</label></fieldset> : <p className={styles.noChaptersHint}>章节标题支持“第一章、序章、番外、尾声、Chapter 1”等常见写法；未识别时会保持整篇。</p>}
                  </section>)}</div>}
                <div className={styles.previewToolbar}><strong>作品内容</strong><label className={styles.selectAllLabel}><input className={styles.selectCheckbox} type="checkbox" checked={selectedParsedCount === parsedWorks.length} disabled={busy} onChange={(event) => setParsedWorks((current) => current.map((work) => ({ ...work, selected: event.target.checked })))} /> 全选</label></div>
                <div className={`${styles.stepScrollArea} ${styles.previewStepScrollArea}`}>
                  <div className={styles.previewList}>{parsedWorks.map((work) => <article key={work.id} className={`${styles.previewCard}${work.selected ? ` ${styles.previewCardSelected}` : ""}`} onClick={() => { if (!busy) { setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, selected: !item.selected } : item)); } }}><div className={styles.previewBody}><div className={styles.previewTitleRow}><span>标题</span><input className={styles.titleInput} value={work.title} disabled={busy} aria-label="作品标题" maxLength={100} onClick={(event) => event.stopPropagation()} onChange={(event) => setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, title: event.target.value } : item))} /><input className={styles.selectCheckbox} type="checkbox" checked={work.selected} disabled={busy} aria-label={`选择 ${work.title}`} onClick={(event) => event.stopPropagation()} onChange={(event) => setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, selected: event.target.checked } : item))} /></div><label className={styles.contentField}><span>正文</span><textarea value={work.content} disabled={busy} aria-label={`${work.title} 正文`} onClick={(event) => event.stopPropagation()} onChange={(event) => setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, content: event.target.value, wordCount: countWords(event.target.value) } : item))} /></label></div></article>)}</div>
                </div>
                <div className={styles.stepActions}><button type="button" onClick={() => { setError(""); setCurrentStep(1); }}>上一步</button><span>已选择 {selectedParsedCount} 篇</span><button type="button" className={styles.primaryButton} disabled={busy} onClick={continueFromConfirm}>下一步</button></div>
              </div>}

              {currentStep === 3 && <div className={styles.stepPage}>
                <div className={styles.sectionHeader}><div><h2>编辑信息</h2><p>长篇标签属于连载本身；合集中的每篇单篇分别添加标签。</p></div><span>已选 {selectedParsedCount} 篇</span></div>
                <div className={styles.stepScrollArea}>
                  {activeGroupedPlans.map((plan) => <section className={styles.groupInfoCard} key={plan.id}><label><span>{plan.mode === "serial" ? "连载标题" : "合集标题"}</span><input value={plan.groupName || ""} maxLength={plan.mode === "serial" ? 20 : 100} onChange={(event) => updateGroupInformation(plan.id, { groupName: event.target.value })} /></label><label><span>{plan.mode === "serial" ? "连载简介" : "合集简介"}</span><textarea value={plan.groupDescription || ""} maxLength={500} placeholder="最多500字" onChange={(event) => updateGroupInformation(plan.id, { groupDescription: event.target.value })} /></label>{plan.mode === "serial" && <div className={styles.tagsSection}><strong>连载标签 <span>这些标签属于整部长篇，不会重复加到章节</span></strong><TagEditor tags={plan.groupTags || []} onChange={(groupTags) => updateGroupInformation(plan.id, { groupTags })} /></div>}</section>)}
                  {parsedWorks.some((work) => work.selected && work.groupMode !== "serial") && <><div className={styles.bulkTagBar}><span>批量添加单篇标签</span><input value={bulkTag} placeholder="逗号或空格隔开；不会添加到长篇章节" onChange={(event) => setBulkTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyBulkTags(); } }} /><button type="button" onClick={applyBulkTags}>添加到所选单篇</button></div><div className={styles.tagWorkList}>{parsedWorks.filter((work) => work.selected && work.groupMode !== "serial").map((work) => <article key={work.id}><div><strong>{work.title}</strong><p>{work.wordCount.toLocaleString()} 字{work.groupMode === "collection" ? " · 合集单篇" : ""}</p></div><div className={styles.tagsSection}><strong>单篇标签 <span>{work.tags.length > 0 ? `已添加 ${work.tags.length} 个` : "至少添加1个"}</span></strong><TagEditor tags={work.tags} onChange={(tags) => setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, tags } : item))} /></div></article>)}</div></>}
                </div>
                <div className={styles.stepActions}><button type="button" onClick={() => { setError(""); setCurrentStep(2); }}>上一步</button><span>{selectedWithTagsCount}/{selectedParsedCount} 篇已满足标签要求</span><button type="button" className={styles.primaryButton} onClick={continueFromTags}>下一步</button></div>
              </div>}

              {currentStep === 4 && <div className={styles.previewSection}>
                <div className={styles.sectionHeader}><div><h2>确认发布</h2><p>本批次共 {selectedParsedCount} 篇内容，请选择最终处理方式。</p></div></div>
                <ul className={styles.publishSummary}>{parsedWorks.filter((work) => work.selected).map((work) => <li key={work.id}><strong>{work.title}</strong><span>{work.groupMode === "serial" ? `${work.groupName} · ${(work.groupTags || []).map((tag) => `#${tag}`).join(" ")}` : work.tags.map((tag) => `#${tag}`).join(" ")}</span></li>)}</ul>
                <section className={styles.publishPanel} aria-label="确认发布">
                  <fieldset className={`${styles.publishModes} collection-options`}>
                    <legend>发布方式</legend>
                    <button type="button" className={`collection-option ${publishMode === "publish" ? "selected" : ""}`} role="radio" aria-checked={publishMode === "publish"} disabled={busy || publishComplete} onClick={() => setPublishMode("publish")}>
                      <span className="collection-option-copy"><span className="collection-option-text"><strong>立即发布</strong></span><span className="collection-option-desc">提交审核，审核通过后公开</span></span>
                    </button>
                    <button type="button" className={`collection-option ${publishMode === "draft" ? "selected" : ""}`} role="radio" aria-checked={publishMode === "draft"} disabled={busy || publishComplete} onClick={() => setPublishMode("draft")}>
                      <span className="collection-option-copy"><span className="collection-option-text"><strong>保存到草稿箱</strong></span><span className="collection-option-desc">稍后在创作中心继续编辑</span></span>
                    </button>
                    <button type="button" className={`collection-option ${publishMode === "schedule" ? "selected" : ""}`} role="radio" aria-checked={publishMode === "schedule"} disabled={busy || publishComplete} onClick={() => setPublishMode("schedule")}>
                      <span className="collection-option-copy"><span className="collection-option-text"><strong>定时发布</strong></span><span className="collection-option-desc">提交审核，通过后按设定时间公开</span></span>
                    </button>
                  </fieldset>
                  {publishMode === "schedule" && <SchedulePicker disabled={busy || publishComplete} onChange={(value) => { scheduleValueRef.current = value; }} />}
                  <label className={styles.copyrightBox}><input type="checkbox" checked={copyrightConfirmed} disabled={busy || publishComplete} onChange={(event) => setCopyrightConfirmed(event.target.checked)} /><span>我确认自己是所选内容的作者，或已取得在 Inkland 发布这些内容的许可。</span></label>
                  <div className={styles.finalActions}>{!publishComplete && <button type="button" disabled={busy} onClick={() => { setError(""); setCurrentStep(3); }}>上一步</button>}<button type="button" className={styles.primaryButton} disabled={busy || publishComplete || selectedParsedCount === 0} onClick={() => void publishSelectedWorks()}>{busy ? "正在处理..." : "下一步"}</button></div>
                </section>
              </div>}

              {currentStep === 5 && <div className={styles.previewSection}>
                <div className={styles.sectionHeader}><div><h2>发布结果</h2><p>正在处理本批次的 {selectedParsedCount} 篇内容，请不要关闭当前页面。</p></div></div>
                <section className={styles.progressPanel} aria-live="polite">
                  <div className={styles.statusHead}>
                    <span className={`${styles.headIcon} ${publishComplete ? styles.headDone : styles.headSpin}`} aria-hidden="true">
                      {publishComplete
                        ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        : <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="6.8" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" /><path d="M8.5 1.7a6.8 6.8 0 0 1 6.8 6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
                    </span>
                    <div className={styles.headText}>
                      <h3>{publishComplete ? "处理完成" : "正在写入作品"}<span className={styles.counter}>{publishDoneCount} / {publishResults.length} 篇</span></h3>
                      <p>{publishComplete
                        ? <>成功 {publishSuccessCount} 篇{publishFailedCount > 0 ? <>，失败 {publishFailedCount} 篇；失败的内容保留在页面中，可返回上一步修改后重试</> : "；全部内容已按所选方式处理完毕"}</>
                        : (publishingItem ? <>正在写入<b>《{publishingItem.title}》</b>的作品和标签</> : "即将开始写入，请稍候")}</p>
                    </div>
                    <span className={styles.pct}>{publishProgress}%</span>
                  </div>
                  <div className={`${styles.progressTrack}${publishComplete ? ` ${styles.progressComplete}` : ""}`}><span style={{ width: `${publishProgress}%` }} /></div>
                  <ul className={styles.resultList}>
                    {publishResults.map((result) => <li key={result.workId} className={styles[result.status]}>
                      <span className={styles.mark} aria-hidden="true">{renderStatusMark(result.status)}</span>
                      <strong className={styles.workTitle}>{result.title}</strong>
                      <p className={styles.workMsg}>{result.message}</p>
                    </li>)}
                  </ul>
                  {publishComplete && <div className={styles.resultActions}><button type="button" onClick={resetImport}>继续导入</button><Link href="/studio" className={styles.primaryButton}>查看创作中心</Link></div>}
                </section>
              </div>}
          </section>
        </main>
    </div>
  );
}
