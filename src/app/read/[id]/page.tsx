import { notFound } from "next/navigation";
import ReaderClient from "@/components/ReaderClient";
import ImageReaderClient from "@/components/ImageReaderClient";
import { createClient } from "@/lib/supabase/server";
import type { Post } from "@/lib/types";

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

  // Fetch post data using Supabase server client
  const { data: posts, error: postError } = await supabase
    .from("posts")
    .select("id,title,content,cover_url,word_count,post_type,created_at,series_name,chapter_number,user_id,visibility")
    .eq("id", id)
    .eq("status", "published")
    .limit(1);

  if (postError) {
    console.error(`Supabase fetch failed: ${postError.message} for posts`);
  }

  if (!posts || posts.length === 0) {
    return notFound();
  }

  const p = posts[0] as Record<string, unknown>;
  const resolvedContent = await resolvePrivateImages(supabase, (p.content as string) || "");
  const resolvedCover = p.cover_url ? await resolvePrivateImages(supabase, p.cover_url as string) : null;
  const postType = p.post_type as string;
  const isImagePost = postType === "illustration" || postType === "comic" || postType === "cosplay" || postType === "art";

  // Fetch author
  const { data: authors } = await supabase
    .from("profiles")
    .select("nickname,avatar_url,bio")
    .eq("id", p.user_id)
    .limit(1);

  const author = authors && authors.length > 0
    ? authors[0] as { nickname: string; avatar_url: string | null; bio: string | null }
    : null;

  // Fetch tags
  const { data: postTags } = await supabase
    .from("post_tags")
    .select("tags!inner(name)")
    .eq("post_id", id);

  const tags = Array.isArray(postTags)
    ? (postTags as unknown as Array<{ tags: { name: string } }>).map((pt) => pt.tags?.name).filter(Boolean)
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
