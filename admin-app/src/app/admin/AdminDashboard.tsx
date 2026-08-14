"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-browser";
import { useAdminDialog } from "@/components/AdminDialogProvider";

type ReviewCaseItem = {
  id: string;
  post_id: string;
  post_version_id: string;
  status: string;
  priority: string | null;
  route_reason: string | null;
  screening_status: string | null;
  screening_sources: string[] | null;
  submission_number: number | null;
  created_at: string;
  updated_at: string | null;
  version?: {
    id?: string;
    version_number?: number | null;
    submission_number?: number | null;
    title?: string | null;
    post_type?: string | null;
    content_rating?: string | null;
    visibility?: string | null;
    submitted_at?: string | null;
    created_at?: string | null;
  } | null;
  post?: {
    id?: string;
    title?: string | null;
    post_type?: string | null;
    content_rating?: string | null;
    status?: string | null;
    review_submission_number?: number | null;
    author?: { nickname?: string } | null;
  } | null;
  findings_count?: number | null;
};
type ReportItem = { id: string; target_type: string; target_id: string; reason: string; status: string; created_at: string; reporter?: { nickname?: string } | null; source?: "content" | "comment" };
type FeedbackItem = { id: string; type: string; content: string; created_at: string; user_id: string };
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
export type AdminView = "reviews" | "reports" | "users" | "feedbacks" | "rules";

const labels: Record<string, string> = { post: "作品", comment: "评论", user: "用户", novel: "小说", article: "文章", illustration: "插画", serial: "连载" };
const viewCopy: Record<AdminView, { title: string; description: string }> = {
  reviews: { title: "作品审核", description: "处理发布前进入人工审核队列的作品。" },
  reports: { title: "举报中心", description: "进入独立详情页查看完整内容和举报证据。" },
  users: { title: "用户管理", description: "查询用户、违规记录和功能限制。" },
  feedbacks: { title: "用户反馈", description: "查看用户提交的网站问题和建议。" },
  rules: { title: "审核规则", description: "维护关键词与白名单；命中规则只会进入人工审核，不会自动删除作品。" },
};
const fmt = (value: string) => new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
const reviewFilterOptions: Array<{ key: "pending" | "high_risk" | "service_error" | "first_submission" | "resubmission" | "text" | "image"; label: string }> = [
  { key: "pending", label: "待人工审核" },
  { key: "high_risk", label: "高风险" },
  { key: "service_error", label: "服务异常" },
  { key: "first_submission", label: "首次提交" },
  { key: "resubmission", label: "重新提交" },
  { key: "text", label: "文字作品" },
  { key: "image", label: "图片作品" },
];
const ratingLabel = (value?: string | null) => (value === "all" ? "全年龄" : value === "r15" ? "15+" : value === "r18" ? "18+" : value || "未评级");

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

