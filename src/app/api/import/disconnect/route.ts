import { cookies } from "next/headers";
import { IMPORT_SESSION_COOKIE, type ImportProvider } from "@/lib/importOAuthSession";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { provider?: ImportProvider };
  if (body.provider !== "notion" && body.provider !== "feishu") {
    return Response.json({ error: "不支持的文档平台" }, { status: 400 });
  }
  const cookieStore = await cookies();
  cookieStore.set(IMPORT_SESSION_COOKIE[body.provider], "", { path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}
