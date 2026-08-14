"use client";
/* eslint-disable @next/next/no-img-element -- 审核页需要展示作品原图。 */

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/* ==================== 类型 ==================== */

type NamedUser = { nickname?: string | null } | null;

type Finding = {
  id: string;
  source?: string | null;
  category?: string | null;
  severity?: string | null;
  status?: string | null;
  location_type?: string | null;
  field_name?: string | null;
  paragraph_index?: number | null;
  start_offset?: number | null;
  end_offset?: number | null;
  image_index?: number | null;
  quoted_text?: string | null;
  details?: string | null;
  metadata?: Record<string, unknown> | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
};

type ReviewCase = {
  id: string;
  post_id: string;
  post_version_id: string;
  author_id?: string;
  status?: string | null;
  priority?: string | null;
  route_reason?: string | null;
  screening_status?: string | null;
  screening_sources?: string[] | null;
  screening_result?: unknown;
  rules_version?: string | null;
  model_name?: string | null;
  model_version?: string | null;
  submission_number?: number | null;
  assigned_admin_id?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
} | null;

type Post = {
  id: string;
  user_id?: string;
  title?: string | null;
  content?: string | null;
  author_note?: string | null;
  post_type?: string | null;
  series_name?: string | null;
  chapter_number?: number | null;
  chapter_title?: string | null;
  status?: string | null;
  review_status?: string | null;
  review_reason?: string | null;
  pending_review_status?: string | null;
  pending_review_reason?: string | null;
  visibility?: string | null;
  pending_visibility?: string | null;
  content_rating?: string | null;
  word_count?: number | null;
  created_at?: string | null;
  published_at?: string | null;
  current_version_number?: number | null;
  review_submission_number?: number | null;
  published_version_number?: number | null;
  author?: NamedUser;
};

type Version = {
  id: string;
  post_id?: string;
  author_id?: string;
  version_number?: number | null;
  submission_number?: number | null;
  title?: string | null;
  content?: string | null;
  author_note?: string | null;
  series_name?: string | null;
  chapter_number?: number | null;
  chapter_title?: string | null;
  word_count?: number | null;
  published_at?: string | null;
  visibility?: string | null;
  post_type?: string | null;
  snapshot?: unknown;
  source?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
};

type HistoryCase = {
  id: string;
  status?: string | null;
  priority?: string | null;
  route_reason?: string | null;
  submission_number?: number | null;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
};

