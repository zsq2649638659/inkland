import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = getSiteUrl().replace(/\/$/, "");
  const now = new Date();
  const fixedPages = ["", "/search", "/guidelines", "/terms", "/privacy"].map((path) => ({
    url: `${url}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? ("daily" as const) : ("monthly" as const),
    priority: path === "" ? 1 : path === "/guidelines" ? 0.8 : 0.5,
  }));

  try {
    const supabase = await createClient();
    const [{ data: posts }, { data: profiles }] = await Promise.all([
      supabase
        .from("posts")
        .select("id, user_id, series_name, created_at, updated_at")
        .eq("status", "published")
        .eq("review_status", "approved")
        .eq("visibility", "public"),
      supabase.from("profiles").select("id, created_at"),
    ]);

    const dynamicPages: MetadataRoute.Sitemap = [];
    const seriesNames = new Set<string>();
    const authorIds = new Set<string>();
    for (const post of posts || []) {
      dynamicPages.push({
        url: `${url}/read/${post.id}`,
        lastModified: post.updated_at ? new Date(post.updated_at) : post.created_at ? new Date(post.created_at) : now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
      if (post.series_name) seriesNames.add(post.series_name);
      if (post.user_id) authorIds.add(post.user_id);
    }
    for (const name of seriesNames) {
      dynamicPages.push({ url: `${url}/series/${encodeURIComponent(name)}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
    }
    for (const profile of profiles || []) {
      if (authorIds.has(profile.id)) dynamicPages.push({ url: `${url}/user/${profile.id}`, lastModified: profile.created_at ? new Date(profile.created_at) : now, changeFrequency: "weekly", priority: 0.4 });
    }
    return [...fixedPages, ...dynamicPages];
  } catch {
    return fixedPages;
  }
}
