"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HomeSidebar from "@/components/HomeSidebar";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/browser";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";
import { readInterestPreferences } from "@/lib/interestPreferences";

interface DiscoveryPost {
  id: string;
  title: string;
  content: string | null;
  post_type: string | null;
  series_name: string | null;
  word_count: number | null;
  created_at: string;
  post_tags?: Array<{ tags?: { name?: string | null } | null }>;
}

function postTypeLabel(postType: string | null) {
  if (postType === "serial") return "连载";
  if (postType === "image") return "图片";
  return "单篇";
}

function excerpt(content: string | null) {
  return (content || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[*_~`#>|-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export default function DiscoverPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const preferences = useMemo(() => readInterestPreferences(user), [user]);
  const domains = useMemo(() => preferences?.domains.map((item) => item.trim().toLowerCase()).filter(Boolean) || [], [preferences]);
  const terms = useMemo(() => preferences?.original_works.map((item) => item.trim().toLowerCase()).filter(Boolean) || [], [preferences]);
  const [posts, setPosts] = useState<DiscoveryPost[] | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=%2Fdiscover");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    if (terms.length === 0 && domains.length === 0) return;

    let active = true;
    void (async () => {
      const query = withTestDataVisibility(
        supabase
          .from("posts")
          .select("id, title, content, post_type, series_name, word_count, created_at, post_tags(tags(name))")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(80),
        includeTestDataForProfile(profile),
      );
      const { data } = await query;
      if (!active) return;
      const matched = ((data || []) as DiscoveryPost[]).filter((post) => {
        const tagNames = (post.post_tags || []).map((item) => item.tags?.name || "").join(" ");
        const haystack = `${post.title || ""} ${post.series_name || ""} ${tagNames}`.toLowerCase();
        const matchesWork = terms.some((term) => haystack.includes(term));
        const matchesDomain = domains.some((domain) => {
          if (domain === "绘画") return post.post_type === "image";
          if (domain === "连载") return post.post_type === "serial";
          if (domain === "文字") return post.post_type !== "image";
          return haystack.includes(domain);
        });
        return matchesWork || matchesDomain;
      });
      setPosts(matched.slice(0, 24));
    })();
    return () => { active = false; };
  }, [domains, profile, supabase, terms, user]);

  if (authLoading || !user) {
    return <div id="page-discover" className="min-h-screen bg-paper"><div className="feed-empty-state" role="status">正在加载兴趣发现…</div></div>;
  }
  if (!user) return null;

  return (
    <div id="page-discover" className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />
        <main className="content-area">
          <div className="page-header interest-discover-header">
            <div>
              <h1 className="page-title">兴趣发现</h1>
              <p className="settings-panel-desc">内容来自你主动选择的兴趣，不会替换首页的关注流。</p>
            </div>
            <Link className="btn-ghost" href="/onboarding/interests?next=%2Fdiscover">修改兴趣</Link>
          </div>

          {preferences && (preferences.domains.length > 0 || preferences.original_works.length > 0 || preferences.dimensions.length > 0) && (
            <section className="settings-panel interest-discover-summary" aria-label="当前兴趣选择">
              <div className="interest-summary-label">当前选择</div>
              <div className="card-tags">
                {[...preferences.domains, ...preferences.original_works, ...preferences.dimensions].map((item) => <span className="card-tag" key={item}>{item}</span>)}
              </div>
            </section>
          )}

          {(terms.length > 0 || domains.length > 0) && posts === null ? (
            <div className="feed-empty-state" role="status">正在匹配内容…</div>
          ) : !preferences || (preferences.domains.length === 0 && preferences.original_works.length === 0 && preferences.dimensions.length === 0) ? (
            <EmptyState icon="fa-compass" title="还没有选择兴趣" description="选择感兴趣的内容后，这里会展示对应发现。" actionLabel="设置兴趣" actionHref="/onboarding/interests?next=%2Fdiscover" />
          ) : posts?.length === 0 ? (
            <EmptyState icon="fa-compass" title="暂时没有匹配内容" description="可以修改兴趣选择，或稍后再来看看。" actionLabel="修改兴趣" actionHref="/onboarding/interests?next=%2Fdiscover" />
          ) : (
            <div className="interest-discover-grid">
              {posts?.map((post) => (
                <Link className="card interest-discover-item" href={`/read/${post.id}`} key={post.id}>
                  <div className="interest-discover-item-icon"><i className={`fa-solid ${post.post_type === "serial" ? "fa-book-open" : "fa-file-lines"}`} aria-hidden="true" /></div>
                  <div className="interest-discover-item-body">
                    <h2>{post.title || "未命名作品"}</h2>
                    <div className="interest-discover-meta">
                      <span>{postTypeLabel(post.post_type)}</span>
                      {post.series_name && <><span className="meta-dot" /> <span>{post.series_name}</span></>}
                      {post.word_count ? <><span className="meta-dot" /> <span>{post.word_count.toLocaleString()} 字</span></> : null}
                    </div>
                    {excerpt(post.content) && <p>{excerpt(post.content)}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
