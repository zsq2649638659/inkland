"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-browser";
import { fetchWithTimeout } from "@/lib/adminFetch";
import ReportCenterClient from "./ReportCenterClient";

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
type RuleListOptions = { page?: number; pageSize?: number; risk?: RuleFilter; q?: string };
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
export type AdminView = "reviews" | "reports" | "users" | "feedbacks" | "rules";

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
  reports: { title: "举报中心", description: "举报按对象与风险分为四个入口，进入详情页查看完整内容和举报证据。" },
  users: { title: "用户管理", description: "查询用户、违规记录和功能限制。" },
  feedbacks: { title: "用户反馈", description: "查看用户提交的网站问题和建议。" },
  rules: { title: "审核规则", description: "维护关键词与白名单；命中规则只会进入人工审核，不会自动删除作品。" },
};
const riskLabels: Record<ModerationRiskLevel, { label: string; shortLabel: string; hits: number }> = {
  low: { label: "低风险 · 满 5 次进审核", shortLabel: "低风险", hits: 5 },
  medium: { label: "中风险 · 满 3 次进审核", shortLabel: "中风险", hits: 3 },
  high: { label: "高风险 · 命中 1 次进审核", shortLabel: "高风险", hits: 1 },
};
const formatRiskRule = (risk: ModerationRiskLevel, hits: number) =>
  risk === "high" ? `高风险 · 命中 ${hits} 次进审核` : `${riskLabels[risk].shortLabel} · 满 ${hits} 次进审核`;
const fmt = (value: string) => new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });

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

