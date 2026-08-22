import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type ImportProvider = "notion" | "feishu";

export interface ImportOAuthSession {
  provider: ImportProvider;
  accessToken: string;
  workspaceName?: string;
  expiresAt: number;
}
function getSessionKey() {
  const secret = process.env.IMPORT_OAUTH_SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("IMPORT_OAUTH_SESSION_SECRET 未配置或长度不足");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptImportSession(session: ImportOAuthSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSessionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptImportSession(value: string | undefined): ImportOAuthSession | null {
  if (!value) return null;
  try {
    const payload = Buffer.from(value, "base64url");
    if (payload.length < 29) return null;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getSessionKey(), iv);
    decipher.setAuthTag(tag);
    const session = JSON.parse(Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8")) as ImportOAuthSession;
    if (!session.accessToken || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export const IMPORT_SESSION_COOKIE: Record<ImportProvider, string> = {
  notion: "inkland_import_notion",
  feishu: "inkland_import_feishu",
};

export const IMPORT_STATE_COOKIE: Record<ImportProvider, string> = {
  notion: "inkland_import_notion_state",
  feishu: "inkland_import_feishu_state",
};

export function importCookieOptions(maxAge = 60 * 60) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function isProviderConfigured(provider: ImportProvider) {
  if (!process.env.IMPORT_OAUTH_SESSION_SECRET) return false;
  if (provider === "notion") {
    return Boolean(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET && process.env.NOTION_REDIRECT_URI);
  }
  return Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET && process.env.FEISHU_REDIRECT_URI);
}
