import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { IMPORT_STATE_COOKIE, importCookieOptions, isProviderConfigured } from "@/lib/importOAuthSession";

export async function GET(request: Request) {
  if (!isProviderConfigured("feishu")) return NextResponse.redirect(new URL("/studio/import?oauthError=feishu_not_configured", new URL(request.url).origin));
  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(IMPORT_STATE_COOKIE.feishu, state, importCookieOptions(10 * 60));
  const authorizeUrl = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.FEISHU_APP_ID!);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", process.env.FEISHU_REDIRECT_URI!);
  authorizeUrl.searchParams.set("scope", "wiki:node:read");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", state);
  return NextResponse.redirect(authorizeUrl);
}
