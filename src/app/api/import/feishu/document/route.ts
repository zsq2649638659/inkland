import { cookies } from "next/headers";
import { decryptImportSession, IMPORT_SESSION_COOKIE } from "@/lib/importOAuthSession";

type FeishuDocumentReference = {
  token: string;
  type: "docx" | "wiki";
};

function documentReference(value: string): FeishuDocumentReference | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (!/(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname)) return null;
  const match = url.pathname.match(/\/(docx|docs|wiki)\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return {
    token: match[2],
    type: match[1] === "wiki" ? "wiki" : "docx",
  };
}
const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

async function resolveDocumentId(reference: FeishuDocumentReference, accessToken: string) {
  if (reference.type === "docx") return { documentId: reference.token };

  const response = await fetch(
    `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(reference.token)}`,
    { headers: authHeaders(accessToken), cache: "no-store" },
  );
  const payload = await response.json() as {
    code?: number;
    msg?: string;
    data?: { node?: { obj_token?: string; obj_type?: string } };
  };
  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const missingScope = payload.code === 99991672 || /scope|permission/i.test(payload.msg || "");
    return {
      error: missingScope
        ? "当前飞书授权未包含知识库节点只读权限（wiki:node:read），请断开授权后重新连接"
        : payload.msg || "无法读取这个飞书知识库节点",
      status: response.ok ? 403 : response.status,
    };
  }
  const node = payload.data?.node;
  if (!node?.obj_token) return { error: "这个飞书知识库链接没有对应的文档", status: 404 };
  if (node.obj_type !== "docx") return { error: "当前只支持导入飞书新版文档，暂不支持该知识库内容类型", status: 422 };
  return { documentId: node.obj_token };
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = decryptImportSession(cookieStore.get(IMPORT_SESSION_COOKIE.feishu)?.value);
  if (!session || session.provider !== "feishu") return Response.json({ error: "请先连接飞书" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { url?: string };
  const reference = documentReference(body.url || "");
  if (!reference) return Response.json({ error: "请输入有效的飞书新版文档或知识库文档链接" }, { status: 400 });
  const resolved = await resolveDocumentId(reference, session.accessToken);
  if (!resolved.documentId) return Response.json({ error: resolved.error }, { status: resolved.status || 400 });
  const id = resolved.documentId;

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
