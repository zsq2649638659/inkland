"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/adminFetch";
import { normalizeModerationReason } from "@/lib/moderationReasons";
import { displayPublicId } from "@/lib/publicIds";

type ReportPageKind = "post" | "comment" | "user";
type ReportMode = "pending" | "history";
type ReportFilterState = {
  reason: string;
  priority: "all" | "normal" | "high" | "urgent";
  outcome: string;
  sort: "latest" | "priority";
};

type ReportCenterCase = {
  id: string;
  public_id?: string | null;
  target_type: "post" | "comment" | "user";
  target_id: string;
  target_public_id?: string | null;
  target_user_id?: string | null;
  target_user_public_id?: string | null;
  status: string;
  priority: string;
  effective_priority?: string;
  outcome?: string | null;
  primary_reason_category?: string | null;
  report_count: number;
  reporter_count?: number;
  latest_reporter_id?: string | null;
  latest_reporter_public_id?: string | null;
  latest_reporter_nickname?: string | null;
  first_reported_at: string;
  last_reported_at: string;
  created_at: string;
  resolved_at?: string | null;
  target_title?: string;
  target_summary?: string;
  target_nickname?: string;
  snapshot_post_id?: string | null;
  snapshot_post_public_id?: string | null;
  snapshot_post_title?: string | null;
};

type ReportCenterPayload = {
  success: boolean;
  cases: ReportCenterCase[];
  reporters: unknown[];
  targetUsers: unknown[];
  counts: Record<string, number>;
  filtered: { cases: number; reporters: number; target_users: number };
};

type Props = { initialKind: ReportPageKind };

const PAGE_SIZE = 20;
const ADMIN_TIME_ZONE = "Asia/Shanghai";
const defaultFilters = (): ReportFilterState => ({ reason: "all", priority: "all", outcome: "all", sort: "latest" });
const priorityLabels: Record<string, string> = { normal: "一般", high: "中", urgent: "高" };
const priorityRank: Record<string, number> = { normal: 1, high: 2, urgent: 3 };
const outcomeLabels: Record<string, string> = {
  kept: "保留内容",
  reminded: "保留并提醒",
  deleted: "删除并警告",
  no_violation: "举报不成立",
  content_case: "已转为内容案件",
  profile_changes: "已要求修改资料",
  warned: "警告并记录",
  restricted: "已限制功能",
  suspended: "已暂停账号",
  banned: "永久封禁账号",
};
const statusLabels: Record<string, string> = { pending: "待处理", reviewing: "处理中", resolved: "已处置", cancelled: "已取消" };

const pageConfig: Record<ReportPageKind, { label: string; headers: string[] }> = {
  post: { label: "作品举报", headers: ["案件", "作品", "作者", "举报原因", "最新举报人", "规模", "优先级 / 结论", "时间"] },
  comment: { label: "评论举报", headers: ["案件", "原评论", "所属作品", "发布者", "举报原因", "最新举报人", "规模", "优先级 / 结论", "时间"] },
  user: { label: "用户举报", headers: ["案件", "被举报人", "举报原因", "最新举报人", "规模", "优先级 / 结论", "时间"] },
};

function Icon({ name }: { name: "check" }) {
  const path = name === "check" ? "m5 12 4 4L19 6" : "";
  return <svg className="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

function relativeTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const now = new Date();
  const start = (item: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: ADMIN_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(item);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    return Date.UTC(year, month - 1, day);
  };
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ADMIN_TIME_ZONE });
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `昨天 ${time}`;
  if (days === 2) return `前天 ${time}`;
  return `${date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", timeZone: ADMIN_TIME_ZONE })} ${time}`;
}

function CopyId({ value, copied, onCopy }: { value?: string | null; copied: string | null; onCopy: (value: string) => void }) {
  if (!value) return null;
  return <button className={`admin-report-id ${copied === value ? "is-copied" : ""}`} type="button" title={copied === value ? "已复制" : `复制 ${value}`} aria-label={`复制 ID ${value}`} onClick={(event) => { event.stopPropagation(); onCopy(value); }}>{value}</button>;
}

