import { notFound } from "next/navigation";
import ReaderClient from "@/components/ReaderClient";
import ImageReaderClient from "@/components/ImageReaderClient";
import { createClient } from "@/lib/supabase/server";
import type { Post } from "@/lib/types";
import { canViewTestData, withTestDataVisibility } from "@/lib/test-data-visibility";

interface ImageItem {
  url: string;
  caption?: string;
}

async function resolvePrivateImages(supabase: Awaited<ReturnType<typeof createClient>>, content: string) {
  const marker = /private:\/\/private-post-images\/([A-Za-z0-9/_\-.]+)/g;
  const matches = [...content.matchAll(marker)];
  if (matches.length === 0) return content;
  // 并行获取所有 signed URL
  const results = await Promise.all(matches.map(async (match) => {
    const { data } = await supabase.storage.from("private-post-images").createSignedUrl(match[1], 3600);
    return { original: match[0], signedUrl: data?.signedUrl || null };
  }));
  let resolved = content;
  for (const { original, signedUrl } of results) {
    if (signedUrl) resolved = resolved.split(original).join(signedUrl);
  }
  return resolved;
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const includeTestData = await canViewTestData(supabase, user?.id);

  // Fetch post data using Supabase server client
  const postQuery = withTestDataVisibility(
    supabase
      .from("posts")
      .select("id,title,content,cover_url,word_count,post_type,created_at,series_name,chapter_number,user_id,visibility,author:profiles!posts_user_id_fkey(nickname,avatar_url,bio),post_tags(tags!inner(name))")
      .eq("id", id)
      .eq("status", "published"),
    includeTestData,
  ).limit(1);
  const { data: posts, error: postError } = await postQuery;

  if (postError) {
    console.error(`Supabase fetch failed: ${postError.message} for posts`);
  }

  if (!posts || posts.length === 0) {
    return notFound();
  }

  const p = posts[0] as Record<string, unknown>;
  const [resolvedContent, resolvedCover] = await Promise.all([
    resolvePrivateImages(supabase, (p.content as string) || ""),
    p.cover_url ? resolvePrivateImages(supabase, p.cover_url as string) : Promise.resolve(null),
  ]);
  const postType = p.post_type as string;
  const isImagePost = postType === "illustration" || postType === "comic" || postType === "cosplay" || postType === "art";

  const author = p.author as { nickname: string; avatar_url: string | null; bio: string | null } | null;
  const tags = Array.isArray(p.post_tags)
    ? (p.post_tags as unknown as Array<{ tags: { name: string } }>).map((pt) => pt.tags?.name).filter(Boolean)
    : [];

  // Fetch images for image posts
  let images: ImageItem[] = [];
  if (isImagePost) {
    // 图片作品直接从作品正文中的 Markdown 图片链接解析。
    const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(resolvedContent)) !== null) {
      images.push({ url: match[2], caption: match[1] || undefined });
    }
    images = await Promise.all(images.map(async (image) => ({
      ...image,
      url: await resolvePrivateImages(supabase, image.url),
    })));
  }

  const post: Post = {
    id: p.id as string,
    title: p.title as string,
    content: resolvedContent,
    post_type: p.post_type as Post["post_type"],
    cover_url: resolvedCover,
    visibility: p.visibility === "followers_only" || p.visibility === "private" ? p.visibility : "public",
    word_count: p.word_count as number,
    series_name: p.series_name as string | null,
    chapter_number: p.chapter_number as number | null,
    image_count: images.length,
    created_at: p.created_at as string,
    tags,
    author: {
      nickname: author?.nickname || "匿名用户",
      avatar_url: author?.avatar_url,
      bio: author?.bio,
    },
    comment_count: 0,
    like_count: 0,
    bookmark_count: 0,
  };

  if (isImagePost) {
    return <ImageReaderClient post={post} images={images} />;
  }

  return <ReaderClient post={post} />;
}
