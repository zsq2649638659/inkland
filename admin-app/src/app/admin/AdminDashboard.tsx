"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-browser";
import { fetchWithTimeout } from "@/lib/adminFetch";

type PostItem = { id: string; title: string; post_type: string | null; created_at: string; review_reason?: string | null; author?: { nickname?: string } | null };
type ReportItem = {
  id: string;
  target_type: "post" | "comment" | "user";
  target_id: string;
  target_user_id?: string | null;
  status: string;
  priority: string;
  primary_reason_category?: string | null;
  report_count: number;
  first_reported_at: string;
  last_reported_at: string;
  created_at: string;
  target_title?: string | null;
  target_summary?: string | null;
  author_nickname?: string | null;
};
type FeedbackItem = { id: string; type: string; content: string; created_at: string; user_id: string };
type SeriesReviewItem = { id: string; series_id: string; status: string; priority: string; route_reason: string; created_at: string; series?: { id: string; name: string; description: string | null; user_id: string } | null };
type UserSearchRow = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
  moderation_status: string;
  total_report_cases: number;
  pending_report_cases: number;
  active_violations: number;
  active_restrictions: number;
};
export type ModerationRule = {
  id: string;
  rule_type: "keyword" | "whitelist";
  pattern: string;
  category: string;
  severity: "review" | "high";
  description: string | null;
  enabled: boolean;
  hit_count: number;
  updated_at: string;
};
type GlobalSearchResults = {
  posts: Array<{ id: string; title: string; post_type: string; status: string; review_status: string; author_nickname: string; href: string | null }>;
  series: Array<{ id: string; name: string; status: string; review_status: string; href: string | null }>;
  users: Array<{ id: string; nickname: string; moderation_status: string; href: string }>;
  reports: Array<{ id: string; title: string; target_type: string; status: string | null; href: string }>;
  feedbacks: Array<{ id: string; type: string; content: string; href: string }>;
};
export type AdminView = "reviews" | "reports" | "users" | "feedbacks" | "rules";

const labels: Record<string, string> = { post: "作品", comment: "评论", user: "用户", novel: "小说", article: "文章", illustration: "插画", serial: "连载" };
const userStatusLabels: Record<string, string> = { active: "正常", warned: "已警告", restricted: "受限", suspended: "已暂停", banned: "已封禁" };
const statusLabelsForSearch = (status?: string | null) => status === "pending" ? "待处理" : status === "reviewing" ? "处理中" : status === "resolved" ? "已处理" : status === "cancelled" ? "已取消" : status || "未知";
const viewCopy: Record<AdminView, { title: string; description: string }> = {
  reviews: { title: "作品审核", description: "处理发布前进入人工审核队列的作品。" },
  reports: { title: "举报中心", description: "进入独立详情页查看完整内容和举报证据。" },
  users: { title: "用户管理", description: "查询用户、违规记录和功能限制。" },
  feedbacks: { title: "用户反馈", description: "查看用户提交的网站问题和建议。" },
  rules: { title: "审核规则", description: "维护关键词与白名单；命中规则只会进入人工审核，不会自动删除作品。" },
};
const fmt = (value: string) => new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });

