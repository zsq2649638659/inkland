import type { MetadataRoute } from "next";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export default function robots(): MetadataRoute.Robots {
  const url = getSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/create", "/studio", "/profile", "/settings", "/notifications"] }],
    sitemap: `${url.replace(/\/$/, "")}/sitemap.xml`,
  };
}