export default function AdminDashboard({ initialPosts, initialSeriesReviews, initialReports, initialFeedbacks, initialRules, initialRuleTotal, rulesReady, loadErrors, initialView, initialQuery = "", adminName = "管理员", adminEmail }: {
  initialPosts: PostItem[];
  initialSeriesReviews: SeriesReviewItem[];
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
  const reports = initialReports;
  const feedbacks = initialFeedbacks;
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return initialQuery ?? "";
    return sessionStorage.getItem(queryKey) ?? initialQuery ?? "";
  });
  const [ruleRows, setRuleRows] = useState<ModerationRule[]>(initialRules);
  const [ruleTotal, setRuleTotal] = useState(initialRuleTotal ?? initialRules.length);
  const [rulePage, setRulePage] = useState(1);
  const [rulePageSize, setRulePageSize] = useState(100);
  const [ruleTotalPages, setRuleTotalPages] = useState(1);
  const [ruleRiskFilter, setRuleRiskFilter] = useState<RuleFilter>("all");
  const [ruleCounts, setRuleCounts] = useState<RuleCounts | null>(null);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [ruleLoading, setRuleLoading] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [bulkRiskDialogOpen, setBulkRiskDialogOpen] = useState(false);
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
  const [ruleCategory, setRuleCategory] = useState("广告与导流");
  const [ruleRiskLevel, setRuleRiskLevel] = useState<ModerationRiskLevel>("low");
  const [ruleMinHits, setRuleMinHits] = useState("5");
  const [ruleDescription, setRuleDescription] = useState("");
  const [editingRule, setEditingRule] = useState<ModerationRule | null>(null);
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
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkFileMode, setBulkFileMode] = useState<"txt" | "csv" | null>(null);
  const [bulkCategory, setBulkCategory] = useState("广告与导流");
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
    const targetQuery = options.q ?? query;
    setRuleLoading(true); setRuleError("");
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetPageSize), risk: targetRisk });
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
      setRuleRows(payload.rules);
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
    if (initialView === "rules" && rulesReady) void loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView, rulesReady]);

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
    if (initialView !== "reviews" && initialView !== "reports") return;
    const refreshTimer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(refreshTimer);
  }, [initialView, router]);

  const nav: Array<{ view: AdminView; label: string; icon: "file" | "flag" | "users" | "message" | "lock"; count?: number }> = [
    { view: "reviews", label: "作品审核", icon: "file", count: posts.length + seriesReviews.length },
    { view: "reports", label: "举报中心", icon: "flag", count: reports.length },
    { view: "users", label: "用户管理", icon: "users" },
    { view: "feedbacks", label: "用户反馈", icon: "message", count: feedbacks.length },
    { view: "rules", label: "审核规则", icon: "lock", count: ruleTotal || undefined },
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
    setRuleError(""); setRuleType("keyword"); setRulePattern(""); setRuleCategory("广告与导流"); setRuleRiskLevel("low"); setRuleMinHits("5"); setRuleDescription(""); setEditingRule(null);
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
    setBulkText(""); setBulkFileName(""); setBulkFileMode(null); setBulkCategory("广告与导流"); setBulkRiskLevel("low"); setBulkMinHits("5"); setBulkDescription(""); setBulkError(""); setBulkResult(null); setBulkImportOpen(true);
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
    setRuleError(""); setRuleType(rule.rule_type); setRulePattern(rule.pattern); setRuleCategory(rule.category);
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
  const filteredFeedbacks = feedbacks.filter((feedback) => `${feedback.type} ${feedback.content} ${feedback.user_id}`.toLowerCase().includes(query.toLowerCase()));
  const bulkPreview = bulkImportOpen ? parseBulkLines() : { values: [], blankLines: 0, duplicatedInBatch: 0 };
  const bulkInvalidCount = bulkPreview.values.filter((value) => value.length > 500).length;
  const bulkValidCount = bulkPreview.values.length - bulkInvalidCount;

  const postsView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-orange" /><h2>发布前人工审核</h2><span className="admin-count-pill">{filteredPosts.length + seriesReviews.length} 条</span></div><p>连载信息和连载章节分开列出；打开详情页查看完整内容与风险结果后，再决定放行或打回。</p></div></div><div className="admin-table">{filteredPosts.length === 0 && seriesReviews.length === 0 ? <div className="admin-empty"><strong>没有符合条件的待审核作品</strong></div> : <>{filteredPosts.map((post) => <div className="admin-table-row" key={post.id}><div className="admin-work-cell"><div className="admin-work-thumb">{post.title.slice(0, 1)}</div><div><strong>{post.title || "无标题"}</strong><span>{post.post_type === "serial" ? "连载章节（章节标题/正文）" : labels[post.post_type || ""] || "作品"}{post.review_reason ? ` · ${post.review_reason}` : ""}</span></div></div><span className="admin-author-cell">{post.author?.nickname || "未知作者"}</span><span className="admin-date-cell">{fmt(post.created_at)}</span><div className="admin-row-actions"><Link className="admin-btn admin-btn-primary" href={`/admin/reviews/${post.id}`}>查看章节审核</Link></div></div>)}{seriesReviews.map((item) => <div className="admin-table-row" key={`series-${item.id}`}><div className="admin-work-cell"><div className="admin-work-thumb">连</div><div><strong>{item.series?.name || "未命名连载"}</strong><span>连载信息（名称/简介） · {item.route_reason}</span></div></div><span className="admin-author-cell">作者 ID {item.series?.user_id?.slice(0, 8) || "未知"}</span><span className="admin-date-cell">{fmt(item.created_at)}</span><div className="admin-row-actions"><Link className="admin-btn admin-btn-primary" href={`/admin/series-reviews/${item.series_id}`}>查看连载审核</Link></div></div>)}</>}</div></section>;

  const feedbacksView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div className="admin-heading-line"><span className="admin-section-dot dot-blue" /><h2>反馈收件箱</h2></div></div><div className="admin-queue-list">{filteredFeedbacks.length === 0 ? <div className="admin-empty"><strong>没有符合条件的用户反馈</strong></div> : filteredFeedbacks.map((item) => <div className="admin-queue-row" key={item.id}><div className="admin-queue-badge badge-blue">{item.type}</div><div className="admin-queue-main"><strong>{item.content}</strong><span>{fmt(item.created_at)} · 用户 {item.user_id.slice(0, 8)}</span></div><button className="admin-btn admin-btn-light" disabled={busy === item.id} onClick={() => void handleFeedback(item.id)}>标记已处理</button></div>)}</div></section>;

  const rulesView = (
    <section className="admin-card admin-full-card">
      <div className="admin-card-heading">
        <div>
          <div className="admin-heading-line"><span className="admin-section-dot dot-green" /><h2>敏感词与白名单</h2><span className="admin-count-pill">{ruleTotal} 条</span></div>
          <p>关键词按风险等级与最低命中次数进入人工审核；白名单可排除明确的误判表达。</p>
        </div>
        {rulesReady && <div className="admin-actions"><button className="admin-btn admin-btn-light admin-bulk-import-btn" type="button" onClick={openBulkImport}><Icon name="upload" />批量导入</button><button className="admin-btn admin-btn-primary" type="button" onClick={() => { resetRuleForm(); setRuleDialogOpen(true); }}>添加规则</button></div>}
      </div>
      {!rulesReady ? <div className="admin-empty"><strong>审核规则数据表尚未启用</strong><span>风险分级功能需先执行 moderation-risk-thresholds-v1.sql。</span></div> : <>
        <div className="admin-rule-toolbar">
          <div className="admin-rule-filters">
            {([["all", "全部"], ["low", "低风险"], ["medium", "中风险"], ["high", "高风险"], ["whitelist", "白名单"]] as Array<[RuleFilter, string]>).map(([risk, label]) => (
              <button className={`admin-filter ${ruleRiskFilter === risk ? "is-selected" : ""}`} type="button" key={risk} onClick={() => changeRuleRiskFilter(risk)}>{label}<span>{ruleCounts ? ruleCounts[risk] : "…"}</span></button>
            ))}
          </div>
          <div className="admin-rule-bulkbar">
            <label className="admin-rule-select-all"><input type="checkbox" checked={ruleRows.length > 0 && ruleRows.every((rule) => selectedRuleIds.has(rule.id))} onChange={toggleAllPageRules} aria-label="全选本页敏感词" /><span>全选本页</span></label>
            <span className="admin-rule-selected">{selectedRuleIds.size > 0 ? `已选 ${selectedRuleIds.size} 条` : "未选择"}</span>
            <div className="admin-rule-bulk-actions">
              <button className="admin-btn admin-btn-light" type="button" disabled={selectedRuleIds.size === 0 || busy === "bulk-rule-status"} onClick={() => void runBulkRuleEnabled(true)}>批量启用</button>
              <button className="admin-btn admin-btn-light" type="button" disabled={selectedRuleIds.size === 0 || busy === "bulk-rule-status"} onClick={() => void runBulkRuleEnabled(false)}>批量停用</button>
              <button className="admin-btn admin-btn-light" type="button" disabled={selectedRuleIds.size === 0 || busy === "bulk-rule-risk"} onClick={openBulkRiskDialog}>改风险</button>
              <button className="admin-btn admin-btn-light is-danger" type="button" disabled={selectedRuleIds.size === 0 || busy === "bulk-rule-delete"} onClick={() => setBulkDeleteConfirm(true)}>批量删除</button>
            </div>
          </div>
        </div>
        {ruleError ? <div className="admin-alert admin-alert-error" role="alert">{ruleError}</div> : null}
        {ruleLoading ? <div className="admin-rule-loading">敏感词加载中…</div> : ruleRows.length === 0 ? <div className="admin-empty"><strong>{query.trim() ? "没有匹配的敏感词" : "还没有敏感词"}</strong><span>{query.trim() ? "换个关键词或筛选条件试试。" : "低风险词默认满 5 次进审核，中风险 3 次，高风险 1 次。"}</span></div> : <div className="admin-queue-list">{ruleRows.map((rule) => (
          <div className="admin-rule-row" key={rule.id}>
            <input className="admin-rule-checkbox" type="checkbox" checked={selectedRuleIds.has(rule.id)} onChange={() => toggleRuleSelection(rule.id)} aria-label={`选择 ${rule.pattern}`} />
            <div className={`admin-rule-kind ${rule.rule_type === "whitelist" ? "is-whitelist" : ""}`}>{rule.rule_type === "whitelist" ? "白名单" : "关键词"}</div>
            {rule.rule_type === "keyword" ? <span className={`admin-risk-badge is-${rule.risk_level || "low"}`}>{riskLabels[rule.risk_level || "low"].shortLabel}</span> : null}
            <div className="admin-queue-main"><strong>{rule.pattern}</strong><span>{rule.category} · {rule.rule_type === "whitelist" ? "白名单，排除误判表达" : formatRiskRule(rule.risk_level || "low", rule.min_hits ?? riskLabels[rule.risk_level || "low"].hits)}{rule.description ? ` · ${rule.description}` : ""}</span></div>
            <span className={`admin-rule-status ${rule.enabled ? "is-enabled" : ""}`}>{rule.enabled ? "已启用" : "已停用"}</span>
            <div className="admin-actions">
              {rule.rule_type === "keyword" ? <button className="admin-btn admin-btn-light" disabled={busy === rule.id} onClick={() => openEditRule(rule)}>编辑</button> : null}
              <button className="admin-btn admin-btn-light" disabled={busy === rule.id} onClick={() => void updateRuleEnabled(rule)}>{rule.enabled ? "停用" : "启用"}</button>
              <button className="admin-btn admin-btn-light" disabled={busy === rule.id} onClick={() => void removeRule(rule)}>删除</button>
            </div>
          </div>
        ))}</div>}
        {ruleTotal > 0 ? <div className="admin-rule-pagination">
          <span className="admin-rule-pageinfo">第 {rulePage} / {ruleTotalPages} 页 · 共 {ruleTotal} 条</span>
          <div className="admin-rule-pager">
            <button className="admin-pagination-btn" type="button" disabled={rulePage <= 1 || ruleLoading} onClick={() => void loadRules({ page: rulePage - 1 })}>上一页</button>
            <button className="admin-pagination-btn" type="button" disabled={rulePage >= ruleTotalPages || ruleLoading} onClick={() => void loadRules({ page: rulePage + 1 })}>下一页</button>
            <label className="admin-rule-page-size">每页<select value={rulePageSize} onChange={changeRulePageSize} aria-label="每页显示数量"><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option></select></label>
          </div>
        </div> : null}
      </>}
    </section>
  );

  const usersView = <section className="admin-card admin-full-card"><div className="admin-card-heading"><div><div className="admin-heading-line"><span className="admin-section-dot dot-teal" /><h2>用户搜索</h2><span className="admin-count-pill">{userSearched ? `${userResults.length} 位用户` : "输入关键词查询"}</span></div><p>按昵称或用户 ID 搜索；打开详情页可查看举报、违规与限制记录并执行处罚。</p></div></div><form className="admin-user-search" onSubmit={searchUsers}><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="昵称或完整用户 ID" aria-label="搜索用户" /><button className="admin-btn admin-btn-primary" type="submit" disabled={userLoading}>{userLoading ? "搜索中…" : "搜索"}</button></form>{userError ? <div className="admin-alert admin-alert-error" role="alert">{userError}</div> : null}<div className="admin-queue-list">{!userSearched ? <div className="admin-empty"><strong>还没有搜索</strong><span>输入昵称或用户 ID 后开始查询。</span></div> : userResults.length === 0 ? <div className="admin-empty"><strong>没有找到该用户</strong><span>昵称支持模糊匹配，ID 支持完整值。</span></div> : userResults.map((user) => <div className="admin-queue-row" key={user.id}><span className="admin-user-avatar admin-user-avatar-empty">{(user.nickname || "用").slice(0, 1)}</span><div className="admin-queue-main"><strong>{user.nickname || "未命名用户"}</strong><span className="admin-mono">{user.id}</span><span>{userStatusLabels[user.moderation_status] || user.moderation_status} · 举报案件 {user.total_report_cases} · 待处理 {user.pending_report_cases} · 有效违规 {user.active_violations} · 有效限制 {user.active_restrictions}</span></div><Link className="admin-btn admin-btn-primary" href={`/admin/users/${user.id}`}>查看详情</Link></div>)}</div></section>;

  const content = initialView === "reviews" ? postsView : initialView === "reports" ? <ReportCenterClient /> : initialView === "feedbacks" ? feedbacksView : initialView === "rules" ? rulesView : initialView === "users" ? usersView : <section className="admin-card admin-full-card"><div className="admin-coming-soon"><Icon name="users" /><strong>页面尚未接入</strong><span>请从左侧选择后台功能。</span></div></section>;

  return <div className="admin-app-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span className="admin-brand-mark">i</span><span>inkland</span><small>OPERATIONS</small></div>
      <div className="admin-nav-group"><p>后台功能</p>{nav.map((item) => <Link className={`admin-nav-item ${initialView === item.view ? "is-active" : ""}`} href={`/admin?view=${item.view}`} key={item.view} onClick={rememberListScroll} aria-current={initialView === item.view ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}</Link>)}</div>
      <div className="admin-sidebar-user"><span className="admin-avatar">{adminName.slice(0, 1)}</span><div><strong>{adminName}</strong><small>{adminEmail}</small></div><button type="button" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen}>账户</button>{accountMenuOpen && <div className="admin-account-menu"><button type="button" onClick={() => { setPasswordError(""); setPasswordDialogOpen(true); setAccountMenuOpen(false); }}><Icon name="lock" />修改密码</button><button type="button" className="danger" disabled={busy === "signout"} onClick={() => void signOut()}><Icon name="logout" />{busy === "signout" ? "退出中…" : "退出登录"}</button></div>}</div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-breadcrumb"><span>管理后台</span><Icon name="arrow" /><strong>{viewCopy[initialView].title}</strong></div><div className="admin-top-actions"><button className="admin-btn admin-btn-light admin-global-search-btn" type="button" onClick={() => { setGlobalQuery(""); setGlobalError(""); setGlobalResults(null); setGlobalSearchOpen(true); }}><Icon name="search" />全局搜索</button><label className="admin-search"><Icon name="search" /><input value={query} onChange={(event) => handleQueryChange(event.target.value)} placeholder="搜索当前列表" aria-label="搜索当前列表" /></label><span className="admin-live"><i />后台已连接</span></div></header><div className="admin-content"><div className="admin-page-title"><div><p className="admin-eyebrow">INKLAND OPERATIONS</p><h1>{viewCopy[initialView].title}</h1><p>{viewCopy[initialView].description}</p></div><button className="admin-btn admin-btn-light" type="button" onClick={() => window.location.reload()}>刷新数据</button></div>{loadErrors.length > 0 && <div className="admin-alert admin-alert-error" role="alert">部分数据加载失败，请检查数据库配置。</div>}{message && <div className="admin-toast" role="status">{message}</div>}{content}</div></main>
    {passwordDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordDialogOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title" onSubmit={changePassword}><div className="admin-modal-header"><div><h2 id="change-password-title">修改管理员密码</h2><p className="admin-modal-desc">需要先验证当前密码。新密码至少8位。</p></div></div><label className="admin-field">当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="admin-field">新密码<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label><label className="admin-field">再次输入新密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>{passwordError && <div className="admin-alert admin-alert-error" role="alert">{passwordError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "password"} onClick={() => setPasswordDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === "password"}>{busy === "password" ? "保存中…" : "确认修改"}</button></div></form></div>}
    {ruleDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRuleDialogOpen(false); }}><form className="admin-modal admin-rule-modal" role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title" onSubmit={saveRule}><div className="admin-modal-header"><div><h2 id="rule-dialog-title">{editingRule ? "编辑规则" : "添加审核规则"}</h2><p className="admin-modal-desc">{editingRule ? "当前可修改风险等级和最低命中次数；修改后只影响之后提交的内容。" : "先从少量明确的表达开始。除非以后另行调整，规则不会自动删除内容。"}</p></div></div><label className="admin-field">规则类型<select value={ruleType} disabled={Boolean(editingRule)} onChange={(event) => setRuleType(event.target.value as ModerationRule["rule_type"])}><option value="keyword">关键词：命中后进入人工审核</option><option value="whitelist">白名单：排除已知误判表达</option></select></label><label className="admin-field">词语或短语<input value={rulePattern} disabled={Boolean(editingRule)} onChange={(event) => setRulePattern(event.target.value)} maxLength={500} required /></label><label className="admin-field">问题分类<select value={ruleCategory} disabled={Boolean(editingRule)} onChange={(event) => setRuleCategory(event.target.value)}><option>广告与导流</option><option>诈骗与交易风险</option><option>人身攻击与骚扰</option><option>暴力与威胁</option><option>成人与不当内容</option><option>其他</option></select></label>{ruleType === "keyword" ? <div className="admin-rule-risk-fields"><label className="admin-field">风险级别<select value={ruleRiskLevel} onChange={(event) => handleRuleRiskChange(event.target.value as ModerationRiskLevel)}><option value="low">低风险 · 满 5 次进审核</option><option value="medium">中风险 · 满 3 次进审核</option><option value="high">高风险 · 命中 1 次进审核</option></select></label><label className="admin-field">最低命中次数<input type="number" min={1} max={999} step={1} value={ruleMinHits} onChange={(event) => setRuleMinHits(event.target.value)} /></label></div> : null}<label className="admin-field">备注（可选）<input value={ruleDescription} onChange={(event) => setRuleDescription(event.target.value)} maxLength={500} /></label>{ruleError && <div className="admin-alert admin-alert-error" role="alert">{ruleError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === (editingRule ? editingRule.id : "create-rule")} onClick={() => { setRuleDialogOpen(false); resetRuleForm(); }}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === (editingRule ? editingRule.id : "create-rule")}>{busy === (editingRule ? editingRule.id : "create-rule") ? "保存中…" : "保存规则"}</button></div></form></div>}
    {deleteRule ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== deleteRule.id) setDeleteRule(null); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-rule-title"><div className="admin-modal-header"><div><h2 id="delete-rule-title">删除这条规则？</h2><p className="admin-modal-desc">确定删除规则“{deleteRule.pattern}”吗？删除后不影响已有审核记录。</p></div></div><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === deleteRule.id} onClick={() => setDeleteRule(null)}>取消</button><button className="admin-btn admin-btn-danger-fill" type="button" disabled={busy === deleteRule.id} onClick={() => void confirmRemoveRule()}>{busy === deleteRule.id ? "删除中…" : "确认删除"}</button></div></div></div> : null}
    {bulkRiskDialogOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "bulk-rule-risk") setBulkRiskDialogOpen(false); }}><div className="admin-modal admin-rule-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-risk-title"><div className="admin-modal-header"><div><h2 id="bulk-risk-title">批量调整风险等级</h2><p className="admin-modal-desc">已选 {selectedRuleIds.size} 条关键词；最低命中次数会同步为对应风险的默认值。</p></div></div><label className="admin-field">风险级别<select value={bulkTargetRisk} onChange={(event) => setBulkTargetRisk(event.target.value as ModerationRiskLevel)}><option value="low">低风险 · 满 5 次进审核</option><option value="medium">中风险 · 满 3 次进审核</option><option value="high">高风险 · 命中 1 次进审核</option></select></label><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-rule-risk"} onClick={() => setBulkRiskDialogOpen(false)}>取消</button><button className="admin-btn admin-btn-primary" type="button" disabled={busy === "bulk-rule-risk"} onClick={() => void runBulkRuleRisk()}>{busy === "bulk-rule-risk" ? "保存中…" : "确认调整"}</button></div></div></div>}
    {bulkDeleteConfirm && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "bulk-rule-delete") setBulkDeleteConfirm(false); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title"><div className="admin-modal-header"><div><h2 id="bulk-delete-title">删除选中的 {selectedRuleIds.size} 条敏感词？</h2><p className="admin-modal-desc">删除后不再参与审核匹配，也不会影响已有审核记录。</p></div></div><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-rule-delete"} onClick={() => setBulkDeleteConfirm(false)}>取消</button><button className="admin-btn admin-btn-danger-fill" type="button" disabled={busy === "bulk-rule-delete"} onClick={() => void confirmBulkRemoveRule()}>{busy === "bulk-rule-delete" ? "删除中…" : "确认删除"}</button></div></div></div>}
    {bulkImportOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "bulk-import") setBulkImportOpen(false); }}><div className="admin-modal admin-bulk-import-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title"><div className="admin-modal-header"><div><h2 id="bulk-import-title">批量导入敏感词</h2><p className="admin-modal-desc">整批统一使用同一组分类、风险级别和最低命中次数。</p></div></div>{bulkResult ? <div className="admin-bulk-result"><div className="admin-bulk-result-head"><div className="is-inserted"><strong>{bulkResult.inserted}</strong><span>新增</span></div><div><strong>{bulkResult.skipped}</strong><span>跳过</span></div><div><strong>{bulkResult.invalidLines}</strong><span>无效</span></div></div>{bulkResult.invalidExamples.length > 0 ? <div className="admin-bulk-result-invalid"><strong>无效行示例</strong>{bulkResult.invalidExamples.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</div> : null}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-import"} onClick={closeBulkImport}>完成</button><button className="admin-btn admin-btn-primary" type="button" disabled={busy === "bulk-import"} onClick={resetBulkImport}>再导一批</button></div></div> : <form onSubmit={(event) => { event.preventDefault(); void runBulkImport(); }}><label className="admin-field admin-bulk-source-field">敏感词文本<textarea value={bulkText} onChange={(event) => { setBulkText(event.target.value); setBulkError(""); }} placeholder="每行一个敏感词" rows={8} autoFocus /></label><div className="admin-bulk-file-row"><label className="admin-btn admin-btn-light admin-bulk-file-btn"><Icon name="upload" />选择文件<input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={handleBulkFile} /></label>{bulkFileName ? <span className="admin-bulk-file-name">{bulkFileName}</span> : <span className="admin-bulk-file-hint">支持 .txt / .csv，每行一个</span>}</div><div className="admin-bulk-form-grid admin-bulk-form-grid-3"><label className="admin-field">问题分类<select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}><option>广告与导流</option><option>诈骗与交易风险</option><option>人身攻击与骚扰</option><option>暴力与威胁</option><option>成人与不当内容</option><option>其他</option></select></label><label className="admin-field">风险级别<select value={bulkRiskLevel} onChange={(event) => handleBulkRiskChange(event.target.value as ModerationRiskLevel)}><option value="low">低风险 · 满 5 次</option><option value="medium">中风险 · 满 3 次</option><option value="high">高风险 · 命中 1 次</option></select></label><label className="admin-field">最低命中次数<input type="number" min={1} max={999} step={1} value={bulkMinHits} onChange={(event) => setBulkMinHits(event.target.value)} /></label></div><label className="admin-field admin-bulk-note-field">本批备注（可选）<input value={bulkDescription} onChange={(event) => setBulkDescription(event.target.value)} maxLength={500} /></label>{bulkPreview.values.length > 0 ? <div className="admin-bulk-preview"><div className="admin-bulk-preview-stats"><span>候选 <b>{bulkValidCount}</b> 条</span>{bulkPreview.duplicatedInBatch > 0 ? <span>重复已合并 <b>{bulkPreview.duplicatedInBatch}</b> 条</span> : null}{bulkInvalidCount > 0 ? <span>无效 <b>{bulkInvalidCount}</b> 条</span> : null}</div><div className="admin-bulk-preview-list">{bulkPreview.values.slice(0, 40).map((value, index) => <div className={`admin-bulk-preview-row ${value.length > 500 ? "is-invalid" : ""}`} key={`${value}-${index}`}><span>{value.length > 500 ? "超长" : index + 1}</span><strong>{value}</strong></div>)}{bulkPreview.values.length > 40 ? <div className="admin-bulk-preview-more">还有 {bulkPreview.values.length - 40} 条未显示</div> : null}</div></div> : null}{bulkError && <div className="admin-alert admin-alert-error" role="alert">{bulkError}</div>}<div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy === "bulk-import"} onClick={closeBulkImport}>取消</button><button className="admin-btn admin-btn-primary" type="submit" disabled={busy === "bulk-import" || bulkPreview.values.length === 0}>{busy === "bulk-import" ? "导入中…" : "确认导入"}</button></div></form>}</div></div>}
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
