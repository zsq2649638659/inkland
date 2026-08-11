import { notFound, redirect } from "next/navigation";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import ReviewDetailClient from "./ReviewDetailClient";

export const metadata = { title: "作品审核详情 — Inkland 管理后台", robots: { index: false, follow: false } };

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");
  const { data: post } = await supabase.from("posts").select("id, title, content, post_type, status, review_status, review_reason, created_at, current_version_number, review_submission_number, author:profiles!posts_user_id_fkey(nickname)").eq("id", id).eq("review_status", "pending").maybeSingle();
  if (!post) notFound();
  const service = createAdminServiceClient();
  let reviewPost = post;
  if (service && post.content) {
    const privateSources = [...post.content.matchAll(/private:\/\/private-post-images\/([^\s)]+)/g)].map((match) => match[1]);
    let content = post.content;
    for (const sourcePath of privateSources) {
      const { data } = await service.storage.from("private-post-images").createSignedUrl(sourcePath, 3600);
      if (data?.signedUrl) content = content.split(`private://private-post-images/${sourcePath}`).join(data.signedUrl);
    }
    reviewPost = { ...post, content };
  }
  const { data: reviewCase } = await supabase.from("moderation_review_cases").select("id, status, priority, route_reason, screening_status, screening_sources, screening_result, rules_version, submission_number, created_at").eq("post_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: findings } = reviewCase ? await supabase.from("moderation_findings").select("id, source, category, severity, location_type, start_offset, end_offset, image_index, quoted_text, details, metadata").eq("review_case_id", reviewCase.id).order("created_at", { ascending: true }) : { data: [] };
  return <ReviewDetailClient post={reviewPost as never} reviewCase={reviewCase as never} findings={(findings || []) as never[]} />;
}
