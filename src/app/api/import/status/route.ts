import { cookies } from "next/headers";
import {
  decryptImportSession,
  IMPORT_SESSION_COOKIE,
  isProviderConfigured,
} from "@/lib/importOAuthSession";

export async function GET() {
  const cookieStore = await cookies();
  const notion = decryptImportSession(cookieStore.get(IMPORT_SESSION_COOKIE.notion)?.value);
  const feishu = decryptImportSession(cookieStore.get(IMPORT_SESSION_COOKIE.feishu)?.value);
  return Response.json({
    notion: {
      configured: isProviderConfigured("notion"),
      connected: notion?.provider === "notion",
      workspaceName: notion?.workspaceName || null,
    },
    feishu: {
      configured: isProviderConfigured("feishu"),
      connected: feishu?.provider === "feishu",
      workspaceName: feishu?.workspaceName || null,
    },
  });
}
