import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  encryptImportSession,
  IMPORT_SESSION_COOKIE,
  IMPORT_STATE_COOKIE,
  importCookieOptions,
  isProviderConfigured,
} from "@/lib/importOAuthSession";

function returnUrl(request: Request, query: string) {
  return new URL(`/studio/import?${query}`, new URL(request.url).origin);
}
export async function GET(request: Request) {
  if (!isProviderConfigured("feishu")) return NextResponse.redirect(returnUrl(request, "oauthError=feishu_not_configured"));
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(IMPORT_STATE_COOKIE.feishu)?.value;
  cookieStore.set(IMPORT_STATE_COOKIE.feishu, "", { path: "/", maxAge: 0 });
  if (!code || !state || !expectedState || state !== expectedState) return NextResponse.redirect(returnUrl(request, "oauthError=feishu_state"));

  const response = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.FEISHU_APP_ID,
      client_secret: process.env.FEISHU_APP_SECRET,
      code,
      redirect_uri: process.env.FEISHU_REDIRECT_URI,
    }),
    cache: "no-store",
  });
  const token = await response.json() as { access_token?: string; name?: string; error?: string; error_description?: string };
  if (!response.ok || !token.access_token) return NextResponse.redirect(returnUrl(request, "oauthError=feishu_exchange"));
  cookieStore.set(IMPORT_SESSION_COOKIE.feishu, encryptImportSession({
    provider: "feishu",
    accessToken: token.access_token,
    workspaceName: token.name,
    expiresAt: Date.now() + 60 * 60 * 1000,
  }), importCookieOptions());
  return NextResponse.redirect(returnUrl(request, "connected=feishu"));
}
