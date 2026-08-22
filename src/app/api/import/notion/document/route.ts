import { cookies } from "next/headers";
import { decryptImportSession, IMPORT_SESSION_COOKIE } from "@/lib/importOAuthSession";

interface RichText { plain_text?: string; href?: string | null }
interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}
const notionHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": "2026-03-11",
  "Content-Type": "application/json",
});

function notionPageId(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (!/(^|\.)notion\.(so|site)$/.test(url.hostname)) return null;
  const compact = url.pathname.match(/([0-9a-fA-F]{32})(?:$|[/?#-])/i)?.[1];
  const dashed = url.pathname.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/i)?.[1];
  const id = compact || dashed?.replace(/-/g, "");
  return id ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` : null;
}

function richText(value: unknown) {
  return Array.isArray(value) ? (value as RichText[]).map((item) => item.plain_text || "").join("") : "";
}

function blockToMarkdown(block: NotionBlock) {
  const data = block[block.type] as Record<string, unknown> | undefined;
  const text = richText(data?.rich_text);
  if (/^heading_[1-3]$/.test(block.type)) return `${"#".repeat(Number(block.type.at(-1)))} ${text}`;
  if (block.type === "bulleted_list_item") return `- ${text}`;
  if (block.type === "numbered_list_item") return `1. ${text}`;
  if (block.type === "to_do") return `- [${data?.checked ? "x" : " "}] ${text}`;
  if (block.type === "quote") return text.split("\n").map((line) => `> ${line}`).join("\n");
  if (block.type === "code") return `\`\`\`${String(data?.language || "")}\n${text}\n\`\`\``;
  if (block.type === "divider") return "---";
  if (block.type === "bookmark" || block.type === "embed") return String(data?.url || "");
  if (block.type === "paragraph" || block.type === "callout" || block.type === "toggle") return text;
  return text;
}

async function readBlocks(token: string, blockId: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const response = await fetch(url, { headers: notionHeaders(token), cache: "no-store" });
    const payload = await response.json() as { results?: NotionBlock[]; has_more?: boolean; next_cursor?: string; message?: string };
    if (!response.ok) throw new Error(payload.message || "Notion 文档读取失败");
    for (const block of payload.results || []) {
      const line = blockToMarkdown(block);
      if (line) lines.push(line);
      if (block.has_children) lines.push(...await readBlocks(token, block.id, depth + 1));
    }
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);
  return lines;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = decryptImportSession(cookieStore.get(IMPORT_SESSION_COOKIE.notion)?.value);
  if (!session || session.provider !== "notion") return Response.json({ error: "请先连接 Notion" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { url?: string };
  const pageId = notionPageId(body.url || "");
  if (!pageId) return Response.json({ error: "请输入有效的 Notion 页面链接" }, { status: 400 });

  const pageResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders(session.accessToken), cache: "no-store" });
  const page = await pageResponse.json() as { properties?: Record<string, { type?: string; title?: RichText[] }>; url?: string; message?: string };
  if (!pageResponse.ok) return Response.json({ error: page.message || "当前授权无法读取这个 Notion 页面" }, { status: pageResponse.status });
  const titleProperty = Object.values(page.properties || {}).find((property) => property.type === "title");
  const title = richText(titleProperty?.title) || "未命名 Notion 文档";
  const content = (await readBlocks(session.accessToken, pageId)).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!content) return Response.json({ error: "这个 Notion 页面没有可导入的正文" }, { status: 422 });
  return Response.json({ title, content, sourceName: title, sourceType: "notion", sourceUrl: page.url || body.url });
}
