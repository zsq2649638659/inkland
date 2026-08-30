"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-browser";
import { fetchWithTimeout } from "@/lib/adminFetch";
import ReportCenterClient from "./ReportCenterClient";
import { MODERATION_REASON_OPTIONS, normalizeModerationReason } from "@/lib/moderationReasons";

type PostItem = { id: string; review_case_id: string; title: string; post_type: string | null; created_at: string; user_id: string; review_reason?: string | null; review_priority?: string | null; review_route_reason?: string | null; screening_status?: string | null; review_submission_number?: number | null; author?: { nickname?: string } | null };
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
type FeedbackItem = { id: string; type: string; content: string; status: string; created_at: string; user_id: string };
type SeriesReviewItem = { id: string; series_id: string; status: string; priority: string; route_reason: string; created_at: string; series?: { id: string; name: string; description: string | null; user_id: string } | null };
type ReviewHistoryItem = { id: string; item_type: "post" | "series"; entity_id: string; title: string; post_type: string | null; user_id: string; author_name: string; status: string; screening_status?: string | null; priority?: string | null; route_reason?: string | null; submission_number?: number | null; decided_by?: string | null; decided_at?: string | null; created_at: string; review_reason?: string | null; handler_name: string };
type CommentReviewItem = { id: string; comment_id: string | null; post_id: string | null; author_id: string | null; parent_id: string | null; paragraph_index: number | null; content: string; author_nickname: string; post_title: string; status: string; priority: string; route_reason: string | null; screening_status: string | null; screening_sources: string[]; submission_number?: number | null; decided_by?: string | null; decided_at?: string | null; created_at: string; decision_reason?: string | null };
type UserSearchRow = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
  moderation_note?: string | null;
  moderated_at?: string | null;
  moderation_status: string;
  total_report_cases: number;
  pending_report_cases: number;
  active_violations: number;
  active_restrictions: number;
  total_reports?: number | null;
  last_report_at?: string | null;
  activity_at?: string | null;
};
export type ModerationRule = {
  id: string;
  rule_type: "keyword" | "whitelist";
  pattern: string;
  category: string;
  severity: "review" | "high";
  risk_level: "low" | "medium" | "high";
  min_hits: number;
  description: string | null;
  enabled: boolean;
  hit_count: number;
  updated_at: string;
};
export type ModerationRiskLevel = ModerationRule["risk_level"];
type RuleFilter = "all" | ModerationRiskLevel | "whitelist";
type RuleCounts = { all: number; low: number; medium: number; high: number; whitelist: number };
type RuleListPayload = { rules: ModerationRule[]; total: number; totalPages: number; page: number; pageSize: number; counts: RuleCounts };
type RuleListOptions = { page?: number; pageSize?: number; risk?: RuleFilter; category?: string; q?: string };
type GlobalSearchResults = {
  posts: Array<{ id: string; title: string; post_type: string; status: string; review_status: string; author_nickname: string; href: string | null }>;
  series: Array<{ id: string; name: string; status: string; review_status: string; href: string | null }>;
  users: Array<{ id: string; nickname: string; moderation_status: string; href: string }>;
  reports: Array<{ id: string; title: string; target_type: string; status: string | null; href: string }>;
  feedbacks: Array<{ id: string; type: string; content: string; href: string }>;
};
type BulkImportResult = {
  inserted: number;
  skipped: number;
  invalidLines: number;
  invalidExamples: string[];
  ignoredBlankLines: number;
  duplicatedInBatch: number;
  totalInput: number;
  category: string;
  riskLevel: ModerationRiskLevel;
  minHits: number;
};
export type AdminView = "reviews" | "comments" | "reportwork" | "reportcomment" | "reportuser" | "reports" | "users" | "feedbacks" | "rules";

const labels: Record<string, string> = { post: "作品", comment: "评论", user: "用户", novel: "小说", article: "文章", illustration: "插画", serial: "连载" };
const userStatusLabels: Record<string, string> = { active: "正常", warned: "已警告", restricted: "受限", suspended: "已暂停", banned: "已封禁" };
const statusLabelsForSearch = (status?: string | null) => {
  const labels: Record<string, string> = {
    pending: "待处理",
    reviewing: "处理中",
    resolved: "已处理",
    cancelled: "已取消",
    kept: "已保留",
    reminded: "已提醒",
    deleted: "已删除",
    no_violation: "举报不成立",
    content_case: "已转为内容案件",
    profile_changes: "已要求修改资料",
    warned: "已警告",
    restricted: "已限制功能",
    suspended: "已暂停",
    banned: "已永久封禁",
  };
  return (status && labels[status]) || status || "未知";
};
const viewCopy: Record<AdminView, { title: string; description: string }> = {
  reviews: { title: "作品审核", description: "处理发布前进入人工审核队列的作品。" },
  comments: { title: "评论审核", description: "处理进入人工复核队列的评论、段评和回复。" },
  reportwork: { title: "作品举报", description: "查看作品举报案件、举报规模和处置依据。" },
  reportcomment: { title: "评论举报", description: "查看评论举报案件、原评论和处置依据。" },
  reportuser: { title: "用户举报", description: "查看用户举报案件及其治理记录。" },
  reports: { title: "举报中心", description: "举报按对象与风险分为四个入口，进入详情页查看完整内容和举报证据。" },
  users: { title: "用户管理", description: "查询用户、违规记录和功能限制。" },
  feedbacks: { title: "用户反馈", description: "查看用户提交的网站问题和建议。" },
  rules: { title: "审核规则", description: "维护关键词与白名单；命中规则只会进入人工审核，不会自动删除作品。" },
};
const feedbackTypeLabels: Record<string, string> = {
  feature: "功能建议",
  suggestion: "功能建议",
  bug: "Bug 报告",
  report: "内容举报",
  other: "其他问题",
  "功能建议": "功能建议",
  "Bug 报告": "Bug 报告",
  "内容举报": "内容举报",
  "其他问题": "其他问题",
};
const riskLabels: Record<ModerationRiskLevel, { label: string; shortLabel: string; hits: number }> = {
  low: { label: "低风险 · 满 5 次进审核", shortLabel: "低风险", hits: 5 },
  medium: { label: "中风险 · 满 3 次进审核", shortLabel: "中风险", hits: 3 },
  high: { label: "高风险 · 命中 1 次进审核", shortLabel: "高风险", hits: 1 },
};
const ruleCategoryOptions = MODERATION_REASON_OPTIONS.map((value) => ({ value, label: value }));

function normalizeRuleCategory(category: string) {
  return normalizeModerationReason(category);
}
const formatRiskRule = (risk: ModerationRiskLevel, hits: number) =>
  risk === "high" ? `高风险 · 命中 ${hits} 次进审核` : `${riskLabels[risk].shortLabel} · 满 ${hits} 次进审核`;
const ADMIN_TIME_ZONE = "Asia/Shanghai";
const adminDateKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ADMIN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const fmt = (value: string) => new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", timeZone: ADMIN_TIME_ZONE });
const fmtReviewTime = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  const sameDay = adminDateKey(date) === adminDateKey(now);
  return sameDay
    ? `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ADMIN_TIME_ZONE })}`
    : date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", timeZone: ADMIN_TIME_ZONE }).replace("/", "-");
};
const fmtUserListTime = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ADMIN_TIME_ZONE }) : "—";
const reviewRisk = (priority?: string | null, routeReason?: string | null) => {
  if (priority === "urgent" || priority === "high") return "高";
  if (priority === "low") return "低";
  if (routeReason === "service_error" || routeReason === "服务异常") return "高";
  return "中";
};
const reviewEntry = (routeReason?: string | null, reviewReason?: string | null) => {
  const normalizedReason = normalizeModerationReason(reviewReason) || reviewReason;
  if (routeReason === "service_error" || routeReason === "服务异常") return { label: "服务异常", source: normalizedReason || "审核服务异常" };
  if (routeReason === "resubmission" || routeReason === "修改重提") return { label: "修改重提", source: normalizedReason || "作者重新提交" };
  if (routeReason === "manual" || routeReason === "人工送审") return { label: "人工送审", source: normalizedReason || "管理员提交" };
  return { label: "自动命中", source: normalizedReason || "关键词 / OCR" };
};
const reviewDecision = (status?: string | null) => {
  if (status === "approved") return "已通过";
  if (status === "rejected" || status === "changes_requested") return "已打回";
  if (status === "cancelled") return "已取消";
  return status || "已处理";
};
const commentTypeLabel = (item: Pick<CommentReviewItem, "parent_id" | "paragraph_index">) => item.parent_id ? "回复" : item.paragraph_index !== null ? "段评" : "评论";
const commentRiskLabel = (priority?: string | null) => priority === "high" ? "高" : "中";
const commentEntryLabel = (item: Pick<CommentReviewItem, "screening_status" | "screening_sources">) => item.screening_status === "failed" ? "服务异常" : item.screening_sources.includes("keyword") ? "自动命中" : "人工送审";
const commentSourceLabel = (source: string) => ({ keyword: "违禁词库", semantic: "语义模型", manual: "人工送审" }[source] || source);
const commentStatusLabel = (status?: string | null) => ({ approved: "已放行", reminded: "已提醒", deleted: "已删除", cancelled: "已取消" }[status || ""] || "已处理");

