import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import ReaderClient from "@/components/ReaderClient";
import type { Post } from "@/lib/types";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: rawPost, error } = await supabase
    .from("posts")
    .select(
      `id, title, content, cover_url, word_count, post_type, created_at, series_name, chapter_number,
       author:profiles!posts_user_id_fkey(nickname, avatar_url, bio),
       post_tags(tags(name))`
    )
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !rawPost) {
    return notFound();
  }

  const p = rawPost as Record<string, unknown>;
  const tags =
    (p.post_tags as Array<{ tags: { name: string } }> | undefined)?.map(
      (pt) => pt.tags?.name
    ) || [];
  const author = p.author as
    | { nickname: string; avatar_url: string | null; bio: string | null }
    | null;

  const post: Post = {
    id: p.id as string,
    title: p.title as string,
    content: p.content as string,
    post_type: p.post_type as Post["post_type"],
    cover_url: p.cover_url as string | null,
    word_count: p.word_count as number,
    series_name: p.series_name as string | null,
    chapter_number: p.chapter_number as number | null,
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

  return <ReaderClient post={post} />;
}