function CellText({ primary, secondary, copied, onCopy, className = "" }: { primary?: string | null; secondary?: string | null; copied: string | null; onCopy: (value: string) => void; className?: string }) {
  return <div className={`admin-report-cell ${className}`}>
    {primary ? <strong title={primary}>{primary}</strong> : <span className="admin-report-muted">—</span>}
    {secondary ? <CopyId value={secondary} copied={copied} onCopy={onCopy} /> : null}
  </div>;
}

export default function ReportCenterClient({ initialKind }: Props) {
  const router = useRouter();
  const config = pageConfig[initialKind];
  const [mode, setMode] = useState<ReportMode>("pending");
  const [filters, setFilters] = useState<ReportFilterState>(defaultFilters);
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ReportCenterPayload>({ success: true, cases: [], reporters: [], targetUsers: [], counts: {}, filtered: { cases: 0, reporters: 0, target_users: 0 } });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ tab: "cases", targetType: initialKind, status: "all", priority: "all", limit: "200" });
    if (query) params.set("q", query);
    fetchWithTimeout(`/api/admin/report-center?${params.toString()}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (ReportCenterPayload & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !payload?.success) {
          setError(payload?.error || "举报中心数据读取失败，请稍后重试。");
          setData({ success: true, cases: [], reporters: [], targetUsers: [], counts: {}, filtered: { cases: 0, reporters: 0, target_users: 0 } });
          return;
        }
        setData({ ...payload, cases: payload.cases.map((row) => ({ ...row, primary_reason_category: normalizeModerationReason(row.primary_reason_category) || null })) });
        setPage(1);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "举报中心数据读取失败，请稍后重试。");
        setData({ success: true, cases: [], reporters: [], targetUsers: [], counts: {}, filtered: { cases: 0, reporters: 0, target_users: 0 } });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialKind, query]);

  const pendingRows = useMemo(() => data.cases.filter((row) => row.status === "pending" || row.status === "reviewing"), [data.cases]);
  const historyRows = useMemo(() => data.cases.filter((row) => row.status === "resolved" || row.status === "cancelled" || Boolean(row.outcome)), [data.cases]);
  const sourceRows = mode === "pending" ? pendingRows : historyRows;
  const reasons = useMemo(() => [...new Set(data.cases.map((row) => row.primary_reason_category).filter((value): value is string => Boolean(value)))], [data.cases]);
  const outcomes = useMemo(() => [...new Set(historyRows.map((row) => row.outcome).filter((value): value is string => Boolean(value)))], [historyRows]);
  const filteredRows = useMemo(() => {
    const rows = sourceRows.filter((row) => {
      const normalizedQuery = queryDraft.trim().toLowerCase();
      const searchable = [
      row.id,
        displayPublicId(row.public_id, row.id),
        displayPublicId(row.target_public_id, row.target_id),
        displayPublicId(row.target_user_public_id, row.target_user_id),
        row.target_title,
        row.target_summary,
        row.target_nickname,
        row.primary_reason_category,
        row.latest_reporter_id,
        row.latest_reporter_nickname,
        row.snapshot_post_id,
        row.snapshot_post_title,
      ].filter(Boolean).join(" ").toLowerCase();
      if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
      const priority = row.effective_priority || row.priority || "normal";
      if (filters.reason !== "all" && row.primary_reason_category !== filters.reason) return false;
      if (mode === "pending" && filters.priority !== "all" && priority !== filters.priority) return false;
      if (mode === "history" && filters.outcome !== "all" && row.outcome !== filters.outcome) return false;
      return true;
    });
    return rows.sort((a, b) => {
      if (mode === "pending" && filters.sort === "priority") {
        const priorityDiff = (priorityRank[b.effective_priority || b.priority || "normal"] || 0) - (priorityRank[a.effective_priority || a.priority || "normal"] || 0);
        if (priorityDiff) return priorityDiff;
      }
      return new Date(b.resolved_at || b.last_reported_at).getTime() - new Date(a.resolved_at || a.last_reported_at).getTime();
    });
  }, [filters, mode, queryDraft, sourceRows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const updateFilters = (next: Partial<ReportFilterState>) => { setFilters((current) => ({ ...current, ...next })); setPage(1); };
  const switchMode = (next: ReportMode) => { setMode(next); setPage(1); };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setQuery(queryDraft.trim()); setPage(1); };
  const copyId = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((current) => current === value ? null : current), 1400);
    } catch {
      setError("ID 复制失败，请手动选择复制。");
    }
  };
  const openCase = (id: string) => router.push(`/admin/reports/${id}`);
  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCase(id); } };

  const renderPriorityOrOutcome = (row: ReportCenterCase) => mode === "history"
    ? <span className="admin-report-outcome" title={outcomeLabels[row.outcome || ""] || statusLabels[row.status] || row.outcome || "已处置"}>{outcomeLabels[row.outcome || ""] || statusLabels[row.status] || row.outcome || "已处置"}</span>
    : <span className={`admin-report-priority is-${row.effective_priority || row.priority || "normal"}`}>{priorityLabels[row.effective_priority || row.priority || "normal"] || "一般"}</span>;

  const renderRow = (row: ReportCenterCase) => {
    const reporter = row.latest_reporter_nickname || "举报人";
    const reporterId = row.latest_reporter_id || null;
    const reporterDisplayId = displayPublicId(row.latest_reporter_public_id, reporterId);
    const reporterCount = row.reporter_count || 0;
    const scale = row.report_count > 0 ? reporterCount > 1 ? `${reporterCount} 人 · ${row.report_count} 次` : `${row.report_count} 次` : "—";
    const reason = row.primary_reason_category || "未填写原因";
    const caseCell = <div className="admin-report-cell is-case"><CopyId value={displayPublicId(row.public_id, row.id)} copied={copied} onCopy={copyId} /></div>;
    const reporterCell = <CellText primary={reporter} secondary={reporterId ? reporterDisplayId : null} copied={copied} onCopy={copyId} />;
    const contentCell = initialKind === "post"
      ? <CellText primary={row.target_title || "未知作品"} secondary={displayPublicId(row.target_public_id, row.target_id)} copied={copied} onCopy={copyId} />
      : initialKind === "comment"
        ? <CellText primary={row.target_summary || "评论内容已不存在"} secondary={displayPublicId(row.target_public_id, row.target_id)} copied={copied} onCopy={copyId} className="is-comment" />
        : <CellText primary={row.target_nickname || row.target_title || "未知用户"} secondary={displayPublicId(row.target_public_id, row.target_id)} copied={copied} onCopy={copyId} />;
    const cells = initialKind === "post"
      ? [caseCell, contentCell, <CellText key="author" primary={row.target_nickname || "未知作者"} secondary={displayPublicId(row.target_user_public_id, row.target_user_id)} copied={copied} onCopy={copyId} />, <span key="reason" className="admin-report-plain">{reason}</span>, reporterCell, <span key="scale" className="admin-report-plain">{scale}</span>, <span key="decision">{renderPriorityOrOutcome(row)}</span>, <span key="time" className="admin-report-plain">{relativeTime(mode === "history" ? row.resolved_at || row.last_reported_at : row.last_reported_at)}</span>]
      : initialKind === "comment"
        ? [caseCell, contentCell, <CellText key="work" primary={row.snapshot_post_title || row.target_title?.replace(/^评论于/, "") || "未知作品"} secondary={displayPublicId(row.snapshot_post_public_id, row.snapshot_post_id)} copied={copied} onCopy={copyId} />, <CellText key="author" primary={row.target_nickname || "未知用户"} secondary={displayPublicId(row.target_user_public_id, row.target_user_id)} copied={copied} onCopy={copyId} />, <span key="reason" className="admin-report-plain">{reason}</span>, reporterCell, <span key="scale" className="admin-report-plain">{scale}</span>, <span key="decision">{renderPriorityOrOutcome(row)}</span>, <span key="time" className="admin-report-plain">{relativeTime(mode === "history" ? row.resolved_at || row.last_reported_at : row.last_reported_at)}</span>]
        : [caseCell, contentCell, <span key="reason" className="admin-report-plain">{reason}</span>, reporterCell, <span key="scale" className="admin-report-plain">{scale}</span>, <span key="decision">{renderPriorityOrOutcome(row)}</span>, <span key="time" className="admin-report-plain">{relativeTime(mode === "history" ? row.resolved_at || row.last_reported_at : row.last_reported_at)}</span>];
    return <div className="admin-report-table-row" role="button" tabIndex={0} key={row.id} onClick={() => openCase(row.id)} onKeyDown={(event) => onRowKeyDown(event, row.id)}>{cells.map((cell, index) => <div key={`${row.id}-${index}`}>{cell}</div>)}</div>;
  };

  return <section className="admin-report-page">
    <div className="admin-report-list-tabs" role="tablist" aria-label={`${config.label}状态`}>
      <button className={mode === "pending" ? "is-active" : ""} type="button" role="tab" aria-selected={mode === "pending"} onClick={() => switchMode("pending")}>待处理举报（{pendingRows.length}）</button>
      <button className={mode === "history" ? "is-active" : ""} type="button" role="tab" aria-selected={mode === "history"} onClick={() => switchMode("history")}>举报记录（{historyRows.length}）</button>
      {mode === "history" ? <span className="admin-report-view-note">只读举报记录，不提供再次处置</span> : null}
      <form className="admin-report-search" onSubmit={submitSearch}><input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="搜索案件编号 / 标题 / 当事人 / ID" aria-label="搜索举报案件" maxLength={100} /></form>
      {mode === "pending" ? <button className="admin-report-sort" type="button" onClick={() => updateFilters({ sort: filters.sort === "latest" ? "priority" : "latest" })}>{filters.sort === "latest" ? "按最新" : "按优先级"} ⇄</button> : null}
    </div>
    <div className="admin-report-filter-card">
      <div className="admin-report-filter-groups">
        <div className="admin-report-filter-group"><span>举报原因</span><div role="group" aria-label="举报原因"><button className={filters.reason === "all" ? "is-selected" : ""} type="button" onClick={() => updateFilters({ reason: "all" })}>全部</button>{reasons.map((reason) => <button className={filters.reason === reason ? "is-selected" : ""} type="button" key={reason} onClick={() => updateFilters({ reason })}>{reason}</button>)}</div></div>
        {mode === "pending" ? <div className="admin-report-filter-group"><span>优先级</span><div role="group" aria-label="优先级"><button className={filters.priority === "all" ? "is-selected" : ""} type="button" onClick={() => updateFilters({ priority: "all" })}>全部</button>{(["urgent", "high", "normal"] as const).map((priority) => <button className={filters.priority === priority ? "is-selected" : ""} type="button" key={priority} onClick={() => updateFilters({ priority })}>{priorityLabels[priority]}</button>)}</div></div> : <div className="admin-report-filter-group"><span>处置结论</span><div role="group" aria-label="处置结论"><button className={filters.outcome === "all" ? "is-selected" : ""} type="button" onClick={() => updateFilters({ outcome: "all" })}>全部</button>{outcomes.map((outcome) => <button className={filters.outcome === outcome ? "is-selected" : ""} type="button" key={outcome} onClick={() => updateFilters({ outcome })}>{outcomeLabels[outcome] || outcome}</button>)}</div></div>}
      </div>
    </div>
    {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
    <div className={`admin-report-table admin-report-table-${initialKind}`}>
      <div className="admin-report-table-head">{config.headers.map((header) => <span key={header}>{header}</span>)}</div>
      {loading ? <div className="admin-report-table-state"><strong>正在加载{config.label}…</strong><span>读取真实举报案件。</span></div> : visibleRows.length ? visibleRows.map(renderRow) : <div className="admin-report-table-state"><div className="admin-empty-icon"><Icon name="check" /></div><strong>当前筛选下暂无{config.label}</strong><span>{query || filters.reason !== "all" || (mode === "pending" ? filters.priority !== "all" : filters.outcome !== "all") ? "可以调整筛选条件后重新查询。" : "目前没有需要展示的真实举报案件。"}</span></div>}
    </div>
    <div className="admin-report-pagination"><span>共 {filteredRows.length} 条 · 第 {Math.min(page, pageCount)} / {pageCount} 页</span><div><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button><button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>下一页</button></div></div>
  </section>;
}
