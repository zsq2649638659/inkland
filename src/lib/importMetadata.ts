import { cleanImportHeading, extractImportPreamble } from "@/lib/importChapterDetection";

export interface TextImportMetadata {
  title: string;
  descriptionCandidate: string;
  descriptionSource?: "文档开头导语" | "文档元数据";
}

const MAX_DESCRIPTION_LENGTH = 500;

function normalizeMetadataText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeImportedTitle(value: string, fallback = "未命名作品") {
  const normalized = cleanImportHeading(value)
    .replace(/^(?:书名|作品名|作品标题|标题|title)\s*[:：]\s*/i, "")
    .replace(/^《(.+)》$/, "$1")
    .replace(/^[「『“](.+)[」』”]$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function looksLikeTitle(value: string) {
  return value.length > 0
    && value.length <= 80
    && !/^(?:简介|内容简介|作品简介|description)\s*[:：]/i.test(value)
    && !/[。！？.!?；;]/.test(value);
}

function stripDescriptionLabel(value: string) {
  return value.replace(/^(?:简介|内容简介|作品简介|description)\s*[:：]\s*/i, "").trim();
}

export function normalizeImportedDescription(value: string) {
  return clampDescription(value);
}

function clampDescription(value: string) {
  const normalized = normalizeMetadataText(value);
  if (!normalized) return "";
  if (normalized.length <= MAX_DESCRIPTION_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_DESCRIPTION_LENGTH - 1).trim()}…`;
}

export function extractTextImportMetadata(content: string, fallbackTitle: string): TextImportMetadata {
  const preamble = extractImportPreamble(content);
  if (!preamble) return { title: normalizeImportedTitle(fallbackTitle), descriptionCandidate: "" };

  const lines = normalizeMetadataText(preamble).split("\n").filter(Boolean);
  const rawFirstLine = lines[0] || "";
  const labeledTitle = rawFirstLine.match(/^(?:书名|作品名|作品标题|标题|title)\s*[:：]\s*(.+)$/i)?.[1] || "";
  const firstLine = normalizeImportedTitle(labeledTitle || rawFirstLine, "");
  const hasTitleLine = Boolean(labeledTitle) || looksLikeTitle(firstLine);
  const title = hasTitleLine ? firstLine : normalizeImportedTitle(fallbackTitle);
  const description = clampDescription((hasTitleLine ? lines.slice(1) : lines).map(stripDescriptionLabel).filter(Boolean).join("\n"));
  return {
    title,
    descriptionCandidate: description,
    descriptionSource: description ? "文档开头导语" : undefined,
  };
}
