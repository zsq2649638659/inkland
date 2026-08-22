"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import mammoth from "mammoth";
import HomeSidebar from "@/components/HomeSidebar";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/browser";
import { assertCanPublish } from "@/lib/userRestrictions";
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

interface TextChapter {
  title: string;
  content: string;
}

interface TextImportPlan {
  id: string;
  fileName: string;
  sourceType: string;
  bytes: ArrayBuffer;
  encoding: string;
  detectedEncoding: string;
  content: string;
  chapters: TextChapter[];
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

function toLocalDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function normalizeContent(content: string) {
  return content.replace(/\r\n?/g, "\n").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

const CHAPTER_HEADING = /^(?:第[零〇一二三四五六七八九十百千万两\d]+[章节卷回部篇集]|chapter\s+[零〇一二三四五六七八九十百千万两\d]+|序章|楔子|引子|前言|后记|终章|尾声|番外(?:[零〇一二三四五六七八九十百千万两\d]+)?)(?:[：:\s　\-—·].*)?$/i;
const TEXT_ENCODINGS = ["utf-8", "gb18030", "big5", "utf-16le", "utf-16be"] as const;

function cleanHeading(line: string) {
  return line.trim().replace(/^#{1,6}\s*/, "").trim();
}

function splitTextChapters(content: string): TextChapter[] {
  const lines = normalizeContent(content).split("\n");
  const headings = lines
    .map((line, index) => ({ index, title: cleanHeading(line) }))
    .filter(({ title }) => title.length > 0 && title.length <= 80 && CHAPTER_HEADING.test(title));
  if (headings.length < 2) return [];

  return headings.map((heading, index) => {
    const nextIndex = headings[index + 1]?.index ?? lines.length;
    const beforeFirst = index === 0 ? lines.slice(0, heading.index).join("\n").trim() : "";
    const body = lines.slice(heading.index + 1, nextIndex).join("\n").trim();
    return {
      title: heading.title,
      content: normalizeContent([beforeFirst, body].filter(Boolean).join("\n\n")),
    };
  }).filter((chapter) => chapter.content);
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
  const common = {
    sourceType: plan.sourceType,
    sourceBatchId: plan.id,
    sourcePlanId: plan.id,
    detectedEncoding: plan.encoding,
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
        : "没有识别到至少两个常见章节标题；你仍可在下方检查并编辑正文。",
    })];
  }

  return Promise.all(plan.chapters.map((chapter, index) => makeParsedWork({
    ...common,
    title: chapter.title,
    content: chapter.content,
    sourceName: `${plan.fileName} · ${chapter.title}`,
    groupMode: plan.mode,
    groupName: plan.groupName.trim() || titleFromFileName(plan.fileName),
    chapterNumber: plan.mode === "serial" ? index + 1 : undefined,
    chapterTitle: plan.mode === "serial" ? chapter.title : undefined,
    warning: `已从同一个 TXT 中拆出第 ${index + 1}/${plan.chapters.length} 部分，并保留“${plan.groupName.trim() || titleFromFileName(plan.fileName)}”分组关系。`,
  })));
}