function Icon({ name }: { name: "file" | "flag" | "users" | "message" | "search" | "arrow" | "check" | "x" | "lock" | "logout" | "upload" }) {
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
    upload: "M12 16V4m0 0 5 5m-5-5-5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  };
  return <svg className="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function AdminDashboard({ initialPosts, initialSeriesReviews, initialReviewHistory, initialComments, initialCommentHistory, commentsReady, initialReports, initialFeedbacks, initialRules, initialRuleTotal, rulesReady, loadErrors, initialView, initialQuery = "", adminName = "管理员", adminEmail }: {
  initialPosts: PostItem[];
  initialSeriesReviews: SeriesReviewItem[];
  initialReviewHistory: ReviewHistoryItem[];
  initialComments: CommentReviewItem[];
  initialCommentHistory: CommentReviewItem[];
  commentsReady: boolean;
  initialReports: ReportItem[];
  initialFeedbacks: FeedbackItem[];
  initialRules: ModerationRule[];
  initialRuleTotal?: number;
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
  const reviewHistory = initialReviewHistory;
  const comments = initialComments;
  const commentHistory = initialCommentHistory;
  const reports = initialReports;
  const feedbacks = initialFeedbacks;
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return initialQuery ?? "";
    return sessionStorage.getItem(queryKey) ?? initialQuery ?? "";
  });
  const [ruleRows, setRuleRows] = useState<ModerationRule[]>(() => initialRules.map((rule) => ({ ...rule, category: normalizeRuleCategory(rule.category) })));
  const [ruleTotal, setRuleTotal] = useState(initialRuleTotal ?? initialRules.length);
  const [rulePage, setRulePage] = useState(1);
  const [rulePageSize, setRulePageSize] = useState(100);
  const [ruleTotalPages, setRuleTotalPages] = useState(Math.max(1, Math.ceil((initialRuleTotal ?? initialRules.length) / 100)));
  const [ruleRiskFilter, setRuleRiskFilter] = useState<RuleFilter>("all");
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState("all");
  const [ruleSort, setRuleSort] = useState<"default" | "risk">("default");
  const [ruleCounts, setRuleCounts] = useState<RuleCounts | null>(null);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [ruleLoading, setRuleLoading] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [bulkRiskDialogOpen, setBulkRiskDialogOpen] = useState(false);
  const [bulkCategoryDialogOpen, setBulkCategoryDialogOpen] = useState(false);
  const [bulkTargetCategory, setBulkTargetCategory] = useState<string>(MODERATION_REASON_OPTIONS[8]);
  const [bulkTargetRisk, setBulkTargetRisk] = useState<ModerationRiskLevel>("low");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleType, setRuleType] = useState<ModerationRule["rule_type"]>("keyword");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCategory, setRuleCategory] = useState<string>(MODERATION_REASON_OPTIONS[8]);
  const [ruleRiskLevel, setRuleRiskLevel] = useState<ModerationRiskLevel>("low");
  const [ruleMinHits, setRuleMinHits] = useState("5");
  const [ruleDescription, setRuleDescription] = useState("");
  const [editingRule, setEditingRule] = useState<ModerationRule | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserSearchRow[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userSearched, setUserSearched] = useState(false);
  const [userError, setUserError] = useState("");
  const [userMode, setUserMode] = useState<"all" | "restricted">("restricted");
  const [userStatus, setUserStatus] = useState<"all" | "active" | "warned" | "restricted" | "suspended" | "banned">("all");
  const [userSort, setUserSort] = useState<"reg" | "activity" | "severity">("severity");
  const [allUserResults, setAllUserResults] = useState<UserSearchRow[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [deleteRule, setDeleteRule] = useState<ModerationRule | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalResults, setGlobalResults] = useState<GlobalSearchResults | null>(null);
  const [reviewMode, setReviewMode] = useState<"pending" | "history">("pending");
  const [reviewTypeFilter, setReviewTypeFilter] = useState("all");
  const [reviewRiskFilter, setReviewRiskFilter] = useState("all");
  const [reviewEntryFilter, setReviewEntryFilter] = useState("all");
  const [reviewSort, setReviewSort] = useState<"latest" | "risk">("latest");
  const [commentMode, setCommentMode] = useState<"pending" | "history">("pending");
  const [commentTypeFilter, setCommentTypeFilter] = useState("all");
  const [commentRiskFilter, setCommentRiskFilter] = useState("all");
  const [commentEntryFilter, setCommentEntryFilter] = useState("all");
  const [commentResultFilter, setCommentResultFilter] = useState("all");
  const [commentSort, setCommentSort] = useState<"latest" | "risk">("latest");
  const [feedbackMode, setFeedbackMode] = useState<"pending" | "history">("pending");
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState("all");
  const [feedbackSort, setFeedbackSort] = useState<"latest" | "submissions">("latest");
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkFileMode, setBulkFileMode] = useState<"txt" | "csv" | null>(null);
  const [bulkCategory, setBulkCategory] = useState<string>(MODERATION_REASON_OPTIONS[8]);
  const [bulkRiskLevel, setBulkRiskLevel] = useState<ModerationRiskLevel>("low");
  const [bulkMinHits, setBulkMinHits] = useState("5");
  const [bulkDescription, setBulkDescription] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const ruleSearchTimer = useRef<number | null>(null);

  const loadRules = async (options: RuleListOptions = {}) => {
    const targetPage = Math.max(1, options.page ?? rulePage);
    const targetPageSize = options.pageSize ?? rulePageSize;
    const targetRisk = options.risk ?? ruleRiskFilter;
    const targetCategory = options.category ?? ruleCategoryFilter;
    const targetQuery = options.q ?? query;
    setRuleLoading(true); setRuleError("");
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetPageSize), risk: targetRisk });
    if (targetCategory !== "all") params.set("category", targetCategory);
    const trimmedQuery = targetQuery.trim();
    if (trimmedQuery) params.set("q", trimmedQuery);
    try {
      const response = await fetchWithTimeout(`/api/admin/moderation-rules?${params.toString()}`);
      const payload = await response.json().catch(() => null) as (RuleListPayload & { error?: string }) | null;
      setRuleLoading(false);
      if (!response.ok || !payload) {
        setRuleError(payload?.error || "规则列表加载失败，请刷新重试。");
        return;
      }
      if (payload.page > payload.totalPages && payload.totalPages >= 1) {
        setRuleLoading(false);
        setRuleTotal(payload.total);
        setRuleTotalPages(payload.totalPages);
        void loadRules({ page: payload.totalPages });
        return;
      }
      setRuleRows(payload.rules.map((rule) => ({ ...rule, category: normalizeRuleCategory(rule.category) })));
      setRuleTotal(payload.total);
      setRulePage(payload.page);
      setRulePageSize(payload.pageSize);
      setRuleTotalPages(payload.totalPages);
      setRuleCounts(payload.counts);
      setSelectedRuleIds(new Set());
    } catch (error) {
      setRuleLoading(false);
      setRuleError(error instanceof Error ? error.message : "规则列表加载失败，请刷新重试。");
    }
  };

  const scheduleRuleSearch = (value: string) => {
    if (ruleSearchTimer.current) window.clearTimeout(ruleSearchTimer.current);
    ruleSearchTimer.current = window.setTimeout(() => void loadRules({ q: value, page: 1 }), 350);
  };

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
    if (initialView === "rules" && rulesReady && initialRules.length === 0) void loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView, rulesReady]);

  useEffect(() => {
    if (initialView === "users" && !userSearched) void searchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);

  useEffect(() => {
    return () => {
      if (ruleSearchTimer.current) window.clearTimeout(ruleSearchTimer.current);
    };
  }, []);

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
    if (initialView !== "reviews" && initialView !== "comments" && initialView !== "reports" && initialView !== "reportwork" && initialView !== "reportcomment" && initialView !== "reportuser") return;
    const refreshTimer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(refreshTimer);
  }, [initialView, router]);

  const nav: Array<{ view: AdminView; label: string; icon: "file" | "flag" | "users" | "message" | "lock"; count?: number }> = [
    { view: "reviews", label: "作品审核", icon: "file", count: posts.length + seriesReviews.length },
    { view: "comments", label: "评论审核", icon: "message", count: comments.length || undefined },
    { view: "reportwork", label: "作品举报", icon: "flag", count: reports.filter((report) => report.target_type === "post").length || undefined },
    { view: "reportcomment", label: "评论举报", icon: "flag", count: reports.filter((report) => report.target_type === "comment").length || undefined },
    { view: "reportuser", label: "用户举报", icon: "flag", count: reports.filter((report) => report.target_type === "user").length || undefined },
    { view: "users", label: "用户管理", icon: "users" },
    { view: "feedbacks", label: "用户反馈", icon: "message", count: feedbacks.length },
    { view: "rules", label: "审核规则", icon: "lock", count: ruleTotal || undefined },
  ];

  const handleFeedback = async (id: string) => {
    setBusy(id); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/feedbacks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackId: id, status: "resolved" }) });
      const payload = await response.json().catch(() => null) as { error?: string; notification?: string; feishuSync?: string } | null;
      setBusy(null);
      if (!response.ok) { setMessage(payload?.error || "反馈处理失败，请稍后重试。"); return; }
      router.refresh();
      if (payload?.notification === "failed") {
        setMessage("反馈已处理，但用户通知发送失败，请检查后台服务配置。");
      } else if (payload?.feishuSync === "failed") {
        setMessage("反馈已处理，飞书暂未同步成功，系统会在每日任务中重试。");
      } else {
        setMessage("反馈已标记为处理完成。");
      }
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "反馈处理失败，请稍后重试。");
    }
  };

  const resetRuleForm = () => {
    setRuleError(""); setRuleType("keyword"); setRulePattern(""); setRuleCategory(MODERATION_REASON_OPTIONS[8]); setRuleRiskLevel("low"); setRuleMinHits("5"); setRuleDescription(""); setEditingRule(null);
  };

  const parseBulkLines = () => {
    const seen = new Set<string>();
    const values: string[] = [];
    let blankLines = 0;
    let duplicatedInBatch = 0;
    for (const rawLine of bulkText.split(/\r?\n/)) {
      let value = rawLine.trim();
      if (!value) { blankLines += 1; continue; }
      if (bulkFileMode === "csv") {
        value = value.split(",")[0].trim();
        if (!value) { blankLines += 1; continue; }
      }
      const key = value.toLowerCase();
      if (seen.has(key)) { duplicatedInBatch += 1; continue; }
      seen.add(key);
      values.push(value);
    }
    return { values, blankLines, duplicatedInBatch };
  };

  const openBulkImport = () => {
    setBulkText(""); setBulkFileName(""); setBulkFileMode(null); setBulkCategory(MODERATION_REASON_OPTIONS[8]); setBulkRiskLevel("low"); setBulkMinHits("5"); setBulkDescription(""); setBulkError(""); setBulkResult(null); setBulkImportOpen(true);
  };

  const closeBulkImport = () => {
    if (busy === "bulk-import") return;
    setBulkImportOpen(false);
  };

  const resetBulkImport = () => {
    setBulkText(""); setBulkFileName(""); setBulkFileMode(null); setBulkRiskLevel("low"); setBulkMinHits("5"); setBulkDescription(""); setBulkError(""); setBulkResult(null);
  };

  const handleBulkFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBulkText(typeof reader.result === "string" ? reader.result : "");
      setBulkFileName(file.name);
      setBulkFileMode(file.name.toLowerCase().endsWith(".csv") ? "csv" : "txt");
      setBulkError(""); setBulkResult(null);
    };
    reader.onerror = () => setBulkError("文件读取失败，请重新选择文件。");
    reader.readAsText(file);
    event.target.value = "";
  };

  const runBulkImport = async () => {
    const { values } = parseBulkLines();
    if (values.length === 0) { setBulkError("请粘贴敏感词或上传 .txt / .csv 文件。"); return; }
    if (values.length > 5000) { setBulkError("单批最多 5000 条，请分批导入。"); return; }
    const parsedBulkMinHits = Number(bulkMinHits);
    if (!Number.isInteger(parsedBulkMinHits) || parsedBulkMinHits < 1 || parsedBulkMinHits > 999) {
      setBulkError("最低命中次数必须是 1 至 999 的整数。");
      return;
    }
    setBusy("bulk-import"); setBulkError(""); setBulkResult(null);
    try {
      const response = await fetchWithTimeout("/api/admin/moderation-rules/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts: values, category: bulkCategory, riskLevel: bulkRiskLevel, minHits: parsedBulkMinHits, description: bulkDescription.trim() || null }) });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string; result?: BulkImportResult } | null;
      setBusy(null);
      if (!response.ok || !payload?.result) { setBulkError(payload?.error || "批量导入失败，请稍后重试。"); return; }
      setBulkResult(payload.result);
      router.refresh();
      void loadRules();
      setMessage(payload.message || "批量导入完成。");
    } catch (error) {
      setBusy(null);
      setBulkError(error instanceof Error ? error.message : "批量导入失败，请稍后重试。");
    }
  };

  const openEditRule = (rule: ModerationRule) => {
    setRuleError(""); setRuleType(rule.rule_type); setRulePattern(rule.pattern); setRuleCategory(normalizeRuleCategory(rule.category));
    const currentRisk = rule.risk_level || "low";
    setRuleRiskLevel(currentRisk);
    setRuleMinHits(String(rule.min_hits ?? riskLabels[currentRisk].hits));
    setRuleDescription(rule.description || "");
    setEditingRule(rule);
    setRuleDialogOpen(true);
  };

  const saveRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pattern = rulePattern.trim();
    if (!pattern) { setRuleError("请填写词语或短语。"); return; }
    const parsedMinHits = Number(ruleMinHits);
    if (ruleType === "keyword" && (!Number.isInteger(parsedMinHits) || parsedMinHits < 1 || parsedMinHits > 999)) {
      setRuleError("最低命中次数必须是 1 至 999 的整数。");
      return;
    }
    const busyKey = editingRule ? editingRule.id : "create-rule";
    setBusy(busyKey); setRuleError("");
    try {
      const payload = editingRule
        ? { id: editingRule.id, riskLevel: ruleRiskLevel, minHits: parsedMinHits, description: ruleDescription.trim() || null }
        : ruleType === "whitelist"
          ? { ruleType, pattern, category: ruleCategory, description: ruleDescription.trim() || null }
          : { ruleType, pattern, category: ruleCategory, riskLevel: ruleRiskLevel, minHits: parsedMinHits, description: ruleDescription.trim() || null };
      const response = await fetchWithTimeout("/api/admin/moderation-rules", { method: editingRule ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null) as { error?: string; rule?: ModerationRule } | null;
      setBusy(null);
      if (!response.ok || !result?.rule) { setRuleError(result?.error || "规则保存失败，请稍后重试。"); return; }
      router.refresh();
      void loadRules();
      setRuleDialogOpen(false); resetRuleForm(); setMessage(editingRule ? "规则已更新。新设置只影响之后提交的内容。" : "规则已添加。新规则只会影响之后提交的内容。");
    } catch (error) {
      setBusy(null);
      setRuleError(error instanceof Error ? error.message : "规则保存失败，请稍后重试。");
    }
  };

  const handleRuleRiskChange = (risk: ModerationRiskLevel) => {
    setRuleRiskLevel(risk);
    setRuleMinHits(String(riskLabels[risk].hits));
  };

  const handleBulkRiskChange = (risk: ModerationRiskLevel) => {
    setBulkRiskLevel(risk);
    setBulkMinHits(String(riskLabels[risk].hits));
  };

  const updateRuleEnabled = async (rule: ModerationRule) => {
    setBusy(rule.id); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/moderation-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }) });
      const payload = await response.json().catch(() => null) as { error?: string; rule?: ModerationRule } | null;
      setBusy(null);
      if (!response.ok || !payload?.rule) { setMessage(payload?.error || "规则更新失败，请稍后重试。"); return; }
      router.refresh();
      void loadRules();
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "规则更新失败，请稍后重试。");
    }
  };

  const updateRuleInline = async (rule: ModerationRule, patch: { category?: string; riskLevel?: ModerationRiskLevel }) => {
    setBusy(rule.id); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/moderation-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, ...patch }) });
      const payload = await response.json().catch(() => null) as { error?: string; rule?: ModerationRule } | null;
      setBusy(null);
      if (!response.ok || !payload?.rule) { setMessage(payload?.error || "规则更新失败，请稍后重试。"); return; }
      void loadRules();
      router.refresh();
      setMessage("规则已更新。新设置只影响之后提交的内容。");
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
      void loadRules();
      setMessage("规则已删除。");
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "规则删除失败，请稍后重试。");
    }
  };

  const toggleRuleSelection = (id: string) => {
    setSelectedRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllPageRules = () => {
    setSelectedRuleIds((prev) => {
      const next = new Set(prev);
      const allSelected = ruleRows.length > 0 && ruleRows.every((rule) => next.has(rule.id));
      for (const rule of ruleRows) {
        if (allSelected) next.delete(rule.id);
        else next.add(rule.id);
      }
      return next;
    });
  };

  const changeRuleRiskFilter = (risk: RuleFilter) => {
    setRuleRiskFilter(risk);
    setRulePage(1);
    setSelectedRuleIds(new Set());
    void loadRules({ risk, page: 1 });
  };

  const changeRuleCategoryFilter = (category: string) => {
    setRuleCategoryFilter(category);
    setRulePage(1);
    setSelectedRuleIds(new Set());
    void loadRules({ category, page: 1 });
  };

  const changeRulePageSize = (event: ChangeEvent<HTMLSelectElement>) => {
    const size = Number(event.target.value);
    if (![50, 100, 200].includes(size)) return;
    setRulePageSize(size);
    setRulePage(1);
    setSelectedRuleIds(new Set());
    void loadRules({ pageSize: size, page: 1 });
  };

  const runBulkRuleEnabled = async (enabled: boolean) => {
    const ids = [...selectedRuleIds];
    if (ids.length === 0) return;
    setBusy("bulk-rule-status"); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/moderation-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, enabled }) });
      const payload = await response.json().catch(() => null) as { error?: string; updated?: number } | null;
      setBusy(null);
      if (!response.ok || typeof payload?.updated !== "number") { setMessage(payload?.error || "批量更新失败，请稍后重试。"); return; }
      setSelectedRuleIds(new Set());
      void loadRules();
      router.refresh();
      setMessage(`已${enabled ? "启用" : "停用"} ${payload.updated} 条敏感词。`);
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "批量更新失败，请稍后重试。");
    }
  };

  const openBulkRiskDialog = () => {
    if (selectedRuleIds.size === 0) return;
    setBulkTargetRisk("high");
    setBulkRiskDialogOpen(true);
  };

  const openBulkCategoryDialog = () => {
    if (selectedRuleIds.size === 0) return;
    setBulkTargetCategory(MODERATION_REASON_OPTIONS[8]);
    setBulkCategoryDialogOpen(true);
  };

  const runBulkRuleRisk = async () => {
    const ids = [...selectedRuleIds];
    if (ids.length === 0) return;
    setBusy("bulk-rule-risk"); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/moderation-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, riskLevel: bulkTargetRisk }) });
      const payload = await response.json().catch(() => null) as { error?: string; updated?: number } | null;
      setBusy(null);
      if (!response.ok || typeof payload?.updated !== "number") { setMessage(payload?.error || "批量修改风险失败，请稍后重试。"); return; }
      setBulkRiskDialogOpen(false);
      setSelectedRuleIds(new Set());
      void loadRules();
      router.refresh();
      setMessage(`已将 ${payload.updated} 条敏感词改为${riskLabels[bulkTargetRisk].label}。`);
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "批量修改风险失败，请稍后重试。");
    }
  };

  const runBulkRuleCategory = async () => {
    const ids = [...selectedRuleIds];
    if (ids.length === 0) return;
    setBusy("bulk-rule-category"); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/moderation-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, category: bulkTargetCategory }) });
      const payload = await response.json().catch(() => null) as { error?: string; updated?: number } | null;
      setBusy(null);
      if (!response.ok || typeof payload?.updated !== "number") { setMessage(payload?.error || "批量修改分类失败，请稍后重试。"); return; }
      setBulkCategoryDialogOpen(false);
      setSelectedRuleIds(new Set());
      void loadRules();
      router.refresh();
      setMessage(`已将 ${payload.updated} 条敏感词移至${bulkTargetCategory}。`);
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "批量修改分类失败，请稍后重试。");
    }
  };

  const confirmBulkRemoveRule = async () => {
    const ids = [...selectedRuleIds];
    if (ids.length === 0) return;
    setBusy("bulk-rule-delete"); setMessage(""); setBulkDeleteConfirm(false);
    try {
      const response = await fetchWithTimeout(`/api/admin/moderation-rules?ids=${ids.map((id) => encodeURIComponent(id)).join(",")}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string; deleted?: number } | null;
      setBusy(null);
      if (!response.ok || typeof payload?.deleted !== "number") { setMessage(payload?.error || "批量删除失败，请稍后重试。"); return; }
      setSelectedRuleIds(new Set());
      void loadRules();
      router.refresh();
      setMessage(`已删除 ${payload.deleted} 条敏感词。`);
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : "批量删除失败，请稍后重试。");
    }
  };

  const searchUsers = async (event?: FormEvent<HTMLFormElement>, queryOverride?: string) => {
    event?.preventDefault();
    setUserLoading(true); setUserError(""); setUserSearched(true);
    const params = new URLSearchParams({ query: (queryOverride ?? userQuery).trim(), limit: "100" });
    try {
      const response = await fetchWithTimeout(`/api/admin/users?${params.toString()}`);
      const payload = await response.json().catch(() => null) as { error?: string; users?: UserSearchRow[] } | null;
      setUserLoading(false);
      if (!response.ok || !payload?.users) {
        setUserError(payload?.error || "用户搜索失败，请稍后重试。");
        setUserResults([]);
        return;
      }
      if (!params.get("query")) setAllUserResults(payload.users);
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
    if (initialView === "rules") scheduleRuleSearch(value);
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
  const feedbackPending = feedbacks.filter((feedback) => feedback.status === "pending" || feedback.status === "reviewing");
  const feedbackHistory = feedbacks.filter((feedback) => feedback.status !== "pending" && feedback.status !== "reviewing");
  const feedbackTypeOptions: Array<[string, string]> = [
    ["all", "全部类型"],
    ["功能建议", "功能建议"],
    ["Bug 报告", "Bug 报告"],
    ["内容举报", "内容举报"],
    ["其他问题", "其他问题"],
  ];
  const feedbackTypeLabel = (type: string) => feedbackTypeLabels[type] || type;
  const feedbackSource = feedbackMode === "pending" ? feedbackPending : feedbackHistory;
  const feedbackUserCounts = feedbacks.reduce<Record<string, number>>((counts, feedback) => {
    counts[feedback.user_id] = (counts[feedback.user_id] || 0) + 1;
    return counts;
  }, {});
  const feedbackRows = feedbackSource
    .filter((feedback) => feedbackTypeFilter === "all" || feedbackTypeLabel(feedback.type) === feedbackTypeFilter)
    .filter((feedback) => `${feedbackTypeLabel(feedback.type)} ${feedback.content} ${feedback.user_id} ${feedback.id}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => feedbackSort === "submissions"
      ? (feedbackUserCounts[b.user_id] || 0) - (feedbackUserCounts[a.user_id] || 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const feedbackPageSize = 50;
  const visibleFeedbackRows = feedbackRows.slice((feedbackPage - 1) * feedbackPageSize, feedbackPage * feedbackPageSize);
  const feedbackTotalPages = Math.max(1, Math.ceil(feedbackRows.length / feedbackPageSize));
  const bulkPreview = bulkImportOpen ? parseBulkLines() : { values: [], blankLines: 0, duplicatedInBatch: 0 };
  const bulkInvalidCount = bulkPreview.values.filter((value) => value.length > 500).length;
  const bulkValidCount = bulkPreview.values.length - bulkInvalidCount;

  const reviewRows = [
    ...posts.map((post) => {
      const entry = reviewEntry(post.review_route_reason, post.review_reason);
      return {
        key: post.id,
        title: post.title || "无标题",
        id: post.id,
        author: post.author?.nickname || "未知作者",
        authorId: post.user_id,
        type: post.post_type === "serial" ? "章节" : post.post_type === "illustration" ? "图片" : "单篇",
        typeKey: post.post_type === "serial" ? "chapter" : post.post_type === "illustration" ? "image" : "single",
        risk: reviewRisk(post.review_priority, post.review_route_reason),
        attempt: post.review_submission_number ? `${post.review_submission_number} 次` : "—",
        entry: entry.label,
        source: entry.source,
        createdAt: post.created_at,
        href: `/admin/reviews/${post.review_case_id}`,
      };
    }),
    ...seriesReviews.map((item) => {
      const entry = reviewEntry(item.route_reason);
      return {
        key: `series-${item.id}`,
        title: item.series?.name || "未命名连载",
        id: item.series_id,
        author: item.series?.user_id ? `作者 ${item.series.user_id.slice(0, 8)}` : "未知作者",
        authorId: item.series?.user_id || "",
        type: "连载信息",
        typeKey: "series",
        risk: reviewRisk(item.priority, item.route_reason),
        attempt: "—",
        entry: entry.label,
        source: entry.source,
        createdAt: item.created_at,
        href: `/admin/series-reviews/${item.series_id}`,
      };
    }),
  ]
    .filter((row) => {
      const searchable = `${row.title} ${row.author} ${row.id} ${row.authorId} ${row.entry} ${row.source}`.toLowerCase();
      return searchable.includes(query.trim().toLowerCase())
        && (reviewTypeFilter === "all" || row.typeKey === reviewTypeFilter)
        && (reviewRiskFilter === "all" || row.risk === reviewRiskFilter)
        && (reviewEntryFilter === "all" || row.entry === reviewEntryFilter);
    })
    .sort((a, b) => reviewSort === "risk" ? ({ 高: 3, 中: 2, 低: 1 }[b.risk] || 0) - ({ 高: 3, 中: 2, 低: 1 }[a.risk] || 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const historyRows = reviewHistory.filter((item) => {
    const typeKey = item.item_type === "series" ? "series" : item.post_type === "illustration" ? "image" : item.post_type === "serial" ? "chapter" : "single";
    const entry = reviewEntry(item.route_reason, item.review_reason);
    const searchable = `${item.title} ${item.author_name} ${item.entity_id} ${item.user_id} ${entry.label} ${entry.source} ${reviewDecision(item.status)}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase())
      && (reviewTypeFilter === "all" || typeKey === reviewTypeFilter)
      && (reviewRiskFilter === "all" || reviewRisk(item.priority, item.route_reason) === reviewRiskFilter)
      && (reviewEntryFilter === "all" || entry.label === reviewEntryFilter);
  });

  const postsView = <section className="admin-review-list" aria-label="作品审核列表">
    <div className="admin-review-tabs" role="tablist" aria-label="作品审核状态">
      <button className={`admin-review-tab ${reviewMode === "pending" ? "is-active" : ""}`} type="button" role="tab" aria-selected={reviewMode === "pending"} onClick={() => setReviewMode("pending")}>待审核（{posts.length + seriesReviews.length}）</button>
      <button className={`admin-review-tab ${reviewMode === "history" ? "is-active" : ""}`} type="button" role="tab" aria-selected={reviewMode === "history"} onClick={() => setReviewMode("history")}>审核记录（{reviewHistory.length}）</button>
      <label className="admin-review-search"><Icon name="search" /><input value={query} onChange={(event) => handleQueryChange(event.target.value)} placeholder="搜索标题 / 作者 / ID" aria-label="搜索作品标题、作者或 ID" /></label>
      <button className="admin-btn admin-btn-light admin-review-sort" type="button" onClick={() => setReviewSort((current) => current === "latest" ? "risk" : "latest")}>{reviewSort === "latest" ? "按最新" : "按风险"} ↕</button>
    </div>
    <div className="admin-review-filters">
      <div><span>类型</span><div>{[["all", "全部"], ["image", "图片"], ["single", "单篇"], ["chapter", "章节"], ["series", "连载信息"]].map(([value, label]) => <button className={reviewTypeFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => setReviewTypeFilter(value)}>{label}</button>)}</div></div>
      <div><span>风险等级</span><div>{[["all", "全部"], ["高", "高"], ["中", "中"], ["低", "低"]].map(([value, label]) => <button className={reviewRiskFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => setReviewRiskFilter(value)}>{label}</button>)}</div></div>
      <div><span>入审方式</span><div>{[["all", "全部"], ["服务异常", "服务异常"], ["自动命中", "自动命中"], ["修改重提", "修改重提"], ["人工送审", "人工送审"]].map(([value, label]) => <button className={reviewEntryFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => setReviewEntryFilter(value)}>{label}</button>)}</div></div>
    </div>
    {reviewMode === "history" ? <div className="admin-review-table admin-review-history-table">
      <div className="admin-review-table-head"><span>作品</span><span>作者</span><span>类型</span><span>处理结果</span><span>审核依据</span><span>处理人 · 时间</span></div>
      {historyRows.map((item) => {
        const entry = reviewEntry(item.route_reason, item.review_reason);
        const type = item.item_type === "series" ? "连载信息" : item.post_type === "serial" ? "章节" : item.post_type === "illustration" ? "图片" : "单篇";
        const href = item.item_type === "series" ? `/admin/series-reviews/${item.entity_id}` : `/admin/reviews/${item.id}`;
        return <Link className="admin-review-row admin-review-history-row" href={href} key={`${item.item_type}-${item.id}`} title="查看只读审核记录">
          <span className="admin-review-work"><b>{item.title}</b><small>{item.entity_id}</small></span>
          <span className="admin-review-author"><b>{item.author_name}</b><small>{item.user_id}</small></span>
          <span>{type}</span>
          <span><em className={`admin-review-result is-${item.status === "approved" ? "approved" : "rejected"}`}>{reviewDecision(item.status)}</em><small>{item.submission_number ? `第 ${item.submission_number} 次提交` : "已完成处理"}</small></span>
          <span>{entry.source}<small>{entry.label}</small></span>
          <span>{item.handler_name}<small>{fmtReviewTime(item.decided_at || item.created_at)}</small></span>
        </Link>;
      })}
      {historyRows.length === 0 ? <div className="admin-empty admin-review-empty"><strong>{reviewHistory.length === 0 ? "当前还没有已处理的作品审核记录" : "没有符合条件的审核记录"}</strong><span>{reviewHistory.length === 0 ? "完成审核后的作品会保留在这里，只读查看处理依据和冻结版本。" : "可以调整搜索或筛选条件。"}</span></div> : null}
    </div> : <div className="admin-review-table">
      <div className="admin-review-table-head"><span>作品</span><span>作者</span><span>类型</span><span>风险</span><span>入审</span><span>来源</span><span>时间</span></div>
      {reviewRows.length === 0 ? <div className="admin-empty admin-review-empty"><strong>没有符合条件的待审核作品</strong><span>可以调整搜索或筛选条件。</span></div> : reviewRows.map((row) => <Link className="admin-review-row" href={row.href} key={row.key} title="进入审核详情">
        <span className="admin-review-work"><b>{row.title}</b><small>{row.id}</small></span>
        <span className="admin-review-author"><b>{row.author}</b><small>{row.authorId || "—"}</small></span>
        <span>{row.type}</span>
        <span><em className={`admin-review-risk is-${row.risk}`}>{row.risk}</em></span>
        <span>{row.attempt}</span>
        <span>{row.entry}<small>{row.source}</small></span>
        <span>{fmtReviewTime(row.createdAt)}</span>
      </Link>)}
    </div>}
  </section>;

  const commentSource = commentMode === "pending" ? comments : commentHistory;
  const commentResultClass = (status: string) => status === "approved" ? "approved" : status === "reminded" ? "reminded" : status === "deleted" ? "deleted" : "handled";
  const commentRows = commentSource
    .filter((item) => commentMode === "history" || commentTypeFilter === "all" || commentTypeLabel(item) === commentTypeFilter)
    .filter((item) => commentMode === "history" || commentRiskFilter === "all" || commentRiskLabel(item.priority) === commentRiskFilter)
    .filter((item) => commentMode === "history" || commentEntryFilter === "all" || commentEntryLabel(item) === commentEntryFilter)
    .filter((item) => commentMode === "pending" || commentResultFilter === "all" || commentStatusLabel(item.status) === commentResultFilter)
    .filter((item) => {
      const searchable = `${item.content} ${item.post_title} ${item.author_nickname} ${item.comment_id || ""} ${item.post_id || ""} ${item.author_id || ""}`.toLowerCase();
      return searchable.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => commentSort === "risk"
      ? ({ 高: 2, 中: 1 }[commentRiskLabel(b.priority)] || 0) - ({ 高: 2, 中: 1 }[commentRiskLabel(a.priority)] || 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const commentsView = <section className="admin-comment-page" aria-label="评论审核列表">
    {!commentsReady ? <div className="admin-card admin-full-card admin-empty"><strong>评论审核数据源尚未启用</strong><span>请先执行 comment-moderation-v1.sql；执行后这里只显示迁移后的真实评论审核案件。</span></div> : <>
      <div className="admin-comment-tabs" role="tablist" aria-label="评论审核状态">
        <button className={`admin-comment-tab ${commentMode === "pending" ? "is-active" : ""}`} type="button" role="tab" aria-selected={commentMode === "pending"} onClick={() => setCommentMode("pending")}>待审核（{comments.length}）</button>
        <button className={`admin-comment-tab ${commentMode === "history" ? "is-active" : ""}`} type="button" role="tab" aria-selected={commentMode === "history"} onClick={() => setCommentMode("history")}>审核记录（{commentHistory.length}）</button>
        {commentMode === "history" ? <span className="admin-comment-view-note">只读档案，不提供再次处置</span> : null}
        <label className="admin-comment-search"><input value={query} onChange={(event) => handleQueryChange(event.target.value)} placeholder={commentMode === "history" ? "搜索评论 / 作品 / 用户 / ID" : "搜索内容 / 所属作品 / ID"} aria-label="搜索评论内容、所属作品或 ID" /></label>
        {commentMode === "pending" ? <button className="admin-btn admin-btn-light admin-comment-sort" type="button" onClick={() => setCommentSort((current) => current === "latest" ? "risk" : "latest")}>{commentSort === "latest" ? "按最新" : "按风险从高到低"} ⇄</button> : null}
      </div>
      <div className="admin-comment-filters"><div className="admin-comment-filter-groups">
        {commentMode === "history" ? <div className="admin-comment-filter-group"><span>处理结果</span><div>{[["all", "全部"], ["已放行", "已放行"], ["已提醒", "已提醒"], ["已删除", "已删除"]].map(([value, label]) => <button className={commentResultFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => setCommentResultFilter(value)}>{label}</button>)}</div></div> : <>
          <div className="admin-comment-filter-group"><span>类型</span><div>{[["all", "全部"], ["段评", "段评"], ["评论", "评论"], ["回复", "回复"]].map(([value, label]) => <button className={commentTypeFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => setCommentTypeFilter(value)}>{label}</button>)}</div></div>
          <div className="admin-comment-filter-group"><span>风险等级</span><div>{[["all", "全部"], ["高", "高"], ["中", "中"], ["低", "低"]].map(([value, label]) => <button className={commentRiskFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => setCommentRiskFilter(value)}>{label}</button>)}</div></div>
          <div className="admin-comment-filter-group"><span>入审方式</span><div>{[["all", "全部"], ["自动命中", "自动命中"], ["服务异常", "服务异常"], ["人工送审", "人工送审"]].map(([value, label]) => <button className={commentEntryFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => setCommentEntryFilter(value)}>{label}</button>)}</div></div>
        </>}
      </div></div>
      <div className="admin-comment-table">
        {commentMode === "history" ? <div className="admin-comment-table-head admin-comment-history-head"><span>原评论</span><span>所属作品</span><span>发布者</span><span>处理结果</span><span>审核依据</span><span>处理人 · 时间</span></div> : <div className="admin-comment-table-head"><span>原评论</span><span>所属作品</span><span>发布者</span><span>类型</span><span>风险</span><span>入审方式</span><span>时间</span></div>}
        {commentMode === "history" ? commentRows.map((item) => <Link className="admin-comment-row admin-comment-history-row" href={`/admin/comments/${item.id}`} key={item.id} title="查看只读评论审核记录">
          <span><b>{item.content}</b><small>{item.comment_id || "评论已删除"}</small></span>
          <span><b>{item.post_title || "未知作品"}</b><small>{item.post_id || "—"}</small></span>
          <span><b>{item.author_nickname || "未知用户"}</b><small>{item.author_id || "—"}</small></span>
          <span><em className={`admin-comment-result is-${commentResultClass(item.status)}`}>{commentStatusLabel(item.status)}</em><small>评论审核结果</small></span>
          <span>{item.decision_reason || item.route_reason || "未记录"}<small>{item.screening_sources.map(commentSourceLabel).join("、") || "未记录"}</small></span>
          <span>{item.decided_by ? `管理员 ${item.decided_by.slice(0, 8)}` : "系统"}<small>{fmtReviewTime(item.decided_at || item.created_at)}</small></span>
        </Link>) : commentRows.map((item) => <Link className="admin-comment-row" href={`/admin/comments/${item.id}`} key={item.id} title="进入评论审核详情">
          <span><b>{item.content}</b><small>{item.comment_id || "评论已删除"}</small></span>
          <span><b>{item.post_title || "未知作品"}</b><small>{item.post_id || "—"}</small></span>
          <span><b>{item.author_nickname || "未知用户"}</b><small>{item.author_id || "—"}</small></span>
          <span>{commentTypeLabel(item)}</span>
          <span><em className={`admin-comment-risk is-${commentRiskLabel(item.priority)}`}>{commentRiskLabel(item.priority)}</em></span>
          <span>{commentEntryLabel(item)}<small>{item.screening_sources.map(commentSourceLabel).join("、") || "未记录"}</small></span>
          <span>{fmtReviewTime(item.created_at)}</span>
        </Link>)}
        {commentRows.length === 0 ? <div className="admin-empty admin-comment-empty"><strong>{commentSource.length === 0 ? (commentMode === "pending" ? "当前没有待审核评论" : "当前还没有评论审核记录") : "没有符合条件的评论"}</strong><span>可以调整搜索或筛选条件。</span></div> : null}
      </div>
    </>}
  </section>;

  const feedbacksView = <section className="admin-feedback-page" aria-label="用户反馈">
    <div className="admin-feedback-tabs" role="tablist" aria-label="用户反馈视图">
      <button className={`admin-feedback-tab ${feedbackMode === "pending" ? "is-active" : ""}`} type="button" role="tab" aria-selected={feedbackMode === "pending"} onClick={() => { setFeedbackMode("pending"); setFeedbackPage(1); }}>待处理反馈（{feedbackPending.length}）</button>
      <button className={`admin-feedback-tab ${feedbackMode === "history" ? "is-active" : ""}`} type="button" role="tab" aria-selected={feedbackMode === "history"} onClick={() => { setFeedbackMode("history"); setFeedbackPage(1); }}>反馈记录（{feedbackHistory.length}）</button>
      <label className="admin-feedback-search"><input value={query} onChange={(event) => { setQuery(event.target.value); setFeedbackPage(1); }} placeholder="搜索反馈标题 / 提交人" aria-label="搜索反馈标题或提交人" /></label>
      <button className="admin-btn admin-feedback-sort" type="button" onClick={() => setFeedbackSort((current) => current === "latest" ? "submissions" : "latest")}>{feedbackSort === "latest" ? "按最新" : "按提交次数"} ⇄</button>
    </div>
    <div className="admin-feedback-filters"><div><span>反馈类型</span><div className="admin-feedback-filter-tabs">{feedbackTypeOptions.map(([value, label]) => <button className={feedbackTypeFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => { setFeedbackTypeFilter(value); setFeedbackPage(1); }}>{label}</button>)}</div></div></div>
    <div className="admin-feedback-table">
      <div className="admin-feedback-table-head"><span>反馈 · 编号</span><span>类型</span><span>提交人</span><span>提交次数</span><span>状态</span><span>时间</span></div>
      {visibleFeedbackRows.map((item) => <div className="admin-feedback-row" key={item.id} role="button" tabIndex={0} aria-label={`查看反馈：${item.content}`} onClick={() => router.push(`/admin/feedbacks/${item.id}`)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/admin/feedbacks/${item.id}`); } }}>
        <span><strong>{item.content}</strong><small>{item.id}</small></span>
        <span>{feedbackTypeLabel(item.type)}</span>
        <span><strong>用户 {item.user_id.slice(0, 8)}</strong><small>{item.user_id}</small></span>
        <span><strong>累计 {feedbackUserCounts[item.user_id] || 1} 次</strong><small>含全部类型</small></span>
        <span><em className={`admin-feedback-status ${feedbackMode === "pending" ? "is-pending" : "is-resolved"}`}>{feedbackMode === "pending" ? "待处理" : "已处理"}</em></span>
        <span>{fmt(item.created_at)}{feedbackMode === "pending" ? <button className="admin-btn admin-feedback-action" type="button" disabled={busy === item.id} onClick={(event) => { event.stopPropagation(); void handleFeedback(item.id); }}>{busy === item.id ? "处理中…" : "标记已处理"}</button> : null}</span>
      </div>)}
      {visibleFeedbackRows.length === 0 ? <div className="admin-empty admin-feedback-empty"><strong>没有符合条件的用户反馈</strong><span>可以调整搜索或反馈类型。</span></div> : null}
    </div>
    <div className="admin-feedback-pagination"><span>共 {feedbackRows.length} 条 · 第 {feedbackPage} / {feedbackTotalPages} 页</span><div><button className="admin-pagination-btn" type="button" disabled={feedbackPage <= 1} onClick={() => setFeedbackPage((page) => page - 1)}>上一页</button><button className="admin-pagination-btn" type="button" disabled={feedbackPage >= feedbackTotalPages} onClick={() => setFeedbackPage((page) => page + 1)}>下一页</button></div></div>
  </section>;

  const visibleRuleRows = ruleSort === "risk"
    ? [...ruleRows].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.risk_level] ?? 3) - ({ high: 0, medium: 1, low: 2 }[b.risk_level] ?? 3))
    : ruleRows;
  const rulesView = (
    <section className="admin-rules-page" aria-label="审核规则管理">
      {!rulesReady ? <div className="admin-card admin-full-card admin-empty"><strong>审核规则数据表尚未启用</strong><span>风险分级功能需先执行 moderation-risk-thresholds-v1.sql。</span></div> : <>
        <div className="admin-rules-toolbar">
          <div className="admin-rules-toolbar-top">
            <label className="admin-rules-search"><input value={query} onChange={(event) => handleQueryChange(event.target.value)} placeholder="搜索违禁词 / 分类名" aria-label="搜索违禁词或分类名" /></label>
            <button className="admin-btn admin-rules-sort" type="button" onClick={() => setRuleSort((current) => current === "default" ? "risk" : "default")}>{ruleSort === "default" ? "默认顺序" : "按风险"} ⇄</button>
            <span className="admin-rules-spacer" />
            <span className="admin-rule-selected">已选 <b>{selectedRuleIds.size}</b> 条</span>
            <button className="admin-btn admin-btn-ghost" type="button" disabled={ruleRows.length === 0} onClick={toggleAllPageRules}>全选当前筛选结果（{ruleRows.length} 条）</button>
            <button className="admin-btn admin-btn-light" type="button" disabled={selectedRuleIds.size === 0 || busy === "bulk-rule-status"} onClick={() => void runBulkRuleEnabled(ruleRows.filter((rule) => selectedRuleIds.has(rule.id)).some((rule) => !rule.enabled))}>启用/停用</button>
            <button className="admin-btn admin-btn-light" type="button" disabled={selectedRuleIds.size === 0 || busy === "bulk-rule-risk"} onClick={openBulkRiskDialog}>改等级</button>
            <button className="admin-btn admin-btn-light" type="button" disabled={selectedRuleIds.size === 0 || busy === "bulk-rule-category"} onClick={openBulkCategoryDialog}>改分类</button>
            <button className="admin-btn admin-btn-light is-danger" type="button" disabled={selectedRuleIds.size === 0 || busy === "bulk-rule-delete"} onClick={() => setBulkDeleteConfirm(true)}>批量删除</button>
            <button className="admin-btn admin-btn-ghost" type="button" disabled={selectedRuleIds.size === 0} onClick={() => setSelectedRuleIds(new Set())}>取消勾选</button>
            <div className="admin-rules-management-actions" aria-label="规则管理操作">
              <button className="admin-btn admin-btn-ghost" type="button" onClick={openBulkImport}>批量导入</button>
              <button className="admin-btn admin-btn-primary" type="button" onClick={() => { resetRuleForm(); setRuleDialogOpen(true); }}>添加规则</button>
            </div>
          </div>
          <div className="admin-rules-filter-groups">
            <div className="admin-rules-filter-group"><span>分类体系</span><div className="admin-rules-filter-tabs">{[{ value: "all", label: "全部" }, ...ruleCategoryOptions].map((item) => <button className={ruleCategoryFilter === item.value ? "is-selected" : ""} type="button" key={item.value} onClick={() => changeRuleCategoryFilter(item.value)}>{item.label}</button>)}</div></div>
            <div className="admin-rules-filter-group"><span>风险等级</span><div className="admin-rules-filter-tabs">{[["all", "全部"], ["high", "高"], ["medium", "中"], ["low", "一般"]].map(([value, label]) => <button className={ruleRiskFilter === value ? "is-selected" : ""} type="button" key={value} onClick={() => changeRuleRiskFilter(value as RuleFilter)}>{label}</button>)}</div></div>
          </div>
        </div>
        {ruleError ? <div className="admin-alert admin-alert-error" role="alert">{ruleError}</div> : null}
        {ruleLoading ? <div className="admin-rule-loading">敏感词加载中…</div> : visibleRuleRows.length === 0 ? <div className="admin-card admin-empty"><strong>{query.trim() ? "没有匹配的违禁词" : "还没有违禁词"}</strong><span>{query.trim() ? "换个关键词或筛选条件试试。" : "当前分类下还没有规则。"}</span></div> : <div className="admin-rules-table">
          <div className="admin-rules-table-head"><span><input type="checkbox" checked={visibleRuleRows.length > 0 && visibleRuleRows.every((rule) => selectedRuleIds.has(rule.id))} onChange={toggleAllPageRules} aria-label="全选当前页" /></span><span>违禁词 / 关键词组</span><span>所属分类</span><span>风险等级</span><span>状态</span></div>
          {visibleRuleRows.map((rule) => <div className="admin-rules-table-row" key={rule.id}>
            <span><input className="admin-rule-checkbox" type="checkbox" checked={selectedRuleIds.has(rule.id)} onChange={() => toggleRuleSelection(rule.id)} aria-label={`勾选 ${rule.pattern}`} /></span>
            <span className="admin-rule-word-cell"><b>{rule.pattern}</b><small>{rule.rule_type === "whitelist" ? "白名单" : `命中 ${rule.hit_count} 次 · ${formatRiskRule(rule.risk_level || "low", rule.min_hits ?? riskLabels[rule.risk_level || "low"].hits)}`}</small></span>
            <select className="admin-rule-row-select" value={normalizeRuleCategory(rule.category)} onChange={(event) => void updateRuleInline(rule, { category: event.target.value })} disabled={busy === rule.id} aria-label={`修改${rule.pattern}的所属分类`}>{ruleCategoryOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>
            <select className="admin-rule-row-select" value={rule.risk_level || "low"} onChange={(event) => void updateRuleInline(rule, { riskLevel: event.target.value as ModerationRiskLevel })} disabled={rule.rule_type === "whitelist" || busy === rule.id} aria-label={`修改${rule.pattern}的风险等级`}><option value="high">高</option><option value="medium">中</option><option value="low">一般</option></select>
            <button className={`admin-rule-switch ${rule.enabled ? "is-on" : ""}`} type="button" role="switch" aria-checked={rule.enabled} aria-label={`${rule.enabled ? "停用" : "启用"}${rule.pattern}`} disabled={busy === rule.id} onClick={() => void updateRuleEnabled(rule)}><i aria-hidden="true" /></button>
          </div>)}
        </div>}
        {ruleTotal > 0 ? <div className="admin-rule-pagination"><span className="admin-rule-pageinfo">第 {rulePage} / {ruleTotalPages} 页 · 共 {ruleTotal} 条</span><div className="admin-rule-pager"><button className="admin-pagination-btn" type="button" disabled={rulePage <= 1 || ruleLoading} onClick={() => void loadRules({ page: rulePage - 1 })}>上一页</button><button className="admin-pagination-btn" type="button" disabled={rulePage >= ruleTotalPages || ruleLoading} onClick={() => void loadRules({ page: rulePage + 1 })}>下一页</button><label className="admin-rule-page-size">每页<select value={rulePageSize} onChange={changeRulePageSize} aria-label="每页显示数量"><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option></select></label></div></div> : null}
      </>}
    </section>
  );

  const userStatusRank: Record<string, number> = { banned: 4, suspended: 3, restricted: 2, warned: 1, active: 0 };
  const filteredUsers = userResults
    .filter((user) => {
      const query = userQuery.trim().toLowerCase();
      return !query || `${user.nickname || ""} ${user.id}`.toLowerCase().includes(query);
    })
    .filter((user) => userMode === "all" || user.moderation_status !== "active")
    .filter((user) => userStatus === "all" || user.moderation_status === userStatus)
    .sort((a, b) => {
      if (userSort === "activity") return new Date(b.activity_at || b.created_at).getTime() - new Date(a.activity_at || a.created_at).getTime();
      if (userSort === "severity") return (userStatusRank[b.moderation_status] || 0) - (userStatusRank[a.moderation_status] || 0) || new Date(b.activity_at || b.created_at).getTime() - new Date(a.activity_at || a.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const userPageSize = 8;
  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const visibleUsers = filteredUsers.slice((userPage - 1) * userPageSize, userPage * userPageSize);
  const userStatusOptions: Array<[typeof userStatus, string]> = userMode === "all"
    ? [["all", "全部"], ["active", "正常"], ["warned", "已警告"], ["restricted", "受限"], ["suspended", "已暂停"], ["banned", "已封禁"]]
    : [["all", "全部受限"], ["warned", "已警告"], ["restricted", "受限"], ["suspended", "已暂停"], ["banned", "已封禁"]];
  const userSortLabel = userSort === "activity" ? "按最近活动" : userSort === "severity" ? "按受限严重度" : "按注册顺序";
  const changeUserMode = (mode: "all" | "restricted") => { setUserMode(mode); setUserStatus("all"); setUserSort(mode === "all" ? "reg" : "severity"); setUserPage(1); };
  const usersView = <section className="admin-users-page">
    <div className="admin-users-toolbar">
      <div className="admin-users-tab-row" role="tablist" aria-label="用户管理视图">
        <button className={`admin-users-tab ${userMode === "all" ? "is-active" : ""}`} type="button" role="tab" aria-selected={userMode === "all"} onClick={() => changeUserMode("all")}>全部账号（{allUserResults.length}）</button>
        <button className={`admin-users-tab ${userMode === "restricted" ? "is-active" : ""}`} type="button" role="tab" aria-selected={userMode === "restricted"} onClick={() => changeUserMode("restricted")}>受限账号（{allUserResults.filter((user) => user.moderation_status !== "active").length}）</button>
        {userMode === "restricted" ? <span className="admin-users-view-note">仅显示当前状态非“正常”的账号，包括受限与封禁</span> : null}
        <form className="admin-users-search" onSubmit={searchUsers}><input value={userQuery} onChange={(event) => { const value = event.target.value; setUserQuery(value); setUserPage(1); if (!value.trim() && userSearched) setUserResults(allUserResults); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchUsers(); } }} placeholder="搜索昵称或用户 ID" aria-label="搜索用户" /><button className="admin-btn admin-btn-primary admin-users-search-button" type="submit" disabled={userLoading}>{userLoading ? "搜索中…" : "搜索"}</button></form>
        <button className="admin-users-sort" type="button" onClick={() => { setUserSort(userSort === "activity" ? (userMode === "all" ? "reg" : "severity") : "activity"); setUserPage(1); }} aria-label={`切换排序方式（当前：${userSortLabel}）`}>{userSortLabel} ⇄</button>
      </div>
      <div className="admin-users-filter-row"><span className="admin-users-filter-label">账号状态</span><div className="admin-users-filter-tabs">{userStatusOptions.map(([value, label]) => <button className={userStatus === value ? "is-active" : ""} type="button" key={value} onClick={() => { setUserStatus(value); setUserPage(1); }}>{label}</button>)}</div></div>
    </div>
    {userError ? <div className="admin-alert admin-alert-error" role="alert">{userError}</div> : null}
    {userLoading && !userResults.length ? <div className="admin-users-empty"><strong>用户数据加载中…</strong></div> : !userSearched ? <div className="admin-users-empty"><strong>用户数据加载中…</strong><span>正在读取真实账号列表。</span></div> : visibleUsers.length === 0 ? <div className="admin-users-empty"><strong>当前筛选下暂无账号</strong><span>换个状态或搜索关键词试试。</span></div> : <div className="admin-users-table">
      <div className="admin-users-table-head"><span>用户</span><span>状态</span><span>有效违规</span><span>举报 收 / 发</span><span>最近活动</span><span>备注</span></div>
      {visibleUsers.map((user) => <Link className="admin-users-table-row" href={`/admin/users/${user.id}`} key={user.id}><span className="admin-users-user-cell"><span className="admin-user-avatar admin-user-avatar-empty">{(user.nickname || "用").slice(0, 1)}</span><span><strong>{user.nickname || "未命名用户"}</strong><code className="admin-mono">{user.id}</code></span></span><span><span className={`admin-user-status ${user.moderation_status}`}>{userStatusLabels[user.moderation_status] || user.moderation_status || "未知"}</span></span><span>{user.active_violations} 次</span><span>收 {user.total_report_cases} / 发 {user.total_reports ?? 0}</span><span>{fmtUserListTime(user.activity_at || user.created_at)}</span><span className="admin-users-note">{user.moderation_note || "—"}</span></Link>)}
    </div>}
    {userSearched && filteredUsers.length ? <div className="admin-users-pagination"><span>共 {filteredUsers.length} 条 · 第 {userPage} / {userTotalPages} 页</span><div><button className="admin-pagination-btn" type="button" disabled={userPage <= 1} onClick={() => setUserPage((page) => Math.max(1, page - 1))}>上一页</button><button className="admin-pagination-btn" type="button" disabled={userPage >= userTotalPages} onClick={() => setUserPage((page) => Math.min(userTotalPages, page + 1))}>下一页</button></div></div> : null}
  </section>;

  const content = initialView === "reviews" ? postsView : initialView === "comments" ? commentsView : initialView === "reportwork" ? <ReportCenterClient initialKind="post" /> : initialView === "reportcomment" ? <ReportCenterClient initialKind="comment" /> : initialView === "reportuser" ? <ReportCenterClient initialKind="user" /> : initialView === "reports" ? <ReportCenterClient initialKind="post" /> : initialView === "feedbacks" ? feedbacksView : initialView === "rules" ? rulesView : initialView === "users" ? usersView : <section className="admin-card admin-full-card"><div className="admin-coming-soon"><Icon name="flag" /><strong>该页面将在后续批次接入</strong><span>先保留设计稿中的独立入口，避免把其他案件类型混在同一张列表里。</span></div></section>;

  return <div className="admin-app-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span className="admin-brand-mark"><svg viewBox="0 0 1535 857" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M253 848C278.56 726.64 291.64 598.27 319.94 477.94C340.59 390.11 383.9 316.25 462.37 268.37C590.46 190.21 798.39 207.91 841.07 374.94C866.81 475.66 796.07 590.94 900.35 663.66C1008.05 738.76 1144.21 668.58 1231.02 597.02C1258.43 574.42 1284.44 529.68 1325.43 542.57L1338.05 549.95L1490.94 845.01L1310.99 847L1230.02 689.9C1174.48 744.13 1114.63 795.5 1042.33 826.33C869.05 900.22 671.92 843.47 691.05 625.05C697.88 547.05 757.52 410.78 644.51 379.48C557.04 355.26 495.68 418.68 475.63 497.62C446.93 610.64 440.1 734.58 410 847.99H253V848Z"/><path d="M1185 0L1099.01 487.99L1346 240H1535C1443.66 336.03 1351.46 442.56 1251.02 529.02C1161.29 606.26 958.981 728.81 930.891 530.97L1025 0.00999451H1185V0Z"/><path d="M301 60L158 848H0L137 60H301Z"/></svg></span><span>Inkland 管理后台</span></div>
      <div className="admin-nav-group"><p>后台功能</p>{nav.map((item) => <Link className={`admin-nav-item ${initialView === item.view ? "is-active" : ""}`} href={`/admin?view=${item.view}`} key={item.view} onClick={rememberListScroll} aria-current={initialView === item.view ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}</Link>)}</div>
      <div className="admin-sidebar-foot">Inkland 内容治理后台<br />设计稿 · uicraft</div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-breadcrumb"><strong>管理后台 / {viewCopy[initialView].title}</strong></div><div className="admin-top-actions"><button className="admin-btn admin-btn-light admin-global-search-btn" type="button" onClick={() => { setGlobalQuery(""); setGlobalError(""); setGlobalResults(null); setGlobalSearchOpen(true); }}><Icon name="search" />全局搜索 <span className="admin-shortcut">⌘ K</span></button><button className="admin-btn admin-btn-light" type="button" onClick={() => window.location.reload()}>刷新</button><span className="admin-last-updated">上次更新 10:24</span><div className="admin-account-shell"><button className="admin-account-trigger" type="button" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen}>管理员 {adminName.slice(0, 1)} <span aria-hidden="true">⌄</span></button>{accountMenuOpen && <div className="admin-account-menu"><div className="admin-account-summary"><strong>{adminName}</strong><small>{adminEmail}</small></div><button type="button" onClick={() => { setPasswordError(""); setPasswordDialogOpen(true); setAccountMenuOpen(false); }}><Icon name="lock" />修改密码</button><button type="button" className="danger" disabled={busy === "signout"} onClick={() => void signOut()}><Icon name="logout" />{busy === "signout" ? "退出中…" : "退出登录"}</button></div>}</div></div></header><div className={`admin-content ${initialView === "reviews" ? "admin-content-review-list" : ""}`}>{initialView !== "reviews" && initialView !== "comments" && initialView !== "rules" && initialView !== "feedbacks" && initialView !== "reportwork" && initialView !== "reportcomment" && initialView !== "reportuser" && initialView !== "users" && <div className="admin-page-title"><div><p className="admin-eyebrow">INKLAND OPERATIONS</p><h1>{viewCopy[initialView].title}</h1><p>{viewCopy[initialView].description}</p></div><button className="admin-btn admin-btn-light" type="button" onClick={() => window.location.reload()}>刷新数据</button></div>}{loadErrors.length > 0 && <div className="admin-alert admin-alert-error" role="alert">部分数据加载失败，请检查数据库配置。</div>}{message && <div className="admin-toast" role="status">{message}</div>}{content}</div></main>
    {passwordDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordDialogOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title" onSubmit={changePassword}><div className="admin-modal-header"><div><h2 id="change-password-title">修改管理员密码</h2><p className="admin-modal-desc">需要先验证当前密码。新密码至少8位。</p></div><button className="admin-modal-close" type="button" aria-label="关闭修改管理员密码" onClick={() => setPasswordDialogOpen(false)}><Icon name="x" /></button></div><label className="admin-field">当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="admin-field">新密码<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label><label className="admin-field">再次输入新密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>{passwordError && <div className="admin-alert admin-alert-error" role="alert">{passwordError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "password"} onClick={() => setPasswordDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === "password"}>{busy === "password" ? "保存中…" : "确认修改"}</button></div></form></div>}
    {ruleDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRuleDialogOpen(false); }}><form className="admin-modal admin-rule-modal" role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title" onSubmit={saveRule}><div className="admin-modal-header"><div><h2 id="rule-dialog-title">{editingRule ? "编辑规则" : "添加审核规则"}</h2><p className="admin-modal-desc">{editingRule ? "当前可修改风险等级和最低命中次数；修改后只影响之后提交的内容。" : "先从少量明确的表达开始。除非以后另行调整，规则不会自动删除内容。"}</p></div><button className="admin-modal-close" type="button" aria-label="关闭审核规则弹窗" onClick={() => { setRuleDialogOpen(false); resetRuleForm(); }}><Icon name="x" /></button></div><label className="admin-field">规则类型<select value={ruleType} disabled={Boolean(editingRule)} onChange={(event) => setRuleType(event.target.value as ModerationRule["rule_type"])}><option value="keyword">关键词：命中后进入人工审核</option><option value="whitelist">白名单：排除已知误判表达</option></select></label><label className="admin-field">词语或短语<input value={rulePattern} disabled={Boolean(editingRule)} onChange={(event) => setRulePattern(event.target.value)} maxLength={500} required /></label><label className="admin-field">问题分类<select value={ruleCategory} disabled={Boolean(editingRule)} onChange={(event) => setRuleCategory(event.target.value)}>{ruleCategoryOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>{ruleType === "keyword" ? <div className="admin-rule-risk-fields"><label className="admin-field">风险级别<select value={ruleRiskLevel} onChange={(event) => handleRuleRiskChange(event.target.value as ModerationRiskLevel)}><option value="low">低风险 · 满 5 次进审核</option><option value="medium">中风险 · 满 3 次进审核</option><option value="high">高风险 · 命中 1 次进审核</option></select></label><label className="admin-field">最低命中次数<input type="number" min={1} max={999} step={1} value={ruleMinHits} onChange={(event) => setRuleMinHits(event.target.value)} /></label></div> : null}<label className="admin-field">备注（可选）<input value={ruleDescription} onChange={(event) => setRuleDescription(event.target.value)} maxLength={500} /></label>{ruleError && <div className="admin-alert admin-alert-error" role="alert">{ruleError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === (editingRule ? editingRule.id : "create-rule")} onClick={() => { setRuleDialogOpen(false); resetRuleForm(); }}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === (editingRule ? editingRule.id : "create-rule")}>{busy === (editingRule ? editingRule.id : "create-rule") ? "保存中…" : "保存规则"}</button></div></form></div>}
    {deleteRule ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== deleteRule.id) setDeleteRule(null); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-rule-title"><div className="admin-modal-header"><div><h2 id="delete-rule-title">删除这条规则？</h2><p className="admin-modal-desc">确定删除规则“{deleteRule.pattern}”吗？删除后不影响已有审核记录。</p></div></div><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === deleteRule.id} onClick={() => setDeleteRule(null)}>取消</button><button className="admin-btn admin-btn-danger-fill" type="button" disabled={busy === deleteRule.id} onClick={() => void confirmRemoveRule()}>{busy === deleteRule.id ? "删除中…" : "确认删除"}</button></div></div></div> : null}
    {bulkRiskDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "bulk-rule-risk") setBulkRiskDialogOpen(false); }}><div className="admin-modal admin-rule-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-risk-title"><div className="admin-modal-header"><div><h2 id="bulk-risk-title">批量调整风险等级</h2><p className="admin-modal-desc">已选 {selectedRuleIds.size} 条关键词；最低命中次数会同步为对应风险的默认值。</p></div></div><label className="admin-field">风险级别<select value={bulkTargetRisk} onChange={(event) => setBulkTargetRisk(event.target.value as ModerationRiskLevel)}><option value="low">低风险 · 满 5 次进审核</option><option value="medium">中风险 · 满 3 次进审核</option><option value="high">高风险 · 命中 1 次进审核</option></select></label><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-rule-risk"} onClick={() => setBulkRiskDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="button" disabled={busy === "bulk-rule-risk"} onClick={() => void runBulkRuleRisk()}>{busy === "bulk-rule-risk" ? "保存中…" : "确认调整"}</button></div></div></div>}
    {bulkCategoryDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "bulk-rule-category") setBulkCategoryDialogOpen(false); }}><div className="admin-modal admin-rule-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-category-title"><div className="admin-modal-header"><div><h2 id="bulk-category-title">批量调整所属分类</h2><p className="admin-modal-desc">已选 {selectedRuleIds.size} 条关键词；新的分类会同步用于后续审核命中记录。</p></div></div><label className="admin-field">所属分类<select value={bulkTargetCategory} onChange={(event) => setBulkTargetCategory(event.target.value)}>{ruleCategoryOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-rule-category"} onClick={() => setBulkCategoryDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="button" disabled={busy === "bulk-rule-category"} onClick={() => void runBulkRuleCategory()}>{busy === "bulk-rule-category" ? "保存中…" : "确认调整"}</button></div></div></div>}
    {bulkDeleteConfirm && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "bulk-rule-delete") setBulkDeleteConfirm(false); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title"><div className="admin-modal-header"><div><h2 id="bulk-delete-title">删除选中的 {selectedRuleIds.size} 条敏感词？</h2><p className="admin-modal-desc">删除后不再参与审核匹配，也不会影响已有审核记录。</p></div></div><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-rule-delete"} onClick={() => setBulkDeleteConfirm(false)}>取消</button><button className="admin-btn admin-btn-danger-fill" type="button" disabled={busy === "bulk-rule-delete"} onClick={() => void confirmBulkRemoveRule()}>{busy === "bulk-rule-delete" ? "删除中…" : "确认删除"}</button></div></div></div>}
    {bulkImportOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "bulk-import") setBulkImportOpen(false); }}><div className="admin-modal admin-bulk-import-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title"><div className="admin-modal-header"><div><h2 id="bulk-import-title">批量导入敏感词</h2><p className="admin-modal-desc">整批统一使用同一组分类、风险级别和最低命中次数。</p></div></div>{bulkResult ? <div className="admin-bulk-result"><div className="admin-bulk-result-head"><div className="is-inserted"><strong>{bulkResult.inserted}</strong><span>新增</span></div><div><strong>{bulkResult.skipped}</strong><span>跳过</span></div><div><strong>{bulkResult.invalidLines}</strong><span>无效</span></div></div>{bulkResult.invalidExamples.length > 0 ? <div className="admin-bulk-result-invalid"><strong>无效行示例</strong>{bulkResult.invalidExamples.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</div> : null}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-import"} onClick={closeBulkImport}>完成</button><button className="admin-btn admin-btn-primary" type="button" disabled={busy === "bulk-import"} onClick={resetBulkImport}>再导一批</button></div></div> : <form onSubmit={(event) => { event.preventDefault(); void runBulkImport(); }}><label className="admin-field admin-bulk-source-field">敏感词文本<textarea value={bulkText} onChange={(event) => { setBulkText(event.target.value); setBulkError(""); }} placeholder="每行一个敏感词" rows={8} autoFocus /></label><div className="admin-bulk-file-row"><label className="admin-btn admin-btn-light admin-bulk-file-btn"><Icon name="upload" />选择文件<input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={handleBulkFile} /></label>{bulkFileName ? <span className="admin-bulk-file-name">{bulkFileName}</span> : <span className="admin-bulk-file-hint">支持 .txt / .csv，每行一个</span>}</div><div className="admin-bulk-form-grid admin-bulk-form-grid-3"><label className="admin-field">问题分类<select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>{ruleCategoryOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="admin-field">风险级别<select value={bulkRiskLevel} onChange={(event) => handleBulkRiskChange(event.target.value as ModerationRiskLevel)}><option value="low">低风险 · 满 5 次</option><option value="medium">中风险 · 满 3 次</option><option value="high">高风险 · 命中 1 次</option></select></label><label className="admin-field">最低命中次数<input type="number" min={1} max={999} step={1} value={bulkMinHits} onChange={(event) => setBulkMinHits(event.target.value)} /></label></div><label className="admin-field admin-bulk-note-field">本批备注（可选）<input value={bulkDescription} onChange={(event) => setBulkDescription(event.target.value)} maxLength={500} /></label>{bulkPreview.values.length > 0 ? <div className="admin-bulk-preview"><div className="admin-bulk-preview-stats"><span>候选 <b>{bulkValidCount}</b> 条</span>{bulkPreview.duplicatedInBatch > 0 ? <span>重复已合并 <b>{bulkPreview.duplicatedInBatch}</b> 条</span> : null}{bulkInvalidCount > 0 ? <span>无效 <b>{bulkInvalidCount}</b> 条</span> : null}</div><div className="admin-bulk-preview-list">{bulkPreview.values.slice(0, 40).map((value, index) => <div className={`admin-bulk-preview-row ${value.length > 500 ? "is-invalid" : ""}`} key={`${value}-${index}`}><span>{value.length > 500 ? "超长" : index + 1}</span><strong>{value}</strong></div>)}{bulkPreview.values.length > 40 ? <div className="admin-bulk-preview-more">还有 {bulkPreview.values.length - 40} 条未显示</div> : null}</div></div> : null}{bulkError && <div className="admin-alert admin-alert-error" role="alert">{bulkError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-import"} onClick={closeBulkImport}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === "bulk-import" || bulkPreview.values.length === 0}>{busy === "bulk-import" ? "导入中…" : "确认导入"}</button></div></form>}</div></div>}
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