export default function AdminDashboard({ initialReviews, initialReports, initialFeedbacks, initialRules, rulesReady, loadErrors, initialView, adminName = "管理员", adminEmail }: {
  initialReviews: ReviewCaseItem[];
  initialReports: ReportItem[];
  initialFeedbacks: FeedbackItem[];
  initialRules: ModerationRule[];
  rulesReady: boolean;
  loadErrors: string[];
  initialView: AdminView;
  adminName?: string;
  adminEmail: string;
}) {
  const router = useRouter();
  const dialog = useAdminDialog();
  const [supabase] = useState(() => createAdminClient());
  const [reviews, setReviews] = useState(initialReviews);
  const [reports, setReports] = useState(initialReports);
  const [feedbacks, setFeedbacks] = useState(initialFeedbacks);
  const [rules, setRules] = useState(initialRules);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [reviewFilters, setReviewFilters] = useState<Set<string>>(new Set());
  const [ruleError, setRuleError] = useState("");
  const [ruleType, setRuleType] = useState<ModerationRule["rule_type"]>("keyword");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCategory, setRuleCategory] = useState("广告与导流");
  const [ruleSeverity, setRuleSeverity] = useState<ModerationRule["severity"]>("review");
  const [ruleDescription, setRuleDescription] = useState("");

  useEffect(() => {
    setReviews(initialReviews);
    setReports(initialReports);
    setFeedbacks(initialFeedbacks);
    setRules(initialRules);
  }, [initialReviews, initialReports, initialFeedbacks, initialRules]);

  useEffect(() => {
    if (initialView !== "reviews" && initialView !== "reports") return;
    const refreshTimer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(refreshTimer);
  }, [initialView, router]);

  const nav: Array<{ view: AdminView; label: string; icon: "file" | "flag" | "users" | "message" | "lock"; count?: number }> = [
    { view: "reviews", label: "作品审核", icon: "file", count: reviews.length },
    { view: "reports", label: "举报中心", icon: "flag", count: reports.length },
    { view: "users", label: "用户管理", icon: "users" },
    { view: "feedbacks", label: "用户反馈", icon: "message", count: feedbacks.length },
    { view: "rules", label: "审核规则", icon: "lock", count: rules.length || undefined },
  ];

  const handleFeedback = async (id: string) => {
    setBusy(id); setMessage("");
    const response = await fetch("/api/admin/feedbacks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackId: id, status: "resolved" }) });
    setBusy(null);
    if (!response.ok) { setMessage("反馈处理失败，请稍后重试。"); return; }
    setFeedbacks((items) => items.filter((item) => item.id !== id));
    setMessage("反馈已标记为处理完成。");
  };

  const resetRuleForm = () => {
    setRuleError(""); setRuleType("keyword"); setRulePattern(""); setRuleCategory("广告与导流"); setRuleSeverity("review"); setRuleDescription("");
  };

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pattern = rulePattern.trim();
    if (!pattern) { setRuleError("请填写词语或短语。"); return; }
    setBusy("create-rule"); setRuleError("");
    const response = await fetch("/api/admin/moderation-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleType, pattern, category: ruleCategory, severity: ruleSeverity, description: ruleDescription.trim() || null }) });
    const payload = await response.json().catch(() => null) as { error?: string; rule?: ModerationRule } | null;
    setBusy(null);
    if (!response.ok || !payload?.rule) { setRuleError(payload?.error || "规则保存失败，请稍后重试。"); return; }
    setRules((items) => [payload.rule!, ...items]);
    setRuleDialogOpen(false); resetRuleForm(); setMessage("规则已添加。新规则只会影响之后提交的内容。");
  };

  const updateRuleEnabled = async (rule: ModerationRule) => {
    setBusy(rule.id); setMessage("");
    const response = await fetch("/api/admin/moderation-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }) });
    const payload = await response.json().catch(() => null) as { error?: string; rule?: ModerationRule } | null;
    setBusy(null);
    if (!response.ok || !payload?.rule) { setMessage(payload?.error || "规则更新失败，请稍后重试。"); return; }
    setRules((items) => items.map((item) => item.id === rule.id ? payload.rule! : item));
  };

  const removeRule = async (rule: ModerationRule) => {
    if (!await dialog.confirm({ title:"删除审核规则", message:`确定删除规则“${rule.pattern}”吗？删除后不影响已有审核记录。`, confirmLabel:"删除规则", variant:"danger" })) return;
    setBusy(rule.id); setMessage("");
    const response = await fetch(`/api/admin/moderation-rules?id=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(null);
    if (!response.ok) { setMessage(payload?.error || "规则删除失败，请稍后重试。"); return; }
    setRules((items) => items.filter((item) => item.id !== rule.id));
    setMessage("规则已删除。");
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

  const typeOfReview = (item: ReviewCaseItem) => item.version?.post_type || item.post?.post_type || "";
  const isImageReview = (item: ReviewCaseItem) => typeOfReview(item) === "illustration";
  const isFirstReviewSubmission = (item: ReviewCaseItem) => (item.submission_number ?? item.version?.submission_number ?? item.post?.review_submission_number ?? 1) <= 1;
  const isReviewServiceError = (item: ReviewCaseItem) => item.status === "service_error" || item.screening_status === "failed";
  const isPendingReview = (item: ReviewCaseItem) => item.status === "pending" || item.status === "reviewing";
  const matchesReviewFilter = (key: string, item: ReviewCaseItem) => {
    switch (key) {
      case "pending": return isPendingReview(item);
      case "high_risk": return item.priority === "high";
      case "service_error": return isReviewServiceError(item);
      case "first_submission": return isFirstReviewSubmission(item);
      case "resubmission": return !isFirstReviewSubmission(item);
      case "text": return !isImageReview(item);
      case "image": return isImageReview(item);
      default: return true;
    }
  };
  const toggleReviewFilter = (key: string) => {
    setReviewFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const filteredReviews = reviews.filter((item) => reviewFilters.size === 0 || [...reviewFilters].every((key) => matchesReviewFilter(key, item))).filter((item) => `${item.version?.title || item.post?.title || ""} ${item.post?.author?.nickname || ""}`.toLowerCase().includes(query.toLowerCase()));
  const highRiskReviewCount = reviews.filter((item) => item.priority === "high").length;
  const serviceErrorReviewCount = reviews.filter((item) => isReviewServiceError(item)).length;
  const filteredReports = reports.filter((report) => `${report.reason} ${report.reporter?.nickname || ""} ${report.target_id}`.toLowerCase().includes(query.toLowerCase()));
  const filteredFeedbacks = feedbacks.filter((feedback) => `${feedback.type} ${feedback.content} ${feedback.user_id}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRules = rules.filter((rule) => `${rule.pattern} ${rule.category} ${rule.description || ""}`.toLowerCase().includes(query.toLowerCase()));
  const reportLink = (report: ReportItem) => `/admin/reports/${report.id}?source=${report.source || "content"}`;

  const reportsView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-purple" /><h2>待处理举报</h2><span className="admin-count-pill">{filteredReports.length} 条</span></div><p>必须进入详情页查看完整证据后再处理。</p></div></div><div className="admin-queue-list">{filteredReports.length === 0 ? <div className="admin-empty"><div className="admin-empty-icon"><Icon name="check" /></div><strong>没有符合条件的举报</strong></div> : filteredReports.map((report) => <div className="admin-queue-row" key={`${report.source}-${report.id}`}><div className="admin-queue-badge">{labels[report.target_type] || "对象"}</div><div className="admin-queue-main"><strong>{report.reason}</strong><span>举报人：{report.reporter?.nickname || "匿名"} · {fmt(report.created_at)} · ID {report.target_id.slice(0, 8)}</span></div><Link className="admin-btn admin-btn-primary" href={reportLink(report)}>打开详情页</Link></div>)}</div></section>;

  const reviewsView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-orange" /><h2>发布前人工审核</h2><span className="admin-count-pill">{filteredReviews.length} 条</span></div><p>打开详情页查看完整作品、原图和系统风险结果后，再决定放行或打回；列表不提供直接处理。</p></div></div>{(highRiskReviewCount > 0 || serviceErrorReviewCount > 0) && <div className="admin-alert" role="status"><span>队列中有 {highRiskReviewCount} 个高风险案件、{serviceErrorReviewCount} 个服务异常案件，建议优先处理。</span><Link href="/admin?view=reviews">前往审核</Link></div>}<div className="admin-filter-row">{reviewFilterOptions.map((option) => { const count = reviews.filter((item) => matchesReviewFilter(option.key, item)).length; return <button key={option.key} type="button" className={`admin-filter${reviewFilters.has(option.key) ? " is-selected" : ""}`} onClick={() => toggleReviewFilter(option.key)} aria-pressed={reviewFilters.has(option.key)}>{option.label}{count > 0 ? <span>{count}</span> : null}</button>; })}</div><div className="admin-queue-list">{filteredReviews.length === 0 ? <div className="admin-empty"><div className="admin-empty-icon"><Icon name="check" /></div><strong>没有符合条件的待审核作品</strong><span>新提交进入人工审核后会显示在这里。</span></div> : filteredReviews.map((item) => { const submission = item.submission_number ?? item.version?.submission_number ?? item.post?.review_submission_number ?? 1; return <div className="admin-queue-row" key={item.id}><div className="admin-queue-badge">{labels[typeOfReview(item)] || "作品"}</div><div className="admin-queue-main"><strong>{item.version?.title || item.post?.title || "无标题"}</strong><span>{item.post?.author?.nickname || "未知作者"} · 评级 {ratingLabel(item.version?.content_rating || item.post?.content_rating)} · {fmt(item.version?.submitted_at || item.version?.created_at || item.created_at)} · 第 {submission} 次提交</span><div className="admin-queue-tags">{item.status === "reviewing" ? <span className="admin-queue-tag">审核中</span> : <span className="admin-queue-tag">待人工审核</span>}{item.priority === "high" ? <span className="admin-queue-tag is-danger">高风险</span> : null}{isReviewServiceError(item) ? <span className="admin-queue-tag is-danger">服务异常</span> : null}{isFirstReviewSubmission(item) ? <span className="admin-queue-tag">首次提交</span> : <span className="admin-queue-tag">重新提交</span>}{item.findings_count ? <span className="admin-queue-tag">{item.findings_count} 条问题</span> : null}{item.route_reason ? <span className="admin-queue-tag is-muted">{item.route_reason}</span> : null}</div></div><Link className="admin-btn admin-btn-primary" href={`/admin/reviews/${item.id}`}>查看审核</Link></div>; })}</div></section>;

  const feedbacksView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div className="admin-heading-line"><span className="admin-section-dot dot-blue" /><h2>反馈收件箱</h2></div></div><div className="admin-queue-list">{filteredFeedbacks.length === 0 ? <div className="admin-empty"><strong>没有符合条件的用户反馈</strong></div> : filteredFeedbacks.map((item) => <div className="admin-queue-row" key={item.id}><div className="admin-queue-badge badge-blue">{item.type}</div><div className="admin-queue-main"><strong>{item.content}</strong><span>{fmt(item.created_at)} · 用户 {item.user_id.slice(0, 8)}</span></div><button className="admin-btn admin-btn-light" disabled={busy === item.id} onClick={() => void handleFeedback(item.id)}>标记已处理</button></div>)}</div></section>;

  const rulesView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-green" /><h2>关键词与白名单</h2><span className="admin-count-pill">{filteredRules.length} 条</span></div><p>关键词命中会进入人工审核；白名单可排除明确的误判表达。</p></div>{rulesReady && <button className="admin-btn admin-btn-primary" type="button" onClick={() => { resetRuleForm(); setRuleDialogOpen(true); }}>添加规则</button>}</div>{!rulesReady ? <div className="admin-empty"><strong>审核规则数据表尚未启用</strong><span>本地功能已完成；待确认数据库迁移后即可开始维护词库。</span></div> : <div className="admin-queue-list">{filteredRules.length === 0 ? <div className="admin-empty"><strong>还没有规则</strong><span>建议先添加少量明确的广告导流或诈骗关键词，全部先设为“进入人工审核”。</span></div> : filteredRules.map((rule) => <div className="admin-rule-row" key={rule.id}><div className={`admin-rule-kind ${rule.rule_type === "whitelist" ? "is-whitelist" : ""}`}>{rule.rule_type === "whitelist" ? "白名单" : "关键词"}</div><div className="admin-queue-main"><strong>{rule.pattern}</strong><span>{rule.category} · {rule.severity === "high" ? "高风险，优先审核" : "命中后人工审核"}{rule.description ? ` · ${rule.description}` : ""}</span></div><span className={`admin-rule-status ${rule.enabled ? "is-enabled" : ""}`}>{rule.enabled ? "已启用" : "已停用"}</span><div className="admin-actions"><button className="admin-btn admin-btn-light" disabled={busy === rule.id} onClick={() => void updateRuleEnabled(rule)}>{rule.enabled ? "停用" : "启用"}</button><button className="admin-btn admin-btn-light" disabled={busy === rule.id} onClick={() => void removeRule(rule)}>删除</button></div></div>)}</div>}</section>;

  const content = initialView === "reviews" ? reviewsView : initialView === "reports" ? reportsView : initialView === "feedbacks" ? feedbacksView : initialView === "rules" ? rulesView : <section className="admin-card admin-full-card"><div className="admin-coming-soon"><Icon name="users" /><strong>用户管理将在模块6接入</strong><span>当前不会使用假用户数据填充页面。</span></div></section>;

  return <div className="admin-app-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span className="admin-brand-mark">i</span><span>inkland</span><small>OPERATIONS</small></div>
      <div className="admin-nav-group"><p>后台功能</p>{nav.map((item) => <Link className={`admin-nav-item ${initialView === item.view ? "is-active" : ""}`} href={`/admin?view=${item.view}`} key={item.view} aria-current={initialView === item.view ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}</Link>)}</div>
      <div className="admin-sidebar-user"><span className="admin-avatar">{adminName.slice(0, 1)}</span><div><strong>{adminName}</strong><small>{adminEmail}</small></div><button type="button" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen}>账户</button>{accountMenuOpen && <div className="admin-account-menu"><button type="button" onClick={() => { setPasswordError(""); setPasswordDialogOpen(true); setAccountMenuOpen(false); }}><Icon name="lock" />修改密码</button><button type="button" className="danger" disabled={busy === "signout"} onClick={() => void signOut()}><Icon name="logout" />{busy === "signout" ? "退出中…" : "退出登录"}</button></div>}</div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-breadcrumb"><span>管理后台</span><Icon name="arrow" /><strong>{viewCopy[initialView].title}</strong></div><div className="admin-top-actions"><label className="admin-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前列表" aria-label="搜索当前列表" /></label><span className="admin-live"><i />后台已连接</span></div></header><div className="admin-content"><div className="admin-page-title"><div><p className="admin-eyebrow">INKLAND OPERATIONS</p><h1>{viewCopy[initialView].title}</h1><p>{viewCopy[initialView].description}</p></div><button className="admin-btn admin-btn-light" type="button" onClick={() => window.location.reload()}>刷新数据</button></div>{loadErrors.length > 0 && <div className="admin-alert admin-alert-error" role="alert">部分数据加载失败，请检查数据库配置。</div>}{message && <div className="admin-toast" role="status">{message}</div>}{content}</div></main>
    {passwordDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordDialogOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title" onSubmit={changePassword}><div className="admin-modal-header"><div><h2 id="change-password-title">修改管理员密码</h2><p className="admin-modal-desc">需要先验证当前密码。新密码至少8位。</p></div></div><label className="admin-field">当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="admin-field">新密码<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label><label className="admin-field">再次输入新密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>{passwordError && <div className="admin-alert admin-alert-error" role="alert">{passwordError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "password"} onClick={() => setPasswordDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === "password"}>{busy === "password" ? "保存中…" : "确认修改"}</button></div></form></div>}
    {ruleDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRuleDialogOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="create-rule-title" onSubmit={createRule}><div className="admin-modal-header"><div><h2 id="create-rule-title">添加审核规则</h2><p className="admin-modal-desc">先从少量明确的表达开始。除非以后另行调整，规则不会自动删除内容。</p></div></div><label className="admin-field">规则类型<select value={ruleType} onChange={(event) => setRuleType(event.target.value as ModerationRule["rule_type"])}><option value="keyword">关键词：命中后进入人工审核</option><option value="whitelist">白名单：排除已知误判表达</option></select></label><label className="admin-field">词语或短语<input value={rulePattern} onChange={(event) => setRulePattern(event.target.value)} maxLength={500} required /></label><label className="admin-field">问题分类<select value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value)}><option>广告与导流</option><option>诈骗与交易风险</option><option>人身攻击与骚扰</option><option>暴力与威胁</option><option>成人与不当内容</option><option>其他</option></select></label><label className="admin-field">风险级别<select value={ruleSeverity} disabled={ruleType === "whitelist"} onChange={(event) => setRuleSeverity(event.target.value as ModerationRule["severity"])}><option value="review">进入人工审核</option><option value="high">高风险，优先审核</option></select></label><label className="admin-field">备注（可选）<input value={ruleDescription} onChange={(event) => setRuleDescription(event.target.value)} maxLength={500} /></label>{ruleError && <div className="admin-alert admin-alert-error" role="alert">{ruleError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "create-rule"} onClick={() => setRuleDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === "create-rule"}>{busy === "create-rule" ? "保存中…" : "保存规则"}</button></div></form></div>}
  </div>;
}
