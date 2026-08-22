import { cookies } from "next/headers";
import { decryptImportSession, IMPORT_SESSION_COOKIE } from "@/lib/importOAuthSession";

function documentId(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (!/(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname)) return null;
  return url.pathname.match(/\/(?:docx|docs)\/([a-zA-Z0-9_-]+)/)?.[1] || null;
}
const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = decryptImportSession(cookieStore.get(IMPORT_SESSION_COOKIE.feishu)?.value);
  if (!session || session.provider !== "feishu") return Response.json({ error: "请先连接飞书" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { url?: string };
  const id = documentId(body.url || "");
  if (!id) return Response.json({ error: "请输入有效的飞书文档链接" }, { status: 400 });

  const [metaResponse, contentResponse] = await Promise.all([
    fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${id}`, { headers: authHeaders(session.accessToken), cache: "no-store" }),
    fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${id}/raw_content`, { headers: authHeaders(session.accessToken), cache: "no-store" }),
  ]);
  const meta = await metaResponse.json() as { data?: { document?: { title?: string } }; msg?: string };
  const contentPayload = await contentResponse.json() as { data?: { content?: string }; msg?: string };
  if (!metaResponse.ok || !contentResponse.ok) {
    return Response.json({ error: contentPayload.msg || meta.msg || "当前授权无法读取这个飞书文档" }, { status: Math.max(metaResponse.status, contentResponse.status) });
  }
  const title = meta.data?.document?.title?.trim() || "未命名飞书文档";
  const content = contentPayload.data?.content?.trim() || "";
  if (!content) return Response.json({ error: "这个飞书文档没有可导入的正文" }, { status: 422 });
  return Response.json({ title, content, sourceName: title, sourceType: "feishu", sourceUrl: body.url });
}
