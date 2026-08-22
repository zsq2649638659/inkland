import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { IMPORT_STATE_COOKIE, importCookieOptions, isProviderConfigured } from "@/lib/importOAuthSession";

export async function GET(request: Request) {
  if (!isProviderConfigured("notion")) {
    return NextResponse.redirect(new URL("/studio/import?oauthError=notion_not_configured", new URL(request.url).origin));
  }
  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(IMPORT_STATE_COOKIE.notion, state, importCookieOptions(10 * 60));
  const authorizeUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.NOTION_CLIENT_ID!);
  authorizeUrl.searchParams.set("redirect_uri", process.env.NOTION_REDIRECT_URI!);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("owner", "user");
  authorizeUrl.searchParams.set("state", state);
  return NextResponse.redirect(authorizeUrl);
}
