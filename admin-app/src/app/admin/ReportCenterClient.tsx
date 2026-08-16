"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";

type ReportTab = "posts" | "comments" | "reporters" | "targetUsers";

type FilterState = {
  status: "all" | "pending" | "reviewing" | "kept" | "reminded" | "deleted" | "no_violation" | "content_case" | "profile_changes" | "warned" | "restricted" | "suspended" | "banned";
  priority: "all" | "normal" | "high" | "urgent";
  suspicious: boolean;
  serviceError: boolean;
  multiReport: boolean;
  lowQuality: boolean;
  hidden: boolean;
  query: string;
};

type ReportCenterCase = {
  id: string;
  target_type: "post" | "comment" | "user";
  target_id: string;
  target_user_id?: string | null;
  status: string;
  priority: string;
  effective_priority?: string;
  outcome?: string | null;
  primary_reason_category?: string | null;
  report_count: number;
  first_reported_at: string;
  last_reported_at: string;
  created_at: string;
  resolved_at?: string | null;
  target_title?: string;
  target_summary?: string;
  target_nickname?: string;
  auto_review_risk?: string;
  risk_score?: number;
  suspicious_report?: boolean;
  multi_report?: boolean;
  service_error?: boolean;
  low_quality_queue?: boolean;
  hidden_for_review?: boolean;
  reporter_anomalies?: string[];
};

type ReporterRiskRow = {
  user_id: string;
  nickname?: string | null;
  avatar_url?: string | null;
  moderation_status?: string;
  created_at?: string | null;
  total_reports: number;
  pending_reports: number;
  valid_reports: number;
  invalid_reports: number;
  duplicate_attempts: number;
  reports_last_24h: number;
  reports_last_30d: number;
  report_restricted_until?: string | null;
  low_quality?: boolean;
  distinct_target_users?: number;
  focused_target?: { target_user_id: string; nickname: string; count: number } | null;
  risk_score?: number;
  risk_level?: "normal" | "high" | "urgent";
  suspicious_flags?: string[];
};

type TargetUserRow = {
  user_id: string;
  nickname?: string | null;
  avatar_url?: string | null;
  moderation_status?: string;
  created_at?: string | null;
  total_cases: number;
  pending_cases: number;
  recent30_cases: number;
  recent90_cases: number;
  recent_confirmed_violations: number;
  active_violations: number;
  deleted_items: number;
  active_restrictions: number;
  latest_case_at?: string | null;
  latest_priority?: string | null;
  risk_score?: number;
  risk_level?: "normal" | "high" | "urgent";
};

type ReportCenterPayload = {
  success: boolean;
  cases: ReportCenterCase[];
  reporters: ReporterRiskRow[];
  targetUsers: TargetUserRow[];
  counts: Record<string, number>;
  filtered: { cases: number; reporters: number; target_users: number };
};

const defaultFilters = (): FilterState => ({ status: "all", priority: "all", suspicious: false, serviceError: false, multiReport: false, lowQuality: false, hidden: false, query: "" });

const tabs: Array<{ key: ReportTab; label: string; hint: string }> = [
  { key: "posts", label: "作品举报", hint: "被举报对象为作品" },
  { key: "comments", label: "评论举报", hint: "被举报对象为评论" },
  { key: "reporters", label: "举报者风险", hint: "按举报行为识别风险举报者" },
  { key: "targetUsers", label: "被举报用户风险", hint: "近期案件与确认违规集中的用户" },
];

const statusLabels: Record<string, string> = {
  pending: "待处理",
  reviewing: "处理中",
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
  cancelled: "已取消",
  resolved: "已处理",
};
const priorityLabels: Record<string, string> = { normal: "普通", high: "优先", urgent: "紧急" };
const riskLabels: Record<string, string> = { normal: "正常", high: "高风险", urgent: "紧急风险" };
const userStatusLabels: Record<string, string> = { active: "正常", warned: "已警告", restricted: "受限", suspended: "已暂停", banned: "已封禁" };

