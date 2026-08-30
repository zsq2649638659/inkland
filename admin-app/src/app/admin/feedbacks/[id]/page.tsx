import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import FeedbackDetailClient from "./FeedbackDetailClient";

export const metadata = { title: "反馈详情 — Inkland 管理后台", robots: { index: false, follow: false } };

export default async function FeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, account } = await getAdminContext();
  if (!user) redirect("/admin/login");

  const { data: feedback, error } = await supabase
    .from("feedbacks")
    .select("id, type, content, status, created_at, user_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !feedback) notFound();

  const [{ data: profile }, { data: auditLogs }] = await Promise.all([
    supabase.from("profiles").select("id, nickname").eq("id", feedback.user_id).maybeSingle(),
    supabase.from("admin_audit_logs").select("id, admin_id, action, note, created_at").eq("target_type", "feedback").eq("target_id", id).order("created_at", { ascending: true }),
  ]);

  return <FeedbackDetailClient
    feedback={feedback}
    profile={profile}
    auditLogs={auditLogs || []}
    adminInitial={account?.display_name?.slice(0, 1).toUpperCase() || user.email?.slice(0, 1).toUpperCase() || "A"}
  />;
}