async function parseTextFile(file: File): Promise<ParsedFileResult> {
  const bytes = await file.arrayBuffer();
  const detectedEncoding = detectTextEncoding(bytes);
  const content = normalizeContent(decodeText(bytes, detectedEncoding));
  const chapters = splitTextChapters(content);
  const plan: TextImportPlan = {
    id: crypto.randomUUID(),
    fileName: file.name,
    sourceType: getExtension(file.name),
    bytes,
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

export default function ImportWorkspace() {
  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [parsedWorks, setParsedWorks] = useState<ParsedWork[]>([]);
  const [textPlans, setTextPlans] = useState<TextImportPlan[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [copyrightConfirmed, setCopyrightConfirmed] = useState(false);
  const [publishMode, setPublishMode] = useState<"publish" | "draft" | "schedule">("draft");
  const [scheduleValue, setScheduleValue] = useState("");
  const [publishResults, setPublishResults] = useState<PublishResult[]>([]);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishComplete, setPublishComplete] = useState(false);
  const [sourceTab, setSourceTab] = useState<"local" | "notion" | "feishu" | "export">("local");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [siteOrigin, setSiteOrigin] = useState("http://127.0.0.1:3002");
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

  useEffect(() => {
    // OAuth 状态只能在浏览器挂载后从同源接口读取。
    void refreshProviderStatus();
    setSiteOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthError = params.get("oauthError");
    if (connected === "notion" || connected === "feishu") {
      setSourceTab(connected);
      setOnlineUrl(sessionStorage.getItem(`inkland-import-${connected}-url`) || "");
      setNotice(`${connected === "notion" ? "Notion" : "飞书"} 已连接，现在可以读取刚才的文档。`);
      window.history.replaceState({}, "", "/studio/import");
      void refreshProviderStatus();
    } else if (oauthError) {
      const providerName = oauthError.startsWith("notion") ? "Notion" : "飞书";
      setError(oauthError.endsWith("not_configured") ? `${providerName} 官方授权尚未配置，请先完成开发者应用配置。` : `${providerName} 授权失败或已取消，请重试。`);
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
      const content = changes.encoding ? normalizeContent(decodeText(current.bytes, encoding)) : current.content;
      const chapters = changes.encoding ? splitTextChapters(content) : current.chapters;
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
        : `已更新“${current.fileName}”的拆分方式。`);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "重新解析 TXT 失败");
    } finally {
      setBusy(false);
    }
  };

  const connectProvider = (provider: "notion" | "feishu") => {
    setError("");
    if (!onlineUrl.trim()) { setError(`请先粘贴${provider === "notion" ? " Notion" : "飞书"}文档链接`); return; }
    if (!providerStatus[provider].configured) {
      setError(`${provider === "notion" ? "Notion" : "飞书"} 官方授权尚未配置。页面功能已就绪，配置开发者应用后即可连接。`);
      return;
    }
    sessionStorage.setItem(`inkland-import-${provider}-url`, onlineUrl.trim());
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
    if (!providerStatus[provider].connected) { connectProvider(provider); return; }
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
      const work = await makeParsedWork({
        title: payload.title,
        content: payload.content,
        sourceName: payload.sourceName || payload.title,
        sourceType: payload.sourceType || provider,
        sourceUrl: payload.sourceUrl || onlineUrl.trim(),
        sourceBatchId: crypto.randomUUID(),
        warning: "在线文档只导入标题和正文，不导入评论、修改历史、协作者信息和复杂嵌入内容。",
      });
      setParsedWorks((works) => works.some((item) => item.sourceHash === work.sourceHash) ? works : [...works, work]);
      setPublishResults([]);
      setPublishProgress(0);
      setPublishComplete(false);
      setNotice("文档已加入当前导入批次；你可以继续选择其他导入方式，完成后再进入下一步。");
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
    sessionStorage.removeItem(`inkland-import-${provider}-url`);
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
    const selected = parsedWorks.filter((work) => work.selected && work.groupMode !== "serial");
    if (selected.length === 0) { setError("请先选择要添加标签的作品"); return; }
    if (tags.length === 0) { setError("请输入要批量添加的标签"); return; }
    setParsedWorks((works) => works.map((work) => work.selected && work.groupMode !== "serial"
      ? { ...work, tags: Array.from(new Set([...work.tags, ...tags])).slice(0, 10) }
      : work));
    setBulkTag("");
    setError("");
    setNotice(`已为 ${selected.length} 篇单篇内容添加标签；长篇连载标签请在连载信息中填写。`);
  };

  const resetImport = () => {
    setCurrentStep(1);
    setParsedWorks([]);
    setTextPlans([]);
    setBulkTag("");
    setCopyrightConfirmed(false);
    setScheduleValue("");
    setPublishMode("draft");
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
    <div className="min-h-screen bg-paper pb-20 lg:pb-0"><div className="main-container"><HomeSidebar /><main className="content-area"><div className={styles.centerState}><h1>批量导入作品</h1><p>登录后才能批量发布作品。</p><Link href="/login" className={styles.primaryButton}>登录</Link></div></main></div></div>
  );

  const selectedParsedCount = parsedWorks.filter((work) => work.selected).length;
  const selectedWithTagsCount = parsedWorks.filter((work) => work.selected && (work.groupMode === "serial" ? (work.groupTags?.length || 0) > 0 : work.tags.length > 0)).length;
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
    <div className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />
        <main className={`content-area ${styles.page}`}>
          <header className={styles.header}>
            <div><Link href="/studio" className={styles.backLink}>← 返回创作中心</Link><h1>批量导入作品</h1><p>导入并确认内容，添加标签后可批量发布、保存草稿或定时发布。</p></div>
          </header>

          <ol className={styles.steps} aria-label="导入步骤">
            <li className={currentStep === 1 ? styles.activeStep : currentStep > 1 ? styles.completedStep : ""}><span>1</span>导入作品</li>
            <li className={currentStep === 2 ? styles.activeStep : currentStep > 2 ? styles.completedStep : ""}><span>2</span>确认内容</li>
            <li className={currentStep === 3 ? styles.activeStep : currentStep > 3 ? styles.completedStep : ""}><span>3</span>编辑信息</li>
            <li className={currentStep === 4 ? styles.activeStep : currentStep > 4 ? styles.completedStep : ""}><span>4</span>确认发布</li>
            <li className={currentStep === 5 ? styles.activeStep : ""}><span>5</span>发布结果</li>
          </ol>

          {error && <div className={styles.errorNotice} role="alert">{error}</div>}
          {notice && <div className={styles.successNotice} role="status">{notice}</div>}

          <section className={styles.panel}>
              {currentStep === 1 && <>
              <div className={styles.sourceTabs} role="tablist" aria-label="选择导入来源">
                {([
                  ["local", "本地文档", "DOCX / TXT / MD / HTML / EPUB"],
                  ["notion", "Notion", "官方 OAuth 授权"],
                  ["feishu", "飞书", "官方 OAuth 授权"],
                  ["export", "其他在线文档", "导出文件"],
                ] as const).map(([key, title, description]) => (
                  <button key={key} type="button" role="tab" aria-selected={sourceTab === key} className={sourceTab === key ? styles.activeSource : ""} onClick={() => { setSourceTab(key); setOnlineUrl(""); setError(""); setNotice(""); }}>
                    <strong>{title}</strong><span>{description}</span>
                  </button>
                ))}
              </div>

              {sourceTab === "local" && <div
                className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
                onDragEnter={(event: DragEvent) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event: DragEvent) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event: DragEvent) => { event.preventDefault(); setDragging(false); void handleFiles(event.dataTransfer.files); }}
              >
                <i className="fa-solid fa-file-arrow-up" aria-hidden="true" />
                <h2>选择本地文档</h2>
                <p>支持 DOCX、TXT、Markdown、HTML、EPUB；一次最多50个文件，单个不超过20MB。</p>
                <p className={styles.minorText}>文件在当前浏览器中解析，原始文件不会上传。EPUB 会按阅读顺序拆分章节。</p>
                <button type="button" className={styles.primaryButton} onClick={() => fileInputRef.current?.click()} disabled={busy}>{busy ? "正在解析..." : "选择文件"}</button>
                <input ref={fileInputRef} type="file" hidden multiple accept=".txt,.text,.md,.markdown,.html,.htm,.docx,.epub,text/plain,text/markdown,text/html,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) void handleFiles(event.target.files); event.target.value = ""; }} />
              </div>}

              {(sourceTab === "notion" || sourceTab === "feishu") && <div className={styles.onlinePanel}>
                <div className={styles.onlineHeading}>
                  <div><h2>从{sourceTab === "notion" ? " Notion" : "飞书"}导入</h2><p>只读取你粘贴并授权的这一篇文档，不读取评论、历史版本或协作者资料。</p></div>
                  <span className={providerStatus[sourceTab].connected ? styles.connectedBadge : styles.disconnectedBadge}>{providerStatus[sourceTab].connected ? "已连接" : providerStatus[sourceTab].configured ? "未连接" : "尚未配置"}</span>
                </div>
                <label className={styles.urlField}><span>文档链接</span><input type="url" value={onlineUrl} placeholder={sourceTab === "notion" ? "https://www.notion.so/..." : "https://xxx.feishu.cn/docx/..."} onChange={(event) => setOnlineUrl(event.target.value)} /></label>
                {!providerStatus[sourceTab].configured && <div className={styles.configHint}>本地页面已经具备完整授权流程，但还需要站点管理员配置{sourceTab === "notion" ? " Notion Client ID、Client Secret 和回调地址" : "飞书 App ID、App Secret 和回调地址"}后才能连接。用户不需要、也不能手填 Token。</div>}
                <div className={styles.onlineActions}>
                  {providerStatus[sourceTab].connected ? <>
                    <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void readOnlineDocument(sourceTab)}>{busy ? "正在读取..." : "读取这篇文档"}</button>
                    <button type="button" className={styles.textButton} onClick={() => void disconnectProvider(sourceTab)}>断开授权</button>
                  </> : <button type="button" className={styles.primaryButton} disabled={busy || !providerStatus[sourceTab].configured} onClick={() => connectProvider(sourceTab)}>连接并授权这篇文档</button>}
                  <button type="button" className={styles.textButton} onClick={() => setConfigOpen((open) => !open)}>{configOpen ? "收起管理员配置" : "站点管理员配置"}</button>
                </div>
                {configOpen && <div className={styles.configPanel}>
                  <strong>{sourceTab === "notion" ? "Notion" : "飞书"}接入配置</strong>
                  <p>此处只展示配置方法和当前状态。Client Secret 必须保存在服务端环境变量中，不能由普通用户在网页里填写。</p>
                  <ol>
                    <li>在{sourceTab === "notion" ? " Notion 开发者后台创建 Public integration" : "飞书开放平台创建应用并开通文档只读权限"}。</li>
                    <li>将回调地址配置为 <code>{siteOrigin}/api/import/{sourceTab}/callback</code>。</li>
                    <li>在站点服务端填写：<code>{sourceTab === "notion" ? "NOTION_CLIENT_ID / NOTION_CLIENT_SECRET / NOTION_REDIRECT_URI" : "FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_REDIRECT_URI"}</code>，然后重启站点。</li>
                    <li>回到这里点击“刷新配置状态”，确认状态变成“未连接”。</li>
                  </ol>
                  <div className={styles.configActions}>
                    <a href={sourceTab === "notion" ? "https://developers.notion.com/guides/get-started/authorization" : "https://open.feishu.cn/"} target="_blank" rel="noreferrer">打开官方配置页面</a>
                    <button type="button" onClick={() => void refreshProviderStatus()}>刷新配置状态</button>
                  </div>
                </div>}
              </div>}

              {sourceTab === "export" && <div className={styles.onlinePanel}>
                <div className={styles.onlineHeading}><div><h2>导出文件后导入</h2><p>适用于石墨、Google 文档、Word Online、WPS、腾讯文档和语雀。</p></div><span className={styles.guideBadge}>DOCX / MD</span></div>
                <div className={styles.platformNames} aria-label="支持导出后导入的平台"><span>石墨</span><span>Google 文档</span><span>Word Online</span><span>WPS</span><span>腾讯文档</span><span>语雀</span></div>
                <ol className={styles.shimoSteps}><li>打开原文档，在“文件”或右上角菜单中选择“下载 / 导出”。</li><li>优先选择 Word（DOCX）；有 Markdown 选项时也可以选择 MD。</li><li>下载完成后，点击下方按钮选择文件；可以一次选择多份。</li></ol>
                <button type="button" className={styles.primaryButton} onClick={() => { setSourceTab("local"); setOnlineUrl(""); setNotice("请选择刚刚导出的 DOCX 或 Markdown 文件；可以一次选择多份。"); window.setTimeout(() => fileInputRef.current?.click(), 0); }}>选择导出的文件</button>
              </div>}

              <aside className={styles.privacyBox}>
                <strong>导入隐私说明</strong>
                <ul><li>本地原文件只在浏览器内解析，不上传服务器。</li><li>只有点击发布、保存草稿或定时发布后，确认过的正文和标签才会写入 Inkland。</li><li>不导入批注、修订历史、文档作者元数据、评论和协作者信息。</li><li>在线平台仅通过官方授权读取你明确选择的文档；尚未接入官方授权的平台只提供导出引导。</li></ul>
              </aside>

              {parsedWorks.length > 0 && <div className={styles.importQueue}>
                <div className={styles.sectionHeader}><div><h2>当前导入批次</h2><p>已加入 {importQueueEntries.length} 份来源，可以继续切换其他方式导入。</p></div><button type="button" className={styles.textButton} onClick={resetImport}>清空全部</button></div>
                <ul>{importQueueEntries.map((entry) => <li key={entry.key}><div><strong>{entry.title}</strong><span>{entry.detail}</span></div><button type="button" onClick={() => removeImportedSource(entry.sourceBatchId, entry.workId)}>移除</button></li>)}</ul>
              </div>}
              <div className={styles.stepActions}><span>已导入 {importQueueEntries.length} 份来源</span><button type="button" className={styles.primaryButton} disabled={busy || parsedWorks.length === 0} onClick={continueFromImport}>导入完成，下一步</button></div>
              </>}

              {currentStep === 2 && <div className={styles.stepPage}>
                <div className={styles.sectionHeader}><div><h2>确认导入内容</h2><p>章节检测和拆分方式在本步骤处理；工作区内部可以独立滚动。</p></div><label><input type="checkbox" checked={selectedParsedCount === parsedWorks.length} disabled={busy} onChange={(event) => setParsedWorks((current) => current.map((work) => ({ ...work, selected: event.target.checked })))} /> 全选</label></div>
                {textPlans.length > 0 && <div className={styles.textPlanList}>{textPlans.map((plan) => <section className={styles.textPlanCard} key={plan.id}>
                    <div className={styles.textPlanHeading}><div><strong>{plan.fileName}</strong><p>当前编码：{plan.encoding.toUpperCase()}；{plan.chapters.length >= 2 ? `识别到 ${plan.chapters.length} 个章节标题` : "暂未识别到可拆分的章节"}</p></div><label>文字编码<select value={plan.encoding} disabled={busy} onChange={(event) => void updateTextPlan(plan.id, { encoding: event.target.value })}>{TEXT_ENCODINGS.map((encoding) => <option value={encoding} key={encoding}>{encoding.toUpperCase()}{encoding === plan.detectedEncoding ? "（自动识别）" : ""}</option>)}</select></label></div>
                    {plan.chapters.length >= 2 ? <fieldset className={styles.splitOptions}><legend>这份 TXT 应该怎样导入？</legend><label><input type="radio" name={`mode-${plan.id}`} checked={plan.mode === "serial"} onChange={() => void updateTextPlan(plan.id, { mode: "serial" })} />作为一部长篇的 {plan.chapters.length} 个章节</label><label><input type="radio" name={`mode-${plan.id}`} checked={plan.mode === "collection"} onChange={() => void updateTextPlan(plan.id, { mode: "collection" })} />作为一个合集里的 {plan.chapters.length} 篇单篇</label><label><input type="radio" name={`mode-${plan.id}`} checked={plan.mode === "single"} onChange={() => void updateTextPlan(plan.id, { mode: "single" })} />保持为一篇，不拆分</label></fieldset> : <p className={styles.noChaptersHint}>可尝试切换文字编码。章节标题支持“第一章、序章、番外、尾声、Chapter 1”等常见写法；未识别时会保持整篇。</p>}
                  </section>)}</div>}
                <div className={styles.stepScrollArea}>
                  <div className={styles.previewList}>{parsedWorks.map((work) => <article className={styles.previewCard} key={work.id}><input type="checkbox" checked={work.selected} disabled={busy} aria-label={`选择 ${work.title}`} onChange={(event) => setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, selected: event.target.checked } : item))} /><div className={styles.previewBody}><input className={styles.titleInput} value={work.title} disabled={busy} aria-label="作品标题" maxLength={100} onChange={(event) => setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, title: event.target.value } : item))} /><div className={styles.fileMeta}>{work.sourceName} · {work.wordCount.toLocaleString()} 字 · 来源：{work.sourceType.toUpperCase()}{work.detectedEncoding ? ` · ${work.detectedEncoding.toUpperCase()}` : ""}{work.groupMode === "serial" ? ` · 长篇第 ${work.chapterNumber} 章` : work.groupMode === "collection" ? " · 合集单篇" : ""}</div><textarea value={work.content} disabled={busy} aria-label={`${work.title} 正文`} onChange={(event) => setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, content: event.target.value, wordCount: countWords(event.target.value) } : item))} />{work.warning && <p className={styles.warning}>{work.warning}</p>}</div></article>)}</div>
                </div>
                <div className={styles.stepActions}><button type="button" onClick={() => { setError(""); setCurrentStep(1); }}>上一步</button><span>已选择 {selectedParsedCount} 篇</span><button type="button" className={styles.primaryButton} disabled={busy} onClick={continueFromConfirm}>确认内容，下一步</button></div>
              </div>}

              {currentStep === 3 && <div className={styles.stepPage}>
                <div className={styles.sectionHeader}><div><h2>编辑信息</h2><p>长篇标签属于连载本身；合集中的每篇单篇分别添加标签。</p></div><span>已选 {selectedParsedCount} 篇</span></div>
                <div className={styles.stepScrollArea}>
                  {activeGroupedPlans.map((plan) => <section className={styles.groupInfoCard} key={plan.id}><div className={styles.groupInfoHeading}><div><strong>{plan.mode === "serial" ? "长篇连载信息" : "合集信息"}</strong><p>{plan.mode === "serial" ? `${parsedWorks.filter((work) => work.selected && work.sourcePlanId === plan.id).length} 个章节共用以下信息和标签` : "合集标题和简介属于合集；标签仍在下方逐篇填写"}</p></div><span>{plan.fileName}</span></div><label><span>{plan.mode === "serial" ? "连载标题" : "合集标题"}</span><input value={plan.groupName || ""} maxLength={plan.mode === "serial" ? 20 : 100} onChange={(event) => updateGroupInformation(plan.id, { groupName: event.target.value })} /></label><label><span>{plan.mode === "serial" ? "连载简介" : "合集简介"}</span><textarea value={plan.groupDescription || ""} maxLength={500} placeholder="最多500字" onChange={(event) => updateGroupInformation(plan.id, { groupDescription: event.target.value })} /></label>{plan.mode === "serial" && <div className={styles.tagsSection}><strong>连载标签 <span>这些标签属于整部长篇，不会重复加到章节</span></strong><TagEditor tags={plan.groupTags || []} onChange={(groupTags) => updateGroupInformation(plan.id, { groupTags })} /></div>}</section>)}
                  {parsedWorks.some((work) => work.selected && work.groupMode !== "serial") && <><div className={styles.bulkTagBar}><span>批量添加单篇标签</span><input value={bulkTag} placeholder="逗号或空格隔开；不会添加到长篇章节" onChange={(event) => setBulkTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyBulkTags(); } }} /><button type="button" onClick={applyBulkTags}>添加到所选单篇</button></div><div className={styles.tagWorkList}>{parsedWorks.filter((work) => work.selected && work.groupMode !== "serial").map((work) => <article key={work.id}><div><strong>{work.title}</strong><p>{work.wordCount.toLocaleString()} 字{work.groupMode === "collection" ? " · 合集单篇" : ""}</p></div><div className={styles.tagsSection}><strong>单篇标签 <span>{work.tags.length > 0 ? `已添加 ${work.tags.length} 个` : "至少添加1个"}</span></strong><TagEditor tags={work.tags} onChange={(tags) => setParsedWorks((current) => current.map((item) => item.id === work.id ? { ...item, tags } : item))} /></div></article>)}</div></>}
                </div>
                <div className={styles.stepActions}><button type="button" onClick={() => { setError(""); setCurrentStep(2); }}>上一步</button><span>{selectedWithTagsCount}/{selectedParsedCount} 篇已满足标签要求</span><button type="button" className={styles.primaryButton} onClick={continueFromTags}>信息完成，下一步</button></div>
              </div>}

              {currentStep === 4 && <div className={styles.previewSection}>
                <div className={styles.sectionHeader}><div><h2>确认发布</h2><p>本批次共 {selectedParsedCount} 篇内容，请选择最终处理方式。</p></div></div>
                <ul className={styles.publishSummary}>{parsedWorks.filter((work) => work.selected).map((work) => <li key={work.id}><strong>{work.title}</strong><span>{work.groupMode === "serial" ? `${work.groupName} · ${(work.groupTags || []).map((tag) => `#${tag}`).join(" ")}` : work.tags.map((tag) => `#${tag}`).join(" ")}</span></li>)}</ul>
                <section className={styles.publishPanel} aria-label="确认发布">
                  <fieldset className={styles.publishModes} disabled={busy || publishComplete}>
                    <label><input type="radio" name="publish-mode" checked={publishMode === "draft"} onChange={() => setPublishMode("draft")} /><span><strong>保存到草稿箱</strong>稍后在创作中心继续编辑</span></label>
                    <label><input type="radio" name="publish-mode" checked={publishMode === "publish"} onChange={() => setPublishMode("publish")} /><span><strong>立即发布</strong>提交审核，审核通过后公开</span></label>
                    <label><input type="radio" name="publish-mode" checked={publishMode === "schedule"} onChange={() => setPublishMode("schedule")} /><span><strong>定时发布</strong>提交审核，通过后按设定时间公开</span></label>
                  </fieldset>
                  {publishMode === "schedule" && <label className={styles.scheduleField}><span>发布时间</span><input type="datetime-local" value={scheduleValue} min={toLocalDateTimeValue(new Date(Date.now() + 60_000))} disabled={busy || publishComplete} onChange={(event) => setScheduleValue(event.target.value)} /></label>}
                  <label className={styles.copyrightBox}><input type="checkbox" checked={copyrightConfirmed} disabled={busy || publishComplete} onChange={(event) => setCopyrightConfirmed(event.target.checked)} /><span><strong>版权确认</strong>我确认自己是所选内容的作者，或已取得在 Inkland 发布这些内容的许可。</span></label>
                  <div className={styles.finalActions}>{!publishComplete && <button type="button" disabled={busy} onClick={() => { setError(""); setCurrentStep(3); }}>上一步</button>}<button type="button" className={styles.primaryButton} disabled={busy || publishComplete || selectedParsedCount === 0} onClick={() => void publishSelectedWorks()}>{busy ? "正在处理..." : publishMode === "draft" ? "一键保存到草稿箱" : publishMode === "schedule" ? "一键定时发布" : "一键发布"}</button></div>
                </section>
              </div>}

              {currentStep === 5 && <div className={styles.previewSection}>
                <div className={styles.sectionHeader}><div><h2>发布结果</h2><p>正在处理本批次的 {selectedParsedCount} 篇内容，请不要关闭当前页面。</p></div></div>
                <section className={styles.progressPanel} aria-live="polite"><div className={styles.progressHeading}><strong>{publishComplete ? "处理完成" : "正在批量处理"}</strong><span>{publishProgress}%</span></div><div className={styles.progressTrack}><span style={{ width: `${publishProgress}%` }} /></div><ul className={styles.resultList}>{publishResults.map((result) => <li key={result.workId} className={styles[result.status]}><span>{result.status === "success" ? "✓" : result.status === "failed" ? "!" : result.status === "publishing" ? "…" : "·"}</span><div><strong>{result.title}</strong><p>{result.message}</p></div></li>)}</ul>{publishComplete && <div className={styles.resultActions}><Link href="/studio" className={styles.primaryButton}>查看创作中心</Link><button type="button" onClick={resetImport}>继续导入</button></div>}</section>
              </div>}
          </section>
        </main>
      </div>
    </div>
  );
}
