import { notFound, redirect } from "next/navigation";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import SeriesReviewClient from "./SeriesReviewClient";

export default async function SeriesReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");
  const db = createAdminServiceClient() || supabase;
  const { data: series } = await db.from("series").select("id, public_id, user_id, name, description, tags, series_type, status, review_status, review_reason, review_submission_number, created_at").eq("id", id).maybeSingle();
  if (!series) notFound();
  const { data: author } = await db.from("profiles").select("public_id").eq("id", series.user_id).maybeSingle();
  const { data: reviewHistory } = await db.from("series_moderation_review_cases")
    .select("id, public_id, status, route_reason, screening_status, screening_sources, rules_version, created_at, decided_by, decided_at, submission_number")
    .eq("series_id", id).order("created_at", { ascending: true });
  const reviewCase = (reviewHistory || []).find((item) => ["pending", "reviewing"].includes(item.status))
    || (reviewHistory || [])[reviewHistory?.length ? reviewHistory.length - 1 : 0]
    || null;
  if (!reviewCase) notFound();
  const { data: findings } = reviewCase ? await db.from("series_moderation_findings").select("id, category, source, severity, quoted_text, details").eq("review_case_id", reviewCase.id).order("created_at", { ascending: true }) : { data: [] };
  const [{ count: pendingPostCount }, { count: pendingSeriesCount }] = await Promise.all([
    db.from("posts").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    db.from("series_moderation_review_cases").select("id", { count: "exact", head: true }).in("status", ["pending", "reviewing"]),
  ]);
  return <SeriesReviewClient pendingCount={(pendingPostCount || 0) + (pendingSeriesCount || 0)} series={{ ...series, author_public_id: author?.public_id || null } as never} reviewCase={reviewCase as never} reviewHistory={(reviewHistory || []) as never[]} findings={(findings || []) as never[]} />;
}
