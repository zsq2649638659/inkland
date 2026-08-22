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
  if (!isProviderConfigured("notion")) return NextResponse.redirect(returnUrl(request, "oauthError=notion_not_configured"));
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(IMPORT_STATE_COOKIE.notion)?.value;
  cookieStore.set(IMPORT_STATE_COOKIE.notion, "", { path: "/", maxAge: 0 });
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(returnUrl(request, "oauthError=notion_state"));
  }

  const basicAuth = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.NOTION_REDIRECT_URI,
    }),
    cache: "no-store",
  });
  const token = await response.json() as { access_token?: string; workspace_name?: string; error?: string };
  if (!response.ok || !token.access_token) {
    return NextResponse.redirect(returnUrl(request, "oauthError=notion_exchange"));
  }
  cookieStore.set(IMPORT_SESSION_COOKIE.notion, encryptImportSession({
    provider: "notion",
    accessToken: token.access_token,
    workspaceName: token.workspace_name,
    expiresAt: Date.now() + 60 * 60 * 1000,
  }), importCookieOptions());
  return NextResponse.redirect(returnUrl(request, "connected=notion"));
}
