import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.json({ success: true });

  // 清除所有 Supabase auth cookie（项目 ref: azcazuwcrliskkjrvnwa）
  const cookieNames = [
    "sb-azcazuwcrliskkjrvnwa-auth-token",
    "sb-auth-token",
    "supabase-auth-token",
  ];

  for (const name of cookieNames) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  return response;
}