function Icon({ name }: { name: "file" | "flag" | "users" | "message" | "search" | "arrow" | "check" | "x" | "lock" | "logout" }) {
  const paths: Record<string, string> = {
    file: "M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6",
    flag: "M5 21V4m0 0c5-3 8 3 14 0v9c-6 3-9-3-14 0",
    users: "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8a3 3 0 0 1 0 6M21 21v-2a4 4 0 0 0-3-3",
    message: "M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z",
    search: "m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    check: "m5 12 4 4L19 6",
    x: "m6 6 12 12M18 6 6 18",
    lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z",
    logout: "M10 5H5v14h5M14 8l4 4-4 4m4-4H9",
  };
  return <svg className="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function AdminDashboard({ initialPosts, initialSeriesReviews, initialReports, initialFeedbacks, initialRules, rulesReady, loadErrors, initialView, initialQuery = "", adminName = "管理员", adminEmail }: {
  initialPosts: PostItem[];
  initialSeriesReviews: SeriesReviewItem[];
  initialReports: ReportItem[];
  initialFeedbacks: FeedbackItem[];
  initialRules: ModerationRule[];
  rulesReady: boolean;
  loadErrors: string[];
  initialView: AdminView;
  initialQuery?: string;
  adminName?: string;
  adminEmail: string;
}) {
  const router = useRouter();
  const queryKey = `admin-list-query-${initialView}`;
  const scrollKey = `admin-list-scroll-${initialView}`;
  const [supabase] = useState(() => createAdminClient());
  const posts = initialPosts;
  const seriesReviews = initialSeriesReviews;
  const reports = initialReports;
  const feedbacks = initialFeedbacks;
  const rules = initialRules;
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return initialQuery ?? "";
    return sessionStorage.getItem(queryKey) ?? initialQuery ?? "";
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [ruleType, setRuleType] = useState<ModerationRule["rule_type"]>("keyword");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCategory, setRuleCategory] = useState("广告与导流");
  const [ruleSeverity, setRuleSeverity] = useState<ModerationRule["severity"]>("review");
  const [ruleDescription, setRuleDescription] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserSearchRow[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userSearched, setUserSearched] = useState(false);
  const [userError, setUserError] = useState("");
  const [deleteRule, setDeleteRule] = useState<ModerationRule | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalResults, setGlobalResults] = useState<GlobalSearchResults | null>(null);

  useEffect(() => {
    const savedScroll = Number(sessionStorage.getItem(scrollKey));
    if (savedScroll > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, savedScroll);
        sessionStorage.removeItem(scrollKey);
      });
    }
  }, [queryKey, scrollKey]);

  useEffect(() => {
    const saveScrollBeforeNav = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (anchor?.getAttribute("href")?.startsWith("/admin/")) {
        sessionStorage.setItem(scrollKey, String(window.scrollY));
      }
    };
    document.addEventListener("click", saveScrollBeforeNav, true);
    return () => document.removeEventListener("click", saveScrollBeforeNav, true);
  }, [scrollKey]);

  useEffect(() => {
    if (initialView !== "reviews" && initialView !== "reports") return;
    const refreshTimer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(refreshTimer);
  }, [initialView, router]);

  const nav: Array<{ view: AdminView; label: string; icon: "file" | "flag" | "users" | "message" | "lock"; count?: number }> = [
    { view: "reviews", label: "作品审核", icon: "file", count: posts.length + seriesReviews.length },
    { view: "reports", label: "举报中心", icon: "flag", count: reports.length },
    { view: "users", label: "用户管理", icon: "users" },
    { view: "feedbacks", label: "用户反馈", icon: "message", count: feedbacks.length },
    { view: "rules", label: "审核规则", icon: "lock", count: rules.length || undefined },
  ];

  const handleFeedback = async (id: string) => {
    setBusy(id); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/feedbacks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackId: id, status: "resolved" }) });
      setBusy(null);
      if (!response.ok) { setMessage("反馈处理失败，请稍后重试。"); return; }
      router.refresh();
      setMessage("反馈已标记为处理完成。");
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "反馈处理失败，请稍后重试。");
    }
  };

  const resetRuleForm = () => {
    setRuleError(""); setRuleType("keyword"); setRulePattern(""); setRuleCategory("广告与导流"); setRuleSeverity("review"); setRuleDescription("");
  };

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pattern = rulePattern.trim();
    if (!pattern) { setRuleError("请填写词语或短语。"); return; }
    setBusy("create-rule"); setRuleError("");
    try {
      const response = await fetchWithTimeout("/api/admin/moderation-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleType, pattern, category: ruleCategory, severity: ruleSeverity, description: ruleDescription.trim() || null }) });
      const payload = await response.json().catch(() => null) as { error?: string; rule?: ModerationRule } | null;
      setBusy(null);
      if (!response.ok || !payload?.rule) { setRuleError(payload?.error || "规则保存失败，请稍后重试。"); return; }
      router.refresh();
      setRuleDialogOpen(false); resetRuleForm(); setMessage("规则已添加。新规则只会影响之后提交的内容。");
    } catch (error) {
      setBusy(null);
      setRuleError(error instanceof Error ? error.message : "规则保存失败，请稍后重试。");
    }
  };

  const updateRuleEnabled = async (rule: ModerationRule) => {
    setBusy(rule.id); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/moderation-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }) });
      const payload = await response.json().catch(() => null) as { error?: string; rule?: ModerationRule } | null;
      setBusy(null);
      if (!response.ok || !payload?.rule) { setMessage(payload?.error || "规则更新失败，请稍后重试。"); return; }
      router.refresh();
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "规则更新失败，请稍后重试。");
    }
  };

  const removeRule = async (rule: ModerationRule) => {
    setDeleteRule(rule);
  };

  const confirmRemoveRule = async () => {
    if (!deleteRule) return;
    const rule = deleteRule;
    setDeleteRule(null);
    setBusy(rule.id); setMessage("");
    try {
      const response = await fetchWithTimeout(`/api/admin/moderation-rules?id=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setBusy(null);
      if (!response.ok) { setMessage(payload?.error || "规则删除失败，请稍后重试。"); return; }
      router.refresh();
      setMessage("规则已删除。");
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "规则删除失败，请稍后重试。");
    }
  };

  const searchUsers = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setUserLoading(true); setUserError(""); setUserSearched(true);
    const params = new URLSearchParams({ query: userQuery.trim(), limit: "50" });
    try {
      const response = await fetchWithTimeout(`/api/admin/users?${params.toString()}`);
      const payload = await response.json().catch(() => null) as { error?: string; users?: UserSearchRow[] } | null;
      setUserLoading(false);
      if (!response.ok || !payload?.users) {
        setUserError(payload?.error || "用户搜索失败，请稍后重试。");
        setUserResults([]);
        return;
      }
      setUserResults(payload.users);
    } catch (error) {
      setUserLoading(false);
      setUserError(error instanceof Error ? error.message : "用户搜索失败，请稍后重试。");
      setUserResults([]);
    }
  };

  const runGlobalSearch = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const value = globalQuery.trim();
    if (value.length < 2) { setGlobalError("请输入至少 2 个字符后再搜索。"); return; }
    setGlobalLoading(true); setGlobalError(""); setGlobalResults(null);
    const params = new URLSearchParams({ q: value });
    try {
      const response = await fetchWithTimeout(`/api/admin/global-search?${params.toString()}`);
      const payload = await response.json().catch(() => null) as { error?: string } & GlobalSearchResults | null;
      setGlobalLoading(false);
      if (!response.ok || !payload) {
        setGlobalError(payload?.error || "全局搜索失败，请稍后重试。");
        setGlobalResults(null);
        return;
      }
      setGlobalResults({ posts: payload.posts || [], series: payload.series || [], users: payload.users || [], reports: payload.reports || [], feedbacks: payload.feedbacks || [] });
    } catch (error) {
      setGlobalLoading(false);
      setGlobalError(error instanceof Error ? error.message : "全局搜索失败，请稍后重试。");
      setGlobalResults(null);
    }
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    sessionStorage.setItem(queryKey, value);
  };

  const rememberListScroll = () => {
    sessionStorage.setItem(scrollKey, String(window.scrollY));
  };

  const signOut = async () => {
    setBusy("signout");
    const { error } = await supabase.auth.signOut();
    if (error) { setBusy(null); setMessage("退出失败，请重新尝试。"); return; }
    router.replace("/admin/login");
    router.refresh();
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPasswordError("");
    if (newPassword.length < 8) { setPasswordError("新密码至少需要8位。"); return; }
    if (newPassword !== confirmPassword) { setPasswordError("两次输入的新密码不一致。"); return; }
    if (currentPassword === newPassword) { setPasswordError("新密码不能与当前密码相同。"); return; }

    setBusy("password");
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: currentPassword });
    if (verifyError) { setBusy(null); setPasswordError("当前密码不正确。"); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(null);
    if (updateError) { setPasswordError("密码修改失败，请稍后重试。"); return; }

    setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordDialogOpen(false); setMessage("密码修改成功。");
  };

  const filteredPosts = posts.filter((post) => `${post.title} ${post.author?.nickname || ""}`.toLowerCase().includes(query.toLowerCase()));
  const filteredReports = reports.filter((report) => `${report.target_title || ""} ${report.primary_reason_category || ""} ${report.author_nickname || ""} ${report.target_id}`.toLowerCase().includes(query.toLowerCase()));
  const filteredFeedbacks = feedbacks.filter((feedback) => `${feedback.type} ${feedback.content} ${feedback.user_id}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRules = rules.filter((rule) => `${rule.pattern} ${rule.category} ${rule.description || ""}`.toLowerCase().includes(query.toLowerCase()));
  const reportLink = (report: ReportItem) => `/admin/reports/${report.id}`;

  const reportsView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-purple" /><h2>待处理举报</h2><span className="admin-count-pill">{filteredReports.length} 个案件</span></div><p>同一对象的多条举报会合并为一个案件；必须进入详情页查看完整证据后再处理。</p></div></div><div className="admin-queue-list">{filteredReports.length === 0 ? <div className="admin-empty"><div className="admin-empty-icon"><Icon name="check" /></div><strong>没有符合条件的举报案件</strong></div> : filteredReports.map((report) => <div className="admin-queue-row" key={report.id}><div className="admin-queue-badge">{labels[report.target_type] || "对象"}</div><div className="admin-queue-main"><strong>{report.target_title || "未知对象"}</strong><span>{report.primary_reason_category || "未填写原因"} · {report.report_count} 人举报 · 首次 {fmt(report.first_reported_at)} · 最近 {fmt(report.last_reported_at)}{report.author_nickname ? ` · ${report.author_nickname}` : ""}</span></div>{report.priority !== "normal" ? <span className="admin-queue-badge badge-blue">{report.priority === "urgent" ? "紧急" : "优先"}</span> : null}<Link className="admin-btn admin-btn-primary" href={reportLink(report)}>打开详情页</Link></div>)}</div></section>;

  const postsView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-orange" /><h2>发布前人工审核</h2><span className="admin-count-pill">{filteredPosts.length + seriesReviews.length} 条</span></div><p>连载信息和连载章节分开列出；打开详情页查看完整内容与风险结果后，再决定放行或打回。</p></div></div><div className="admin-table">{filteredPosts.length === 0 && seriesReviews.length === 0 ? <div className="admin-empty"><strong>没有符合条件的待审核作品</strong></div> : <>{filteredPosts.map((post) => <div className="admin-table-row" key={post.id}><div className="admin-work-cell"><div className="admin-work-thumb">{post.title.slice(0, 1)}</div><div><strong>{post.title || "无标题"}</strong><span>{post.post_type === "serial" ? "连载章节（章节标题/正文）" : labels[post.post_type || ""] || "作品"}{post.review_reason ? ` · ${post.review_reason}` : ""}</span></div></div><span className="admin-author-cell">{post.author?.nickname || "未知作者"}</span><span className="admin-date-cell">{fmt(post.created_at)}</span><div className="admin-row-actions"><Link className="admin-btn admin-btn-primary" href={`/admin/reviews/${post.id}`}>查看章节审核</Link></div></div>)}{seriesReviews.map((item) => <div className="admin-table-row" key={`series-${item.id}`}><div className="admin-work-cell"><div className="admin-work-thumb">连</div><div><strong>{item.series?.name || "未命名连载"}</strong><span>连载信息（名称/简介） · {item.route_reason}</span></div></div><span className="admin-author-cell">作者 ID {item.series?.user_id?.slice(0, 8) || "未知"}</span><span className="admin-date-cell">{fmt(item.created_at)}</span><div className="admin-row-actions"><Link className="admin-btn admin-btn-primary" href={`/admin/series-reviews/${item.series_id}`}>查看连载审核</Link></div></div>)}</>}</div></section>;

  const feedbacksView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div className="admin-heading-line"><span className="admin-section-dot dot-blue" /><h2>反馈收件箱</h2></div></div><div className="admin-queue-list">{filteredFeedbacks.length === 0 ? <div className="admin-empty"><strong>没有符合条件的用户反馈</strong></div> : filteredFeedbacks.map((item) => <div className="admin-queue-row" key={item.id}><div className="admin-queue-badge badge-blue">{item.type}</div><div className="admin-queue-main"><strong>{item.content}</strong><span>{fmt(item.created_at)} · 用户 {item.user_id.slice(0, 8)}</span></div><button className="admin-btn admin-btn-light" disabled={busy === item.id} onClick={() => void handleFeedback(item.id)}>标记已处理</button></div>)}</div></section>;

  const rulesView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-green" /><h2>关键词与白名单</h2><span className="admin-count-pill">{filteredRules.length} 条</span></div><p>关键词命中会进入人工审核；白名单可排除明确的误判表达。</p></div>{rulesReady && <button className="admin-btn admin-btn-primary" type="button" onClick={() => { resetRuleForm(); setRuleDialogOpen(true); }}>添加规则</button>}</div>{!rulesReady ? <div className="admin-empty"><strong>审核规则数据表尚未启用</strong><span>本地功能已完成；待确认数据库迁移后即可开始维护词库。</span></div> : <div className="admin-queue-list">{filteredRules.length === 0 ? <div className="admin-empty"><strong>还没有规则</strong><span>建议先添加少量明确的广告导流或诈骗关键词，全部先设为“进入人工审核”。</span></div> : filteredRules.map((rule) => <div className="admin-rule-row" key={rule.id}><div className={`admin-rule-kind ${rule.rule_type === "whitelist" ? "is-whitelist" : ""}`}>{rule.rule_type === "whitelist" ? "白名单" : "关键词"}</div><div className="admin-queue-main"><strong>{rule.pattern}</strong><span>{rule.category} · {rule.severity === "high" ? "高风险，优先审核" : "命中后人工审核"}{rule.description ? ` · ${rule.description}` : ""}</span></div><span className={`admin-rule-status ${rule.enabled ? "is-enabled" : ""}`}>{rule.enabled ? "已启用" : "已停用"}</span><div className="admin-actions"><button className="admin-btn admin-btn-light" disabled={busy === rule.id} onClick={() => void updateRuleEnabled(rule)}>{rule.enabled ? "停用" : "启用"}</button><button className="admin-btn admin-btn-light" disabled={busy === rule.id} onClick={() => void removeRule(rule)}>删除</button></div></div>)}</div>}</section>;

  const usersView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-teal" /><h2>用户搜索</h2><span className="admin-count-pill">{userSearched ? `${userResults.length} 位用户` : "输入关键词查询"}</span></div><p>按昵称或用户 ID 搜索；打开详情页可查看举报、违规与限制记录并执行处罚。</p></div></div><form className="admin-user-search" onSubmit={searchUsers}><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="昵称或完整用户 ID" aria-label="搜索用户" /><button className="admin-btn admin-btn-primary" type="submit" disabled={userLoading}>{userLoading ? "搜索中…" : "搜索"}</button></form>{userError ? <div className="admin-alert admin-alert-error" role="alert">{userError}</div> : null}<div className="admin-queue-list">{!userSearched ? <div className="admin-empty"><strong>还没有搜索</strong><span>输入昵称或用户 ID 后开始查询。</span></div> : userResults.length === 0 ? <div className="admin-empty"><strong>没有找到该用户</strong><span>昵称支持模糊匹配，ID 支持完整值。</span></div> : userResults.map((user) => <div className="admin-queue-row" key={user.id}><span className="admin-user-avatar admin-user-avatar-empty">{(user.nickname || "用").slice(0, 1)}</span><div className="admin-queue-main"><strong>{user.nickname || "未命名用户"}</strong><span className="admin-mono">{user.id}</span><span>{userStatusLabels[user.moderation_status] || user.moderation_status} · 举报案件 {user.total_report_cases} · 待处理 {user.pending_report_cases} · 有效违规 {user.active_violations} · 有效限制 {user.active_restrictions}</span></div><Link className="admin-btn admin-btn-primary" href={`/admin/users/${user.id}`}>查看详情</Link></div>)}</div></section>;

  const content = initialView === "reviews" ? postsView : initialView === "reports" ? reportsView : initialView === "feedbacks" ? feedbacksView : initialView === "rules" ? rulesView : initialView === "users" ? usersView : <section className="admin-card admin-full-card"><div className="admin-coming-soon"><Icon name="users" /><strong>页面尚未接入</strong><span>请从左侧选择后台功能。</span></div></section>;

  return <div className="admin-app-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span className="admin-brand-mark">i</span><span>inkland</span><small>OPERATIONS</small></div>
      <div className="admin-nav-group"><p>后台功能</p>{nav.map((item) => <Link className={`admin-nav-item ${initialView === item.view ? "is-active" : ""}`} href={`/admin?view=${item.view}`} key={item.view} onClick={rememberListScroll} aria-current={initialView === item.view ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}</Link>)}</div>
      <div className="admin-sidebar-user"><span className="admin-avatar">{adminName.slice(0, 1)}</span><div><strong>{adminName}</strong><small>{adminEmail}</small></div><button type="button" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen}>账户</button>{accountMenuOpen && <div className="admin-account-menu"><button type="button" onClick={() => { setPasswordError(""); setPasswordDialogOpen(true); setAccountMenuOpen(false); }}><Icon name="lock" />修改密码</button><button type="button" className="danger" disabled={busy === "signout"} onClick={() => void signOut()}><Icon name="logout" />{busy === "signout" ? "退出中…" : "退出登录"}</button></div>}</div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-breadcrumb"><span>管理后台</span><Icon name="arrow" /><strong>{viewCopy[initialView].title}</strong></div><div className="admin-top-actions"><button className="admin-btn admin-btn-light admin-global-search-btn" type="button" onClick={() => { setGlobalQuery(""); setGlobalError(""); setGlobalResults(null); setGlobalSearchOpen(true); }}><Icon name="search" />全局搜索</button><label className="admin-search"><Icon name="search" /><input value={query} onChange={(event) => handleQueryChange(event.target.value)} placeholder="搜索当前列表" aria-label="搜索当前列表" /></label><span className="admin-live"><i />后台已连接</span></div></header><div className="admin-content"><div className="admin-page-title"><div><p className="admin-eyebrow">INKLAND OPERATIONS</p><h1>{viewCopy[initialView].title}</h1><p>{viewCopy[initialView].description}</p></div><button className="admin-btn admin-btn-light" type="button" onClick={() => window.location.reload()}>刷新数据</button></div>{loadErrors.length > 0 && <div className="admin-alert admin-alert-error" role="alert">部分数据加载失败，请检查数据库配置。</div>}{message && <div className="admin-toast" role="status">{message}</div>}{content}</div></main>
    {passwordDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordDialogOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title" onSubmit={changePassword}><div className="admin-modal-header"><div><h2 id="change-password-title">修改管理员密码</h2><p className="admin-modal-desc">需要先验证当前密码。新密码至少8位。</p></div></div><label className="admin-field">当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="admin-field">新密码<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label><label className="admin-field">再次输入新密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>{passwordError && <div className="admin-alert admin-alert-error" role="alert">{passwordError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "password"} onClick={() => setPasswordDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === "password"}>{busy === "password" ? "保存中…" : "确认修改"}</button></div></form></div>}
    {ruleDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRuleDialogOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="create-rule-title" onSubmit={createRule}><div className="admin-modal-header"><div><h2 id="create-rule-title">添加审核规则</h2><p className="admin-modal-desc">先从少量明确的表达开始。除非以后另行调整，规则不会自动删除内容。</p></div></div><label className="admin-field">规则类型<select value={ruleType} onChange={(event) => setRuleType(event.target.value as ModerationRule["rule_type"])}><option value="keyword">关键词：命中后进入人工审核</option><option value="whitelist">白名单：排除已知误判表达</option></select></label><label className="admin-field">词语或短语<input value={rulePattern} onChange={(event) => setRulePattern(event.target.value)} maxLength={500} required /></label><label className="admin-field">问题分类<select value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value)}><option>广告与导流</option><option>诈骗与交易风险</option><option>人身攻击与骚扰</option><option>暴力与威胁</option><option>成人与不当内容</option><option>其他</option></select></label><label className="admin-field">风险级别<select value={ruleSeverity} disabled={ruleType === "whitelist"} onChange={(event) => setRuleSeverity(event.target.value as ModerationRule["severity"])}><option value="review">进入人工审核</option><option value="high">高风险，优先审核</option></select></label><label className="admin-field">备注（可选）<input value={ruleDescription} onChange={(event) => setRuleDescription(event.target.value)} maxLength={500} /></label>{ruleError && <div className="admin-alert admin-alert-error" role="alert">{ruleError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "create-rule"} onClick={() => setRuleDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === "create-rule"}>{busy === "create-rule" ? "保存中…" : "保存规则"}</button></div></form></div>}
    {deleteRule ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== deleteRule.id) setDeleteRule(null); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-rule-title"><div className="admin-modal-header"><div><h2 id="delete-rule-title">删除这条规则？</h2><p className="admin-modal-desc">确定删除规则“{deleteRule.pattern}”吗？删除后不影响已有审核记录。</p></div></div><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === deleteRule.id} onClick={() => setDeleteRule(null)}>取消</button><button className="admin-btn admin-btn-danger-fill" type="button" disabled={busy === deleteRule.id} onClick={() => void confirmRemoveRule()}>{busy === deleteRule.id ? "删除中…" : "确认删除"}</button></div></div></div> : null}
    {globalSearchOpen ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !globalLoading) setGlobalSearchOpen(false); }}><div className="admin-modal admin-global-search-modal" role="dialog" aria-modal="true" aria-labelledby="global-search-title"><div className="admin-modal-header"><div><h2 id="global-search-title">全局搜索</h2><p className="admin-modal-desc">搜索作品、连载、用户、举报案件与用户反馈。</p></div></div><form className="admin-global-search-form" onSubmit={runGlobalSearch}><input value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="输入关键词" aria-label="全局搜索关键词" autoFocus /><button className="admin-btn admin-btn-primary" type="submit" disabled={globalLoading}>{globalLoading ? "搜索中…" : "搜索"}</button></form>{globalError ? <div className="admin-alert admin-alert-error" role="alert">{globalError}</div> : null}{globalResults ? <div className="admin-global-search-results">{(() => {
        const groups = [
          { key: "posts", label: "作品", rows: globalResults.posts.map((item) => ({ key: item.id, title: item.title, meta: `${item.post_type || "作品"} · ${item.review_status === "pending" ? "待审核" : item.status || "已发布"}${item.author_nickname ? ` · ${item.author_nickname}` : ""}`, href: item.href })) },
          { key: "series", label: "连载", rows: globalResults.series.map((item) => ({ key: item.id, title: item.name, meta: `${item.review_status === "pending" ? "待审核" : item.status || ""}`, href: item.href })) },
          { key: "users", label: "用户", rows: globalResults.users.map((item) => ({ key: item.id, title: item.nickname, meta: `${userStatusLabels[item.moderation_status] || item.moderation_status}`, href: item.href })) },
          { key: "reports", label: "举报案件", rows: globalResults.reports.map((item) => ({ key: item.id, title: item.title, meta: `${labels[item.target_type] || "对象"} · ${statusLabelsForSearch(item.status)}`, href: item.href })) },
          { key: "feedbacks", label: "用户反馈", rows: globalResults.feedbacks.map((item) => ({ key: item.id, title: item.type, meta: item.content, href: item.href })) },
        ].filter((group) => group.rows.length > 0);
        const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
        if (total === 0) return <div className="admin-empty"><strong>没有找到匹配结果</strong></div>;
        return <>{groups.map((group) => <div className="admin-global-group" key={group.key}><h3>{group.label}<span>{group.rows.length}</span></h3>{group.rows.map((row) => row.href ? <Link className="admin-global-result" href={row.href} key={row.key} onClick={rememberListScroll}><strong>{row.title}</strong><span>{row.meta}</span></Link> : <div className="admin-global-result" key={row.key}><strong>{row.title}</strong><span>{row.meta}</span></div>)}</div>)}</>;
      })()}</div> : null}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={globalLoading} onClick={() => setGlobalSearchOpen(false)}>关闭</button></div></div></div> : null}
  </div>;
}
