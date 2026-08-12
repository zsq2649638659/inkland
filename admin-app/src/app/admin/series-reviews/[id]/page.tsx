import { notFound, redirect } from "next/navigation";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import SeriesReviewClient from "./SeriesReviewClient";

export default async function SeriesReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");
  const db = createAdminServiceClient() || supabase;
  const { data: series } = await db.from("series").select("id, user_id, name, description, tags, series_type, status, review_status, review_reason, review_submission_number, created_at").eq("id", id).eq("review_status", "pending").maybeSingle();
  if (!series) notFound();
  const { data: reviewCase } = await db.from("series_moderation_review_cases").select("id, route_reason, screening_status, rules_version, created_at").eq("series_id", id).in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: findings } = reviewCase ? await db.from("series_moderation_findings").select("id, category, severity, quoted_text, details").eq("review_case_id", reviewCase.id).order("created_at", { ascending: true }) : { data: [] };
  return <SeriesReviewClient series={series as never} reviewCase={reviewCase as never} findings={(findings || []) as never[]} />;
}
