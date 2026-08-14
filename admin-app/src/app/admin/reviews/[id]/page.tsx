import { notFound, redirect } from "next/navigation";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import { findPublicApprovedImageUrl, privateImageSourcePaths } from "@/lib/review-images";
import ReviewDetailClient from "./ReviewDetailClient";

export const metadata = { title: "作品审核详情 — Inkland 管理后台", robots: { index: false, follow: false } };

type AdminContextClient = Awaited<ReturnType<typeof getAdminContext>>["supabase"];

async function signPrivateImageUrls(service: ReturnType<typeof createAdminServiceClient> | null, fallback: AdminContextClient, content: string, postId: string): Promise<{ content: string; imageAccessError: string | null }> {
  const privateSources = privateImageSourcePaths(content);
  if (!privateSources.length) return { content, imageAccessError: null };
  const storageClient = service || fallback;
  let updated = content;
  let recoveredCount = 0;
  const failures: string[] = [];

  for (const sourcePath of privateSources) {
    const { data, error } = await storageClient.storage.from("private-post-images").createSignedUrl(sourcePath, 3600);
    if (data?.signedUrl) {
      updated = updated.split(`private://private-post-images/${sourcePath}`).join(data.signedUrl);
      continue;
    }
    const publicUrl = await findPublicApprovedImageUrl(storageClient, postId, sourcePath);
    if (publicUrl) {
      updated = updated.split(`private://private-post-images/${sourcePath}`).join(publicUrl);
      recoveredCount += 1;
    } else {
      failures.push(error?.message || "未知存储错误");
    }
  }

  const notes: string[] = [];
  if (recoveredCount > 0) notes.push(`有 ${recoveredCount} 张图片的私有原件已被清理，已自动改用公开发布地址。`);
  if (!service && failures.length) notes.push("后台部署缺少 SUPABASE_SERVICE_ROLE_KEY，部分私有图片无法读取。");
  else if (failures.length) notes.push(`无法生成审核图片临时地址：${failures[0]}`);
  return { content: updated, imageAccessError: notes.length ? notes.join(" ") : null };
}

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");

  const service = createAdminServiceClient();
  const db = service || supabase;

  const { data: reviewCase } = await db
    .from("moderation_review_cases")
    .select("id, post_id, post_version_id, author_id, status, priority, route_reason, screening_status, screening_sources, screening_result, rules_version, model_name, model_version, submission_number, assigned_admin_id, decided_by, decided_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!reviewCase) notFound();

  const [{ data: version }, { data: post }, { data: findings }, { data: historyCases }, { data: historyVersions }] = await Promise.all([
    db.from("post_versions").select("id, post_id, author_id, version_number, submission_number, title, content, author_note, series_name, chapter_number, chapter_title, word_count, published_at, visibility, post_type, snapshot, source, created_at, submitted_at").eq("id", reviewCase.post_version_id).maybeSingle(),
    db.from("posts").select("id, user_id, title, content, author_note, post_type, series_name, chapter_number, chapter_title, status, review_status, review_reason, pending_review_status, pending_review_reason, visibility, pending_visibility, content_rating, word_count, created_at, published_at, current_version_number, review_submission_number, published_version_number, author:profiles!posts_user_id_fkey(nickname)").eq("id", reviewCase.post_id).maybeSingle(),
    db.from("moderation_findings").select("id, source, category, severity, status, location_type, field_name, paragraph_index, start_offset, end_offset, image_index, quoted_text, details, metadata, confirmed_by, confirmed_at, created_at").eq("review_case_id", id).order("created_at", { ascending: true }),
    db.from("moderation_review_cases").select("id, status, priority, route_reason, submission_number, decided_by, decided_at, created_at").eq("post_id", reviewCase.post_id).order("created_at", { ascending: false }).limit(20),
    db.from("post_versions").select("id, version_number, submission_number, title, word_count, submitted_at, created_at").eq("post_id", reviewCase.post_id).order("version_number", { ascending: false }).limit(20),
  ]);

  if (!version || !post) notFound();

  const signed = await signPrivateImageUrls(service, supabase, version.content || "", reviewCase.post_id);
  const signedPostContent = post.content ? (await signPrivateImageUrls(service, supabase, post.content, reviewCase.post_id)).content : post.content;

  return (
    <ReviewDetailClient
      post={{ ...post, content: signedPostContent } as never}
      version={{ ...version, content: signed.content } as never}
      reviewCase={reviewCase as never}
      findings={(findings || []) as never[]}
      historyCases={(historyCases || []) as never[]}
      historyVersions={(historyVersions || []) as never[]}
      imageAccessError={signed.imageAccessError}
    />
  );
}
