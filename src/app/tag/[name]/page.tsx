import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TagPageClient from "./TagPageClient";

interface TagInfo {
  id: string;
  post_count: number;
}

export default async function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  let initialTagInfo: TagInfo | null = null;
  let tagLookupSucceeded = false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tags")
      .select("id, post_count")
      .eq("name", decodedName)
      .maybeSingle();

    if (!error) {
      tagLookupSucceeded = true;
      initialTagInfo = data as TagInfo | null;
    }
  } catch {
    // The client page has its own retryable data-load error state.
  }

  if (tagLookupSucceeded && !initialTagInfo) notFound();

  return <TagPageClient key={decodedName} decodedName={decodedName} initialTagInfo={initialTagInfo} />;
}
