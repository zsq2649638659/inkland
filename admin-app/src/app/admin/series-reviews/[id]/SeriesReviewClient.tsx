"use client";

import Link from "next/link";
import { useState } from "react";

const issueTypes = ["连载名称或简介违规", "成人或不当内容", "攻击、骚扰或歧视性内容", "广告、诈骗或导流", "其他需要修改的问题"];
const categoryLabels: Record<string, string> = { adult: "成人或不当内容", porn: "成人或不当内容" };

export default function SeriesReviewClient({ series, reviewCase, findings }: { series: { id: string; name: string; description: string | null; tags: string[]; series_type: string; created_at: string; review_reason: string | null; review_submission_number?: number | null }; reviewCase: { route_reason: string; rules_version: string } | null; findings: Array<{ id: string; category: string; quoted_text: string | null; details: string | null }> }) {
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "approved" | "rejected", reason?: string) => {
    setBusy(true);
    const response = await fetch("/api/admin/series-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seriesId: series.id, decision, reason }) });
    setBusy(false);
    if (!response.ok) return;
    window.location.assign("/admin?view=reviews");
  };
  return <main className="admin-detail-shell"><header className="admin-detail-top"><Link href="/admin?view=reviews" className="admin-back-link">← 返回作品审核</Link><span className="admin-detail-status">待审核</span></header><div className="admin-review-heading"><div className="admin-detail-kicker">SERIES REVIEW · 连载信息（名称/简介）</div><h1>{series.name}</h1><div className="admin-detail-meta">提交于 {new Date(series.created_at).toLocaleString("zh-CN")} · 第 {series.review_submission_number || 1} 次提交</div></div><div className="admin-review-layout"><aside className="admin-review-summary-column"><section className="admin-detail-panel"><h2>系统审核结果</h2><p>{reviewCase?.route_reason || "连载信息命中审核关键词"}</p><dl><dt>审核来源</dt><dd>违规词库</dd><dt>规则版本</dt><dd>{reviewCase?.rules_version || "keyword-v1"}</dd></dl></section><section className="admin-detail-panel admin-risk-panel"><h2>风险标记</h2>{findings.length ? findings.map((finding) => <div className="admin-risk-item" key={finding.id}><strong>{categoryLabels[finding.category] || finding.category}</strong><small>命中内容：{finding.quoted_text || "未记录"}</small></div>) : <p>未取得具体风险标记。</p>}</section></aside><article className="admin-detail-content admin-review-main"><section className="admin-evidence-document"><div className="admin-document-label">连载信息</div><h2>{series.name}</h2><div className="admin-long-content">{series.description || "未填写简介"}</div>{series.tags?.length ? <p>标签：{series.tags.join("、")}</p> : null}</section></article><aside className="admin-review-action-column"><section className="admin-detail-panel admin-reject-panel"><h2>标记问题并打回</h2><p>点击问题类型后立即打回作者修改。</p><div className="admin-issue-buttons">{issueTypes.map((issue) => <button key={issue} type="button" disabled={busy} onClick={() => void decide("rejected", issue)}>{issue}</button>)}</div></section><section className="admin-detail-panel admin-approve-panel"><h2>确认无违规</h2><button className="admin-detail-secondary" disabled={busy} onClick={() => void decide("approved")}>确认无违规并放行</button></section></aside></div></main>;
}