const fmt = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function Icon({ name }: { name: "flag" | "search" | "check" | "users" }) {
  const paths: Record<string, string> = {
    flag: "M5 21V4m0 0c5-3 8 3 14 0v9c-6 3-9-3-14 0",
    search: "m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z",
    check: "m5 12 4 4L19 6",
    users: "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8a3 3 0 0 1 0 6M21 21v-2a4 4 0 0 0-3-3",
  };
  return <svg className="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function ReportCenterClient() {
  const [tab, setTab] = useState<ReportTab>("posts");
  const [applied, setApplied] = useState<FilterState>(defaultFilters);
  const [draft, setDraft] = useState<FilterState>(defaultFilters);
  const [data, setData] = useState<ReportCenterPayload>({ success: true, cases: [], reporters: [], targetUsers: [], counts: {}, filtered: { cases: 0, reporters: 0, target_users: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (tab === "posts" || tab === "comments") {
      params.set("tab", "cases");
      params.set("targetType", tab === "posts" ? "post" : "comment");
      params.set("status", applied.status);
      params.set("priority", applied.priority);
    } else {
      params.set("tab", tab === "reporters" ? "reporters" : "target_users");
      params.set("targetType", "all");
    }
    if (applied.suspicious) params.set("suspicious", "1");
    if (applied.serviceError) params.set("serviceError", "1");
    if (applied.multiReport) params.set("multiReport", "1");
    if (applied.lowQuality) params.set("lowQuality", "1");
    if (applied.hidden) params.set("hidden", "1");
    if (applied.query.trim()) params.set("q", applied.query.trim());
    params.set("limit", "100");

    fetchWithTimeout(`/api/admin/report-center?${params.toString()}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (ReportCenterPayload & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !payload?.success) {
          setError(payload?.error || "举报中心数据读取失败，请稍后重试。");
          setData({ success: true, cases: [], reporters: [], targetUsers: [], counts: {}, filtered: { cases: 0, reporters: 0, target_users: 0 } });
          return;
        }
        setData(payload);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "举报中心数据读取失败，请稍后重试。");
        setData({ success: true, cases: [], reporters: [], targetUsers: [], counts: {}, filtered: { cases: 0, reporters: 0, target_users: 0 } });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, applied]);

  const switchTab = (key: ReportTab) => {
    const next = defaultFilters();
    setDraft(next);
    setApplied(next);
    setTab(key);
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApplied({ ...draft });
  };

  const currentTab = tabs.find((item) => item.key === tab) || tabs[0];
  const rows = tab === "posts" || tab === "comments"
    ? data.cases
    : tab === "reporters"
      ? data.reporters
      : data.targetUsers;
  const currentCount = tab === "posts" || tab === "comments"
    ? data.filtered.cases
    : tab === "reporters"
      ? data.filtered.reporters
      : data.filtered.target_users;

  return <section className="admin-card admin-full-card">
    <div className="admin-card-heading">
      <div>
        <div className="admin-heading-line"><span className="admin-section-dot dot-purple" /><h2>举报中心</h2><span className="admin-count-pill">{currentCount} 条</span></div>
        <p>举报按对象和风险拆分为四个入口；同一对象的多条举报仍会合并为一个案件。</p>
      </div>
    </div>
    <div className="admin-report-tabs" role="tablist" aria-label="举报中心分类">
      {tabs.map((item) => <button
        className={`admin-report-tab ${tab === item.key ? "is-active" : ""}`}
        type="button"
        role="tab"
        aria-selected={tab === item.key}
        key={item.key}
        onClick={() => switchTab(item.key)}
      ><span>{item.label}</span><small>{item.hint}</small></button>)}
    </div>
    <form className="admin-report-filters" onSubmit={applyFilters}>
      {(tab === "posts" || tab === "comments") ? <>
        <label className="admin-report-filter-field">处理状态<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as FilterState["status"] })} disabled={loading}>
          <option value="all">全部状态</option>
          <option value="pending">待处理</option>
          <option value="reviewing">处理中</option>
          <option value="kept">已保留</option>
          <option value="reminded">已提醒</option>
          <option value="deleted">已删除</option>
          <option value="no_violation">举报不成立</option>
          <option value="content_case">已转为内容案件</option>
          <option value="profile_changes">已要求修改资料</option>
          <option value="warned">已警告</option>
          <option value="restricted">已限制功能</option>
          <option value="suspended">已暂停</option>
          <option value="banned">已永久封禁</option>
        </select></label>
        <label className="admin-report-filter-field">优先级<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as FilterState["priority"] })} disabled={loading}>
          <option value="all">全部优先级</option>
          <option value="normal">普通</option>
          <option value="high">优先</option>
          <option value="urgent">紧急</option>
        </select></label>
        <label className="admin-report-toggle"><input type="checkbox" checked={draft.multiReport} onChange={(event) => setDraft({ ...draft, multiReport: event.target.checked })} disabled={loading} /><span>多人集中举报</span></label>
      </> : null}
      <label className="admin-report-toggle"><input type="checkbox" checked={draft.suspicious} onChange={(event) => setDraft({ ...draft, suspicious: event.target.checked })} disabled={loading} /><span>疑似恶意举报</span></label>
      {(tab === "posts" || tab === "comments") ? <label className="admin-report-toggle"><input type="checkbox" checked={draft.serviceError} onChange={(event) => setDraft({ ...draft, serviceError: event.target.checked })} disabled={loading} /><span>审核服务异常</span></label> : null}
      {(tab === "posts" || tab === "comments") ? <label className="admin-report-toggle"><input type="checkbox" checked={draft.lowQuality} onChange={(event) => setDraft({ ...draft, lowQuality: event.target.checked })} disabled={loading} /><span>低质量队列</span></label> : null}
      {(tab === "posts" || tab === "comments") ? <label className="admin-report-toggle"><input type="checkbox" checked={draft.hidden} onChange={(event) => setDraft({ ...draft, hidden: event.target.checked })} disabled={loading} /><span>暂时隐藏</span></label> : null}
      <label className="admin-report-query">关键词<input value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} maxLength={100} placeholder="对象标题 / 原因 / ID" disabled={loading} /></label>
      <button className="admin-btn admin-btn-primary" type="submit" disabled={loading}>{loading ? "查询中…" : "应用筛选"}</button>
    </form>
    {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
    <div className="admin-queue-list">
      {loading ? <div className="admin-empty"><strong>正在加载{currentTab.label}…</strong><span>读取举报中心数据。</span></div>
        : rows.length === 0 ? <div className="admin-empty"><div className="admin-empty-icon"><Icon name="check" /></div><strong>没有符合条件的{currentTab.label}</strong><span>{applied.lowQuality && (tab === "posts" || tab === "comments") ? "当前没有低质量队列案件，可以取消该筛选后查看全部案件。" : "可以调整筛选条件后重新查询。"}</span></div>
          : tab === "posts" || tab === "comments"
            ? (rows as ReportCenterCase[]).map((row) => <div className="admin-queue-row" key={row.id}>
              <div className="admin-queue-badge">{row.target_type === "post" ? "作品" : "评论"}</div>
              <div className="admin-queue-main">
                <strong>{row.target_title || "未知对象"}</strong>
                <span>{row.primary_reason_category || "未填写原因"} · {row.report_count} 人举报 · 最近 {fmt(row.last_reported_at)}{row.target_nickname ? ` · ${row.target_nickname}` : ""}</span>
                <div className="admin-queue-tags">
                  <span className="admin-queue-tag">{statusLabels[row.status] || row.status || "未知"}</span>
                  {(row.effective_priority || row.priority) !== "normal" ? <span className="admin-queue-tag is-danger">{(row.effective_priority || row.priority) === "urgent" ? "紧急" : "优先"}</span> : null}
                  {row.multi_report ? <span className="admin-queue-tag">多人集中</span> : null}
                  {row.suspicious_report ? <span className="admin-queue-tag is-danger">疑似恶意</span> : null}
                  {row.service_error ? <span className="admin-queue-tag is-danger">服务异常</span> : null}
                  {row.low_quality_queue ? <span className="admin-queue-tag">低质量队列</span> : null}
                  {row.hidden_for_review ? <span className="admin-queue-tag is-danger">暂隐中</span> : null}
                  {(row.reporter_anomalies || []).map((flag) => <span className="admin-queue-tag is-danger" key={flag}>{flag}</span>)}
                </div>
              </div>
              <Link className="admin-btn admin-btn-primary" href={`/admin/reports/${row.id}`}>打开详情页</Link>
            </div>)
            : tab === "reporters"
              ? (rows as ReporterRiskRow[]).map((row) => <div className="admin-queue-row" key={row.user_id}>
                <span className="admin-user-avatar admin-user-avatar-empty">{(row.nickname || "用").slice(0, 1)}</span>
                <div className="admin-queue-main">
                  <strong>{row.nickname || "未命名用户"}<span className="admin-mono"> · {row.user_id.slice(0, 8)}</span></strong>
                  <span>{userStatusLabels[row.moderation_status || ""] || row.moderation_status || "未知"} · 举报 {row.total_reports} · 成立 {row.valid_reports} · 不成立 {row.invalid_reports} · 24h {row.reports_last_24h} · 30天 {row.reports_last_30d}{row.focused_target ? ` · 集中举报 ${row.focused_target.nickname} ×${row.focused_target.count}` : ""}</span>
                  <div className="admin-queue-tags">
                    <span className={`admin-queue-tag ${row.risk_level === "urgent" ? "is-danger" : row.risk_level === "high" ? "is-danger" : ""}`}>{riskLabels[row.risk_level || "normal"] || "正常"}</span>
                    {row.low_quality ? <span className="admin-queue-tag is-danger">低质量队列</span> : null}
                    {(row.suspicious_flags || []).map((flag) => <span className="admin-queue-tag is-danger" key={flag}>{flag}</span>)}
                  </div>
                </div>
                <Link className="admin-btn admin-btn-primary" href={`/admin/reporters/${row.user_id}`}>查看详情</Link>
              </div>)
              : (rows as TargetUserRow[]).map((row) => <div className="admin-queue-row" key={row.user_id}>
                <span className="admin-user-avatar admin-user-avatar-empty">{(row.nickname || "用").slice(0, 1)}</span>
                <div className="admin-queue-main">
                  <strong>{row.nickname || "未命名用户"}<span className="admin-mono"> · {row.user_id.slice(0, 8)}</span></strong>
                  <span>{userStatusLabels[row.moderation_status || ""] || row.moderation_status || "未知"} · 案件 {row.total_cases} · 待处理 {row.pending_cases} · 30天 {row.recent30_cases} · 确认违规 {row.recent_confirmed_violations} · 有效限制 {row.active_restrictions}</span>
                  <div className="admin-queue-tags">
                    <span className={`admin-queue-tag ${row.risk_level === "urgent" || row.risk_level === "high" ? "is-danger" : ""}`}>{riskLabels[row.risk_level || "normal"] || "正常"}</span>
                    {row.latest_priority && row.latest_priority !== "normal" ? <span className="admin-queue-tag is-danger">{row.latest_priority === "urgent" ? "最近紧急案件" : "最近优先案件"}</span> : null}
                  </div>
                </div>
                <Link className="admin-btn admin-btn-primary" href={`/admin/users/${row.user_id}`}>查看详情</Link>
              </div>)}
    </div>
  </section>;
}
