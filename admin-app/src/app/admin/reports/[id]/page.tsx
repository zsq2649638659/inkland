import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import ReportDetailClient from "./ReportDetailClient";

export const metadata = { title: "举报详情 — Inkland 管理后台", robots: { index: false, follow: false } };

export default async function ReportDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ source?: string }> }) {
  const { id } = await params;
  const { source } = await searchParams;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");

  if (source === "comment") {
    const { data } = await supabase.from("comment_reports").select("id, comment_id, reason, status, created_at, reporter:profiles!comment_reports_reporter_id_fkey(nickname), comment:comments!comment_reports_comment_id_fkey(id, content, author:profiles!comments_user_id_fkey(nickname), post:posts!comments_post_id_fkey(id, title, content, post_type))").eq("id", id).maybeSingle();
    if (!data) notFound();
    return <ReportDetailClient source="comment" report={data as never} />;
  }

  const { data: report } = await supabase.from("content_reports").select("id, target_type, target_id, reason, status, created_at, reporter:profiles!content_reports_reporter_id_fkey(nickname)").eq("id", id).maybeSingle();
  if (!report) notFound();
  if (report.target_type === "post") {
    const { data: post } = await supabase.from("posts").select("id, title, content, post_type, created_at, author:profiles!posts_user_id_fkey(nickname)").eq("id", report.target_id).maybeSingle();
    return <ReportDetailClient source="content" report={{ ...report, post } as never} />;
  }
  const { data: profile } = await supabase.from("profiles").select("id, nickname, bio, created_at").eq("id", report.target_id).maybeSingle();
  return <ReportDetailClient source="content" report={{ ...report, profile } as never} />;
}