type HistoryVersion = {
  id: string;
  version_number?: number | null;
  submission_number?: number | null;
  title?: string | null;
  word_count?: number | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

type ManualFindingDraft = {
  clientId: string;
  location_type: string;
  field_name: string;
  paragraph_index: number | null;
  start_offset: number | null;
  end_offset: number | null;
  image_index: number | null;
  ocr_note_index: number | null;
  quoted_text: string | null;
  details: string | null;
};

type ManualMark = {
  clientId: string;
  field_name: string;
  paragraph_index: number | null;
  start_offset: number;
  end_offset: number;
};

type SystemRange = {
  start: number;
  end: number;
  findingId: string;
};

type SelectionContext = {
  container: HTMLElement;
  fieldName: string;
  paragraphIndex: number | null;
  imageIndex: number | null;
  ocrNoteIndex: number | null;
  startOffset: number;
  endOffset: number;
  text: string;
};

type SelectionInfo = {
  text: string;
  x: number;
  y: number;
  contexts: SelectionContext[];
  alreadyMarked: boolean;
};

/* ==================== 文案映射 ==================== */

const typeLabels: Record<string, string> = { illustration: "图片作品", novel: "小说", article: "文章", serial: "连载章节" };
const sourceLabels: Record<string, string> = {
  keyword: "违规词库",
  moderation_api: "内容审核接口",
  nudenet_modelscope: "NudeNet 图片模型",
  nsfwjs_client: "NSFWJS 漫画辅助模型",
  paddleocr_modelscope: "PaddleOCR 图片文字识别",
  rating_rule: "评级规则",
  admin: "管理员",
};
const riskLabels: Record<string, string> = {
  buttocks_exposed: "臀部裸露",
  female_breast_exposed: "女性胸部裸露",
  male_breast_exposed: "男性胸部裸露",
  female_genitalia_exposed: "女性生殖器裸露",
  male_genitalia_exposed: "男性生殖器裸露",
  exposed_anus: "肛门裸露",
  exposed_breast_f: "女性胸部裸露",
  exposed_breast_m: "男性胸部裸露",
  exposed_genitalia_f: "女性生殖器裸露",
  exposed_genitalia_m: "男性生殖器裸露",
  exposed_buttocks: "臀部裸露",
  penis_exposed: "阴茎裸露",
  vagina_exposed: "阴道裸露",
  keyword: "命中违规词",
  porn: "成人色情内容",
  hentai: "成人漫画内容",
  sexy: "性暗示内容",
};
const issueTypes = [
  "内容评级与实际内容不符",
  "成人或不当内容",
  "暴力、血腥或威胁性内容",
  "攻击、骚扰或歧视性内容",
  "广告、诈骗或导流",
  "其他需要修改的问题",
];
const statusLabels: Record<string, string> = {
  pending: "待人工审核",
  reviewing: "审核中",
  service_error: "服务异常，待人工处理",
  approved: "已放行",
  changes_requested: "已打回",
  cancelled: "已取消",
};
const screeningStatusLabels: Record<string, string> = {
  completed: "已完成自动审核，等待人工决定",
  failed: "自动审核异常，等待人工处理",
  pending: "自动审核进行中",
  not_configured: "未配置自动审核",
};
const findingStatusLabels: Record<string, string> = {
  suggested: "待确认",
  confirmed: "已确认",
  dismissed: "已忽略",
};

function sourceLabel(source?: string | null) {
  return sourceLabels[source || ""] || source || "未知来源";
}

function riskLabel(category?: string | null) {
  if (!category) return "待确认问题";
  return riskLabels[category.toLowerCase()] || category.replaceAll("_", " ");
}

function locationTitle(finding: Finding) {
  if (finding.location_type === "image") return `图片 ${(finding.image_index ?? 0) + 1}`;
  if (finding.location_type === "image_ocr") return `图片内文字 · 图片 ${(finding.image_index ?? 0) + 1}`;
  if (finding.field_name === "title") return "标题";
  if (finding.field_name === "author_note") return "作者的话";
  if (finding.field_name === "content" && finding.paragraph_index) return `正文 · 段落 ${finding.paragraph_index}`;
  return "正文";
}

function ocrConfidence(finding: Finding) {
  const metadata = finding.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const confidence = metadata.ocr_confidence;
  return typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

/* ==================== 高亮 ==================== */

function MarkedText({ text, systemRanges = [], marks, manualMarkClass, onManualMarkClick, onManualMarkDoubleClick, onSystemMarkClick }: {
  text: string;
  systemRanges?: SystemRange[];
  marks: ManualMark[];
  manualMarkClass?: string;
  onManualMarkClick?: (clientId: string, element: HTMLElement) => void;
  onManualMarkDoubleClick?: (clientId: string) => void;
  onSystemMarkClick?: (findingId: string) => void;
}) {
  if (!text) return <>{text}</>;
  const ranges: Array<{ start: number; end: number; kind: "system" | "manual"; findingId?: string; clientId?: string }> = [];
  for (const range of systemRanges) {
    const start = Math.max(0, Math.min(range.start, text.length));
    const end = Math.max(start, Math.min(range.end, text.length));
    if (end > start) ranges.push({ start, end, kind: "system", findingId: range.findingId });
  }
  for (const mark of marks) {
    const start = Math.max(0, Math.min(mark.start_offset, text.length));
    const end = Math.max(start, Math.min(mark.end_offset, text.length));
    if (end > start) ranges.push({ start, end, kind: "manual", clientId: mark.clientId });
  }
  if (!ranges.length) return <>{text}</>;

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number; kinds: Set<"system" | "manual">; findingIds: string[]; clientIds: string[] }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      last.kinds.add(range.kind);
      if (range.findingId && !last.findingIds.includes(range.findingId)) last.findingIds.push(range.findingId);
      if (range.clientId && !last.clientIds.includes(range.clientId)) last.clientIds.push(range.clientId);
    } else {
      merged.push({
        start: range.start,
        end: range.end,
        kinds: new Set([range.kind]),
        findingIds: range.findingId ? [range.findingId] : [],
        clientIds: range.clientId ? [range.clientId] : [],
      });
    }
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((range, index) => {
    if (range.start > cursor) nodes.push(<span key={`t-${index}`}>{text.slice(cursor, range.start)}</span>);
    const isManual = range.kinds.has("manual");
    const isSystem = range.kinds.has("system");
    const className = isManual
      ? manualMarkClass || "admin-manual-mark"
      : isSystem ? "admin-system-mark" : undefined;
    nodes.push(
      <mark
        key={`m-${index}`}
        className={className}
        onClick={isManual && onManualMarkClick && range.clientIds[0]
          ? (event) => onManualMarkClick(range.clientIds[0] as string, event.currentTarget as HTMLElement)
          : isSystem && onSystemMarkClick && range.findingIds[0]
            ? () => onSystemMarkClick(range.findingIds[0] as string)
            : undefined}
        onDoubleClick={isManual && onManualMarkDoubleClick && range.clientIds[0]
          ? (event) => {
              event.preventDefault();
              onManualMarkDoubleClick(range.clientIds[0] as string);
            }
          : undefined}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(<span key="t-end">{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

function textOffsetInContainer(container: HTMLElement, node: Node, nodeOffset: number) {
  const measure = document.createRange();
  measure.selectNodeContents(container);
  measure.setEnd(node, nodeOffset);
  return measure.toString().length;
}

function readDatasetInt(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function systemRangesInText(text: string, findings: Array<Pick<Finding, "id" | "quoted_text">>) {
  const ranges: SystemRange[] = [];
  const lower = text.toLowerCase();
  for (const finding of findings) {
    const needle = finding.quoted_text;
    if (!needle) continue;
    const needleLower = needle.toLowerCase();
    let index = lower.indexOf(needleLower);
    while (index !== -1) {
      ranges.push({ start: index, end: index + needle.length, findingId: finding.id });
      index = lower.indexOf(needleLower, index + 1);
    }
  }
  return ranges;
}

function selectionContextsFromRange(range: Range) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) textNodes.push(node as Text);
    node = walker.nextNode();
  }

  const grouped = new Map<HTMLElement, { min: number; max: number }>();
  for (const textNode of textNodes) {
    if (!textNode.data.trim()) continue;
    const container = textNode.parentElement?.closest("[data-mark-field]");
    if (!(container instanceof HTMLElement)) continue;
    let start = 0;
    let end = textNode.data.length;
    if (textNode === range.startContainer && textNode === range.endContainer) {
      start = range.startOffset;
      end = range.endOffset;
    } else if (textNode === range.startContainer) {
      start = range.startOffset;
    } else if (textNode === range.endContainer) {
      end = range.endOffset;
    }
    if (start >= end) continue;
    const absoluteStart = textOffsetInContainer(container, textNode, start);
    const absoluteEnd = textOffsetInContainer(container, textNode, end);
    if (!(container.textContent || "").slice(absoluteStart, absoluteEnd).trim()) continue;
    const entry = grouped.get(container);
    if (entry) {
      entry.min = Math.min(entry.min, absoluteStart);
      entry.max = Math.max(entry.max, absoluteEnd);
    } else {
      grouped.set(container, { min: Math.min(absoluteStart, absoluteEnd), max: Math.max(absoluteStart, absoluteEnd) });
    }
  }

  const contexts: SelectionContext[] = [];
  grouped.forEach(({ min, max }, container) => {
    const fieldName = container.dataset.markField || "content";
    contexts.push({
      container,
      fieldName,
      paragraphIndex: fieldName === "content" ? readDatasetInt(container.dataset.markIndex) : null,
      imageIndex: readDatasetInt(container.dataset.markImageIndex),
      ocrNoteIndex: readDatasetInt(container.dataset.markOcrIndex),
      startOffset: min,
      endOffset: max,
      text: (container.textContent || "").slice(min, max).trim(),
    });
  });
  return contexts;
}

function manualRangesIntersect(item: ManualFindingDraft, context: SelectionContext) {
  if (item.field_name !== context.fieldName) return false;
  if ((item.paragraph_index ?? null) !== (context.paragraphIndex ?? null)) return false;
  if ((item.image_index ?? null) !== (context.imageIndex ?? null)) return false;
  if ((item.ocr_note_index ?? null) !== (context.ocrNoteIndex ?? null)) return false;
  if (item.start_offset === null || item.end_offset === null) return false;
  return Math.max(item.start_offset, context.startOffset) < Math.min(item.end_offset, context.endOffset);
}

/* ==================== 主组件 ==================== */

export default function ReviewDetailClient({ post, version, reviewCase, findings, historyCases, historyVersions, imageAccessError }: {
  post: Post;
  version: Version;
  reviewCase: ReviewCase;
  findings: Finding[];
  historyCases: HistoryCase[];
  historyVersions: HistoryVersion[];
  imageAccessError?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [brokenImages, setBrokenImages] = useState<number[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<string[]>(() => findings.filter((f) => f.status === "confirmed").map((f) => f.id));
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => findings.filter((f) => f.status === "dismissed").map((f) => f.id));
  const [rejectReason, setRejectReason] = useState("");
  const [manualFindings, setManualFindings] = useState<ManualFindingDraft[]>([]);
  const [selectedIssueTypes, setSelectedIssueTypes] = useState<string[]>([]);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [cancelMarkInfo, setCancelMarkInfo] = useState<{ clientId: string; x: number; y: number } | null>(null);
  const [rejectView, setRejectView] = useState<"issues" | "preview">("issues");
  const [rejectPreviewLines, setRejectPreviewLines] = useState<Array<{ type: string; text: string }>>([]);
  const rejectPanelRef = useRef<HTMLElement | null>(null);
  const rejectBtnRef = useRef<HTMLButtonElement | null>(null);
  const rejectPreviewSlotRef = useRef<HTMLDivElement | null>(null);

  const noteStripped = useMemo(() => (version.content || "").replace(/<!--\s*作者的话：[\s\S]*?-->/g, ""), [version.content]);
  const imageUrls = useMemo(() => [...noteStripped.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]), [noteStripped]);
  const paragraphs = useMemo(
    () => noteStripped.replace(/!\[[^\]]*\]\(([^)]+)\)/g, "").split(/\n\n+/).map((part) => part.trim()).filter(Boolean),
    [noteStripped],
  );

  const confirmedFindings = findings.filter((f) => confirmedIds.includes(f.id) || (f.status === "confirmed" && !dismissedIds.includes(f.id)));
  const titleSystemRanges = systemRangesInText(version.title || "无标题", confirmedFindings.filter((f) => f.field_name === "title"));
  const noteSystemRanges = systemRangesInText(version.author_note || "", confirmedFindings.filter((f) => f.field_name === "author_note"));
  const paragraphSystemRanges = (paragraphIndex: number, paragraph: string) => systemRangesInText(paragraph, confirmedFindings.filter((f) =>
    f.quoted_text && (f.location_type === "text_range" || f.location_type === "paragraph") && (
      (f.field_name === "content" && (f.paragraph_index ?? 0) === paragraphIndex) || !f.field_name
    )
  ));

  const titleManualMarks = useMemo(() => manualFindings
    .filter((item) => item.field_name === "title")
    .map((item) => ({ clientId: item.clientId, field_name: item.field_name, paragraph_index: null, start_offset: item.start_offset ?? 0, end_offset: item.end_offset ?? 0 })),
  [manualFindings]);

  const noteManualMarks = useMemo(() => manualFindings
    .filter((item) => item.field_name === "author_note")
    .map((item) => ({ clientId: item.clientId, field_name: item.field_name, paragraph_index: null, start_offset: item.start_offset ?? 0, end_offset: item.end_offset ?? 0 })),
  [manualFindings]);

  const paragraphManualMarks = (paragraphIndex: number) => manualFindings
    .filter((item) => item.field_name === "content" && (item.paragraph_index ?? 0) === paragraphIndex)
    .map((item) => ({ clientId: item.clientId, field_name: item.field_name, paragraph_index: paragraphIndex, start_offset: item.start_offset ?? 0, end_offset: item.end_offset ?? 0 }));

  const ocrManualMarks = (imageIndex: number, noteIndex: number) => manualFindings
    .filter((item) => item.field_name === "image_ocr" && (item.image_index ?? 0) === imageIndex && (item.ocr_note_index ?? 0) === noteIndex)
    .map((item) => ({ clientId: item.clientId, field_name: item.field_name, paragraph_index: null, start_offset: item.start_offset ?? 0, end_offset: item.end_offset ?? 0 }));

  const statusOf = (finding: Finding) => {
    if (confirmedIds.includes(finding.id)) return "confirmed";
    if (dismissedIds.includes(finding.id)) return "dismissed";
    return finding.status === "confirmed" ? "confirmed" : finding.status === "dismissed" ? "dismissed" : "suggested";
  };

  const toggleConfirm = (finding: Finding) => {
    setConfirmedIds((prev) => prev.includes(finding.id) ? prev.filter((id) => id !== finding.id) : [...prev, finding.id]);
    setDismissedIds((prev) => prev.filter((id) => id !== finding.id));
  };

  const toggleDismiss = (finding: Finding) => {
    setDismissedIds((prev) => prev.includes(finding.id) ? prev.filter((id) => id !== finding.id) : [...prev, finding.id]);
    setConfirmedIds((prev) => prev.filter((id) => id !== finding.id));
  };

  const scrollTo = (finding: Finding) => {
    const id = finding.location_type === "image" || finding.location_type === "image_ocr"
      ? `img-${finding.image_index ?? 0}`
      : finding.field_name === "title" ? "field-title"
      : finding.field_name === "author_note" ? "field-author-note"
      : finding.paragraph_index ? `para-${finding.paragraph_index}`
      : "field-content";
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const makeClientId = () => `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const toggleIssueType = (issueType: string) => {
    setSelectedIssueTypes((prev) => prev.includes(issueType) ? prev.filter((item) => item !== issueType) : [...prev, issueType]);
  };

  const findManualAtRange = (fieldName: string, paragraphIndex: number | null, startOffset: number, endOffset: number, imageIndex: number | null, ocrNoteIndex: number | null) => manualFindings.find((item) =>
    item.field_name === fieldName
    && (item.paragraph_index ?? null) === (paragraphIndex ?? null)
    && (item.image_index ?? null) === (imageIndex ?? null)
    && (item.ocr_note_index ?? null) === (ocrNoteIndex ?? null)
    && item.start_offset !== null && item.end_offset !== null
    && Math.max(item.start_offset, startOffset) < Math.min(item.end_offset, endOffset)
  );

  const handleDocumentMouseUp = () => {
    const selection = window.getSelection();
    const range = selection && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    if (!range) {
      setSelectionInfo(null);
      return;
    }
    const text = selection?.toString().trim() || "";
    if (!text || text.length > 500) {
      setSelectionInfo(null);
      return;
    }
    const contexts = selectionContextsFromRange(range);
    if (!contexts.length) {
      setSelectionInfo(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      setSelectionInfo(null);
      return;
    }
    const alreadyMarked = contexts.some((context) => findManualAtRange(
      context.fieldName,
      context.paragraphIndex,
      context.startOffset,
      context.endOffset,
      context.imageIndex,
      context.ocrNoteIndex,
    ));
    setSelectionInfo({ text, x: rect.left + rect.width / 2, y: rect.top - 8, contexts, alreadyMarked });
  };

  const markSelection = () => {
    if (!selectionInfo) return;
    const drafts: ManualFindingDraft[] = [];
    for (const context of selectionInfo.contexts) {
      const isOcr = context.fieldName === "image_ocr";
      const existing = findManualAtRange(
        context.fieldName,
        context.paragraphIndex,
        context.startOffset,
        context.endOffset,
        context.imageIndex,
        context.ocrNoteIndex,
      );
      if (existing || !context.text) continue;
      drafts.push({
        clientId: makeClientId(),
        location_type: isOcr ? "image_ocr" : "text_range",
        field_name: context.fieldName,
        paragraph_index: context.paragraphIndex,
        start_offset: context.startOffset,
        end_offset: context.endOffset,
        image_index: isOcr ? context.imageIndex : null,
        ocr_note_index: isOcr ? context.ocrNoteIndex : null,
        quoted_text: context.text.slice(0, 500),
        details: null,
      });
    }
    if (drafts.length) setManualFindings((prev) => [...prev, ...drafts]);
    window.getSelection()?.removeAllRanges();
    setSelectionInfo(null);
  };

  const cancelSelectionMarks = () => {
    if (!selectionInfo) return;
    const removed = new Set<string>();
    for (const context of selectionInfo.contexts) {
      manualFindings.forEach((item) => {
        if (manualRangesIntersect(item, context)) removed.add(item.clientId);
      });
    }
    if (removed.size) setManualFindings((prev) => prev.filter((item) => !removed.has(item.clientId)));
    window.getSelection()?.removeAllRanges();
    setSelectionInfo(null);
  };

  const handleManualMarkClick = (clientId: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90);
    const y = Math.min(Math.max(rect.top - 10, 70), window.innerHeight - 60);
    setCancelMarkInfo({ clientId, x, y });
    setSelectionInfo(null);
  };

  const handleManualMarkDoubleClick = (clientId: string) => {
    removeManualFinding(clientId);
    setCancelMarkInfo(null);
    setSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSystemMarkClick = (findingId: string) => {
    const finding = findings.find((item) => item.id === findingId);
    if (finding) toggleConfirm(finding);
  };

  const toggleImageMark = (imageIndex: number, url: string) => {
    setManualFindings((prev) => {
      const existing = prev.find((item) => item.field_name === "image" && (item.image_index ?? 0) === imageIndex);
      if (existing) return prev.filter((item) => item.clientId !== existing.clientId);
      return [...prev, {
        clientId: makeClientId(),
        location_type: "image",
        field_name: "image",
        paragraph_index: null,
        start_offset: null,
        end_offset: null,
        image_index: imageIndex,
        ocr_note_index: null,
        quoted_text: url.split("/").pop() || `图片 ${imageIndex + 1}`,
        details: null,
      }];
    });
  };

  const removeManualFinding = (clientId: string) => {
    setManualFindings((prev) => prev.filter((item) => item.clientId !== clientId));
  };

  const manualFindingLabel = (item: ManualFindingDraft) => {
    if (item.field_name === "title") return "标题";
    if (item.field_name === "author_note") return "作者的话";
    if (item.field_name === "image") return `图片 ${(item.image_index ?? 0) + 1}`;
    if (item.field_name === "image_ocr") return `图片内文字 · 图片 ${(item.image_index ?? 0) + 1}`;
    return `正文 · 段落 ${item.paragraph_index ?? "?"}`;
  };

  const toggleImageMarkKeyboard = (index: number, url: string) => (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleImageMark(index, url);
    }
  };

  useEffect(() => {
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const bubble = document.querySelector(".admin-mark-bubble");
      const cancelBubble = document.querySelector(".admin-cancel-mark-bubble");
      if (bubble?.contains(target) || cancelBubble?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-mark-field]")) return;
      setSelectionInfo(null);
      setCancelMarkInfo(null);
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, []);

  useLayoutEffect(() => {
    if (rejectView !== "issues") return;
    const panel = rejectPanelRef.current;
    const button = rejectBtnRef.current;
    const slot = rejectPreviewSlotRef.current;
    if (!panel || !button || !slot) return;
    panel.style.height = "auto";
    panel.style.height = `${Math.ceil(panel.getBoundingClientRect().height)}px`;
    const panelRect = panel.getBoundingClientRect();
    const buttonTop = button.getBoundingClientRect().top;
    const panelCss = getComputedStyle(panel);
    const preview = slot.closest(".admin-reject-preview");
    const previewCss = preview ? getComputedStyle(preview) : null;
    const padBottom = (parseFloat(panelCss.paddingBottom) || 0) + (parseFloat(panelCss.borderBottomWidth) || 0)
      + (previewCss ? (parseFloat(previewCss.paddingBottom) || 0) + (parseFloat(previewCss.borderBottomWidth) || 0) : 0);
    const slotHeight = Math.max(32, Math.ceil(panelRect.bottom - padBottom - buttonTop));
    slot.style.height = `${slotHeight}px`;
  }, [rejectView, manualFindings.length, selectedIssueTypes.length, rejectReason]);

  const openRejectPreview = () => {
    const reason = rejectReason.trim();
    if (selectedIssueTypes.length === 0) {
      setMessage("请先勾选至少一项问题类型。");
      return;
    }
    if (confirmedIds.length === 0 && manualFindings.length === 0 && !reason) {
      setMessage("请先确认一项系统标记、添加一项人工标记，或填写打回说明。");
      return;
    }
    const lines: Array<{ type: string; text: string }> = [];
    confirmedFindings.forEach((finding) => lines.push({ type: "系统标记", text: riskLabel(finding.category) }));
    manualFindings.forEach((item) => lines.push({
      type: "人工标记",
      text: `${manualFindingLabel(item)}：${item.quoted_text || "（无引用文本）"}`,
    }));
    if (selectedIssueTypes.length) lines.push({ type: "问题类型", text: selectedIssueTypes.join("、") });
    if (reason) lines.push({ type: "打回说明", text: reason });
    setRejectPreviewLines(lines);
    setRejectView("preview");
    setMessage("");
  };

  const confirmReject = () => {
    setRejectView("issues");
    void reject();
  };

  const rejectBasisReady = confirmedIds.length > 0 || manualFindings.length > 0 || rejectReason.trim().length > 0;
  const canReject = rejectBasisReady && selectedIssueTypes.length > 0;
  const rejectRuleText = !rejectBasisReady
    ? "请先框选标记问题，或确认系统标记，或填写打回说明。"
    : selectedIssueTypes.length === 0
      ? "已具备打回依据，请至少勾选一项问题类型。"
      : "已就绪：系统标记、人工标记或打回说明 + 问题类型均可作为打回依据。";

  const reject = async () => {
    const reason = rejectReason.trim();
    if (selectedIssueTypes.length === 0) {
      setMessage("请先勾选至少一项问题类型。");
      return;
    }
    if (confirmedIds.length === 0 && manualFindings.length === 0 && !reason) {
      setMessage("请先确认一项系统标记、添加一项人工标记，或填写打回说明。");
      return;
    }
    setBusy(true);
    setMessage("");
    const category = selectedIssueTypes[0];
    const issueText = selectedIssueTypes.join("、");
    const finalReason = reason ? `${issueText}。${reason}` : `${issueText}。`;
    const submittedFindings = manualFindings.map((item) => ({
      category,
      severity: "high",
      location_type: item.location_type,
      field_name: item.field_name,
      paragraph_index: item.paragraph_index,
      start_offset: item.start_offset,
      end_offset: item.end_offset,
      image_index: item.image_index,
      quoted_text: item.quoted_text,
      details: item.details ? `${issueText}。${item.details}` : `${issueText}。`,
    }));
    if (confirmedIds.length === 0 && submittedFindings.length === 0) {
      submittedFindings.push({
        category,
        severity: "high",
        location_type: "text_range",
        field_name: "content",
        paragraph_index: null,
        start_offset: null,
        end_offset: null,
        image_index: null,
        quoted_text: null,
        details: `${issueText}。${reason}`,
      });
    }
    const response = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewCaseId: reviewCase?.id,
        decision: "rejected",
        reason: finalReason,
        confirmedFindingIds: confirmedIds,
        dismissedFindingIds: dismissedIds,
        manualFindings: submittedFindings,
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "打回操作失败，请稍后重试。");
      return;
    }
    window.location.assign("/admin?view=reviews");
  };

  const approve = async () => {
    if (!window.confirm("确认该审核版本没有违规并立即公开发布吗？")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewCaseId: reviewCase?.id,
        decision: "approved",
        reason: null,
        confirmedFindingIds: confirmedIds,
        dismissedFindingIds: dismissedIds,
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "放行操作失败，请稍后重试。");
      return;
    }
    window.location.assign("/admin?view=reviews");
  };

  const screeningSources = (reviewCase?.screening_sources || []).map((source) => sourceLabel(source)).join("、") || "未记录";
  const imageFindingsByIndex = (index: number) => findings.filter((f) => (f.location_type === "image" || f.location_type === "image_ocr") && (f.image_index ?? 0) === index);

  return (
    <main className="admin-review-detail-page admin-detail-shell">
      <header className="admin-detail-top">
        <Link href="/admin?view=reviews" className="admin-back-link">← 返回作品审核</Link>
        <span className="admin-detail-status">{statusLabels[reviewCase?.status || ""] || "待人工审核"}</span>
      </header>

      <div className="admin-review-heading">
        <div className="admin-detail-kicker">
          POST-PUBLISH REVIEW · {typeLabels[version.post_type || post.post_type || ""] || "作品"} · 冻结版本 v{version.version_number ?? 1}
        </div>
        <h1>
          <MarkedText
            text={version.title || "无标题"}
            systemRanges={titleSystemRanges}
            marks={titleManualMarks}
            onManualMarkClick={handleManualMarkClick}
            onManualMarkDoubleClick={handleManualMarkDoubleClick}
            onSystemMarkClick={handleSystemMarkClick}
          />
        </h1>
        <div className="admin-detail-meta">
          作者：{post.author?.nickname || "未知作者"}
          {version.post_type === "serial" && version.series_name ? ` · 连载《${version.series_name}》` : ""}
          {version.post_type === "serial" && version.chapter_number != null ? ` · 第 ${version.chapter_number} 章` : ""}
          {version.chapter_title ? ` · ${version.chapter_title}` : ""}
          {" · "}{post.content_rating || "未评级"}
          {" · "}第 {reviewCase?.submission_number || 1} 次提交
          {" · "}提交于 {formatDate(version.submitted_at || version.created_at)}
        </div>
      </div>

      <div className="admin-review-layout">
        <aside className="admin-review-summary-column">
          <section className="admin-detail-panel">
            <div className="admin-panel-title-row">
              <h2>作品信息</h2>
              <span>{reviewCase?.priority === "high" ? "高风险" : "普通"}</span>
            </div>
            <dl>
              <dt>作者</dt>
              <dd>{post.author?.nickname || "未知作者"}</dd>
              <dt>类型</dt>
              <dd>{typeLabels[version.post_type || post.post_type || ""] || "作品"}</dd>
              <dt>提交版本</dt>
              <dd>v{version.version_number ?? 1} · 第 {reviewCase?.submission_number || 1} 次提交</dd>
              <dt>评级</dt>
              <dd>{post.content_rating || "未评级"}</dd>
              <dt>审核状态</dt>
              <dd>{statusLabels[reviewCase?.status || ""] || reviewCase?.status || "待人工审核"}</dd>
              <dt>自动审核状态</dt>
              <dd>{screeningStatusLabels[reviewCase?.screening_status || ""] || "—"}</dd>
              <dt>触发来源</dt>
              <dd>{reviewCase?.route_reason || "—"}</dd>
              <dt>审核来源</dt>
              <dd>{screeningSources}</dd>
              <dt>规则/模型版本</dt>
              <dd>{reviewCase?.rules_version || reviewCase?.model_version || "—"}</dd>
              <dt>版本</dt>
              <dd>v{version.version_number ?? 1} · 字数 {version.word_count ?? post.word_count ?? 0}</dd>
              <dt>可见范围</dt>
              <dd>{post.pending_visibility || version.visibility || "public"}</dd>
            </dl>
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row">
              <h2>系统标记与风险</h2>
              <span>{findings.length} 项</span>
            </div>
            <p>确认需要作者修改的标记；其余可以忽略。已确认标记会进入打回问题清单。</p>
            {findings.length ? (
              <div className="admin-finding-list">
                {findings.map((finding) => {
                  const status = statusOf(finding);
                  const confidence = ocrConfidence(finding);
                  return (
                    <div className={`admin-finding-item ${status === "confirmed" ? "is-confirmed" : status === "dismissed" ? "is-dismissed" : ""}`} key={finding.id}>
                      <div className="admin-finding-head">
                        <strong>{locationTitle(finding)}</strong>
                        <span className={`admin-finding-status ${status === "confirmed" ? "is-confirmed" : status === "dismissed" ? "is-dismissed" : ""}`}>
                          {findingStatusLabels[status] || "待确认"}
                        </span>
                      </div>
                      <div className="admin-finding-tags">
                        <span>{riskLabel(finding.category)}</span>
                        <span className="is-source">{sourceLabel(finding.source)}</span>
                        {confidence !== null && <span>OCR 置信度 {Math.round(confidence * 100)}%</span>}
                      </div>
                      {finding.quoted_text ? <blockquote>{finding.quoted_text}</blockquote> : null}
                      {finding.details ? <small>{finding.details}</small> : null}
                      <div className="admin-finding-actions">
                        <button className={status === "confirmed" ? "is-active" : ""} type="button" disabled={busy} onClick={() => toggleConfirm(finding)}>
                          {status === "confirmed" ? "取消确认" : "确认"}
                        </button>
                        <button className={status === "dismissed" ? "is-active" : ""} type="button" disabled={busy} onClick={() => toggleDismiss(finding)}>
                          {status === "dismissed" ? "取消忽略" : "忽略"}
                        </button>
                        <button className="is-muted" type="button" onClick={() => scrollTo(finding)}>定位</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>系统没有自动标记。可直接放行，或使用下方人工标记添加问题。</p>
            )}
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row">
              <h2>添加人工标记</h2>
              {manualFindings.length ? <span>{manualFindings.length} 项</span> : null}
            </div>
            <p>在中间作品内容里框选标题、正文、作者的话等文字，或直接点击图片进行标记；标记时无需选择问题类型。</p>
            {manualFindings.length ? (
              <div className="admin-finding-list admin-manual-findings">
                {manualFindings.map((item) => (
                  <div className="admin-finding-item is-confirmed" key={item.clientId}>
                    <div className="admin-finding-head">
                      <strong>{manualFindingLabel(item)}</strong>
                      <span className="admin-finding-status is-confirmed">已确认</span>
                    </div>
                    <div className="admin-finding-tags">
                      <span className="is-source">管理员</span>
                    </div>
                    {item.quoted_text ? <blockquote>{item.quoted_text}</blockquote> : null}
                    <div className="admin-finding-actions">
                      <button className="is-muted" type="button" onClick={() => removeManualFinding(item.clientId)}>移除</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-manual-empty">还没有人工标记。框选正文文字试试，气泡会出现在选中文字上方。</div>
            )}
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row">
              <h2>历史审核记录</h2>
              <span>{historyCases.length} 条</span>
            </div>
            {historyCases.length ? (
              <div className="admin-history-list">
                {historyCases.map((item) => (
                  <div className="admin-history-item" key={item.id}>
                    <strong>{statusLabels[item.status || ""] || item.status || "已处理"} · 第 {item.submission_number || 1} 次提交</strong>
                    <span>{item.route_reason || "—"} · {formatDate(item.decided_at || item.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>暂无历史审核记录。</p>
            )}
            {historyVersions.length > 0 && (
              <div className="admin-history-list" style={{ marginTop: 12 }}>
                {historyVersions.slice(0, 8).map((item) => (
                  <div className="admin-history-item" key={item.id}>
                    <strong>{item.title || "无标题"} · v{item.version_number ?? "?"}</strong>
                    <span>字数 {item.word_count ?? 0} · {formatDate(item.submitted_at || item.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <article className="admin-detail-content admin-review-main">
          <section className="admin-evidence-document">
            <div className="admin-document-label">FROZEN VERSION · 审核中固定版本</div>
            <h2 id="field-title" data-mark-field="title" onMouseUp={handleDocumentMouseUp}>
              <MarkedText
                text={version.title || "无标题"}
                systemRanges={titleSystemRanges}
                marks={titleManualMarks}
                onManualMarkClick={handleManualMarkClick}
                onManualMarkDoubleClick={handleManualMarkDoubleClick}
                onSystemMarkClick={handleSystemMarkClick}
              />
            </h2>
            {imageAccessError ? <div className="admin-image-access-error" role="alert">{imageAccessError}</div> : null}

            {paragraphs.length > 0 && (
              <div className="admin-field-block" id="field-content">
                <h3>正文（{paragraphs.length} 段）</h3>
                {paragraphs.map((paragraph, index) => (
                  <div className="admin-paragraph" id={`para-${index + 1}`} key={`para-${index + 1}`}>
                    <span className="admin-paragraph-num">{index + 1}</span>
                    <div className="admin-long-content" data-mark-field="content" data-mark-index={index + 1} onMouseUp={handleDocumentMouseUp}>
                      <MarkedText
                        text={paragraph}
                        systemRanges={paragraphSystemRanges(index + 1, paragraph)}
                        marks={paragraphManualMarks(index + 1)}
                        onManualMarkClick={handleManualMarkClick}
                        onManualMarkDoubleClick={handleManualMarkDoubleClick}
                        onSystemMarkClick={handleSystemMarkClick}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {version.author_note ? (
              <div className="admin-field-block" id="field-author-note">
                <h3>作者的话</h3>
                <div className="admin-long-content" data-mark-field="author_note" onMouseUp={handleDocumentMouseUp}>
                  <MarkedText
                    text={version.author_note}
                    systemRanges={noteSystemRanges}
                    marks={noteManualMarks}
                    onManualMarkClick={handleManualMarkClick}
                    onManualMarkDoubleClick={handleManualMarkDoubleClick}
                    onSystemMarkClick={handleSystemMarkClick}
                  />
                </div>
              </div>
            ) : null}

            {imageUrls.length ? (
              <div className="admin-field-block">
                <h3>全部图片（{imageUrls.length} 张）</h3>
                <div className="admin-detail-images">
                  {imageUrls.map((url, index) => {
                    const risks = imageFindingsByIndex(index);
                    const unavailable = url.startsWith("private://") || brokenImages.includes(index);
                    const ocrNotes = findings.filter((f) => f.location_type === "image_ocr" && (f.image_index ?? 0) === index);
                    const isManuallyMarked = manualFindings.some((item) => item.field_name === "image" && (item.image_index ?? 0) === index);
                    return (
                      <figure
                        key={`${url}-${index}`}
                        id={`img-${index}`}
                        className={[risks.length ? "is-flagged" : "", isManuallyMarked ? "is-manual-marked" : ""].filter(Boolean).join(" ")}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isManuallyMarked}
                        title={isManuallyMarked ? "取消标记这张图片" : "标记这张图片"}
                        onClick={() => toggleImageMark(index, url)}
                        onKeyDown={toggleImageMarkKeyboard(index, url)}
                      >
                        <span className="admin-image-mark-badge">已标记</span>
                        {unavailable ? (
                          <div className="admin-image-unavailable">
                            <strong>图片 {index + 1} 暂时无法显示</strong>
                            <span>请检查后台私有图片访问配置后重新加载页面。</span>
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt={`作品图片 ${index + 1}${isManuallyMarked ? "（已人工标记）" : ""}`}
                            onError={() => setBrokenImages((items) => items.includes(index) ? items : [...items, index])}
                          />
                        )}
                        <figcaption>
                          图片 {index + 1}
                          {risks.length ? ` · 系统提示：${risks.filter((r) => r.location_type === "image").map((r) => riskLabel(r.category)).join("、") || "文字识别命中"}` : ""}
                        </figcaption>
                        {ocrNotes.length > 0 && (
                          <div className="admin-ocr-note">
                            {ocrNotes.map((note, noteIndex) => {
                              const confidence = ocrConfidence(note);
                              const ocrText = `图片文字：${note.quoted_text || "（无引用文本）"}${confidence !== null ? `（置信度 ${Math.round(confidence * 100)}%）` : ""}${note.details ? ` · ${note.details}` : ""}`;
                              return (
                                <div
                                  key={note.id}
                                  className="admin-ocr-line"
                                  data-mark-field="image_ocr"
                                  data-mark-image-index={index}
                                  data-mark-ocr-index={noteIndex}
                                  onClick={(event) => event.stopPropagation()}
                                  onMouseUp={handleDocumentMouseUp}
                                >
                                  <MarkedText
                                    text={ocrText}
                                    marks={ocrManualMarks(index, noteIndex)}
                                    onManualMarkClick={handleManualMarkClick}
                                    onManualMarkDoubleClick={handleManualMarkDoubleClick}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </figure>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!paragraphs.length && !imageUrls.length && !version.author_note ? (
              <p className="admin-detail-empty">版本内容已不存在或无法读取。</p>
            ) : null}
          </section>
          {selectionInfo ? (
            <div className="admin-mark-bubble" style={{ left: selectionInfo.x, top: selectionInfo.y }}>
              <button type="button" onClick={markSelection}>标记</button>
              <button type="button" disabled={!selectionInfo.alreadyMarked} onClick={cancelSelectionMarks}>取消标记</button>
            </div>
          ) : null}
          {cancelMarkInfo ? (
            <div className="admin-cancel-mark-bubble" style={{ left: cancelMarkInfo.x, top: cancelMarkInfo.y }}>
              <span>取消这条人工标记？</span>
              <button
                type="button"
                onClick={() => {
                  removeManualFinding(cancelMarkInfo.clientId);
                  setCancelMarkInfo(null);
                }}
              >
                取消标记
              </button>
            </div>
          ) : null}
        </article>

        <aside className="admin-review-action-column">
          <section className="admin-detail-panel admin-reject-panel" ref={rejectPanelRef}>
            <div className="admin-panel-title-row">
              <h2>标记问题并打回</h2>
              <span>人工标记 {manualFindings.length} 项</span>
            </div>
            <div className="admin-reject-issue-view" style={rejectView === "preview" ? { display: "none" } : undefined}>
              <h3 className="admin-reject-section-title">问题类型（{selectedIssueTypes.length} 项）</h3>
              <div className="admin-issue-buttons">
                {issueTypes.map((issueType) => (
                  <button
                    key={issueType}
                    type="button"
                    disabled={busy}
                    className={selectedIssueTypes.includes(issueType) ? "is-selected" : undefined}
                    onClick={() => toggleIssueType(issueType)}
                  >
                    {issueType}
                  </button>
                ))}
              </div>
              <label className="admin-field">
                打回说明（选填）
                <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="补充需要作者修改的说明" maxLength={200} />
              </label>
              <div className="admin-reject-bottom">
                <p className={`admin-reject-rule${canReject ? " is-ready" : ""}`}>{rejectRuleText}</p>
                <button ref={rejectBtnRef} className="admin-detail-danger admin-reject-submit" type="button" disabled={busy || !canReject} onClick={openRejectPreview}>
                  {busy ? "处理中…" : "标记问题并打回"}
                </button>
              </div>
            </div>
            <div className="admin-reject-preview" style={rejectView === "preview" ? undefined : { display: "none" }}>
              <h3 className="admin-preview-title">打回内容预览（将发送给作者）</h3>
              <div className="admin-preview-lines">
                {rejectPreviewLines.slice(0, 4).map((line, index) => (
                  <div className="admin-preview-line" key={`${line.type}-${index}`}>
                    <span><b>[{line.type}]</b> {line.text}</span>
                  </div>
                ))}
                {rejectPreviewLines.length > 4 ? (
                  <div className="admin-preview-line admin-preview-more">
                    <span>… 还有 {rejectPreviewLines.length - 4} 项（打回时将全部发送）</span>
                  </div>
                ) : null}
              </div>
              <div className="admin-reject-bottom admin-preview-actions-slot" ref={rejectPreviewSlotRef}>
                <div className="admin-preview-actions">
                  <button className="admin-preview-confirm" type="button" disabled={busy} onClick={confirmReject}>
                    确认打回
                  </button>
                  <button className="admin-preview-cancel" type="button" disabled={busy} onClick={() => setRejectView("issues")}>
                    返回修改
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="admin-detail-panel admin-approve-panel">
            <h2>确认无违规</h2>
            <p>仅在确认审核版本没有违规时放行。放行后作品将按冻结版本公开发布。</p>
            <button className="admin-detail-secondary" type="button" disabled={busy} onClick={() => void approve()}>
              {busy ? "处理中…" : "确认无违规并放行"}
            </button>
          </section>

          {message ? <div className="admin-detail-message" role="status">{message}</div> : null}
        </aside>
      </div>
    </main>
  );
}
