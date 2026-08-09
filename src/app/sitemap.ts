import type { MetadataRoute } from "next";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const url = getSiteUrl().replace(/\/$/, "");
  const now = new Date();
  return ["", "/search", "/login"].map((path) => ({
    url: `${url}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? ("daily" as const) : ("monthly" as const),
    priority: path === "" ? 1 : 0.5,
  }));
}
