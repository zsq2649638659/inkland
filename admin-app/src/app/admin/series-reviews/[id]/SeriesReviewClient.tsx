"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";

const issueTypes = ["连载名称或简介违规", "成人或不当内容", "攻击、骚扰或歧视性内容", "广告、诈骗或导流", "其他需要修改的问题"];
const categoryLabels: Record<string, string> = { adult: "成人或不当内容", porn: "成人或不当内容" };

type SeriesProps = {
  series: { id: string; name: string; description: string | null; tags: string[]; series_type: string; created_at: string; review_reason: string | null; review_submission_number?: number | null };
  reviewCase: { route_reason: string; rules_version: string } | null;
  findings: Array<{ id: string; category: string; quoted_text: string | null; details: string | null }>;
};

export default function SeriesReviewClient({ series, reviewCase, findings }: SeriesProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [selectedIssueTypes, setSelectedIssueTypes] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [view, setView] = useState<"issues" | "preview">("issues");
  const panelRef = useRef<HTMLElement | null>(null);
  const actionBtnRef = useRef<HTMLButtonElement | null>(null);
  const previewActionsRef = useRef<HTMLDivElement | null>(null);

  const previewLines = useMemo(() => {
    const lines = selectedIssueTypes.map((issue) => ({ type: "问题类型", text: issue }));
    if (note.trim()) lines.push({ type: "打回说明", text: note.trim() });
    return lines;
  }, [selectedIssueTypes, note]);

  const canReject = selectedIssueTypes.length > 0;
  const rejectRuleText = selectedIssueTypes.length === 0
    ? "请至少勾选一项问题类型，然后预览打回内容。"
    : "已勾选问题类型；可补充说明后预览打回内容。";

  useLayoutEffect(() => {
    if (view !== "issues") return;
    const panel = panelRef.current;
    const actionBtn = actionBtnRef.current;
    const slot = previewActionsRef.current;
    if (!panel || !actionBtn || !slot) return;
    panel.style.height = "auto";
    panel.style.height = `${Math.ceil(panel.getBoundingClientRect().height)}px`;
    const panelRect = panel.getBoundingClientRect();
    const buttonTop = actionBtn.getBoundingClientRect().top;
    const panelCss = getComputedStyle(panel);
    const padBottom = (parseFloat(panelCss.paddingBottom) || 0) + (parseFloat(panelCss.borderBottomWidth) || 0);
    const slotHeight = Math.max(36, Math.ceil(panelRect.bottom - padBottom - buttonTop));
    slot.style.height = `${slotHeight}px`;
  }, [view, selectedIssueTypes.length, note]);

  useEffect(() => {
    if (view !== "preview") return;
    const panel = panelRef.current;
    if (!panel) return;
    const timer = window.setTimeout(() => {
      const scroll = panel.querySelector<HTMLElement>(".admin-reject-preview");
      if (scroll) scroll.scrollTop = 0;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view]);

  const toggleIssue = (issue: string) => {
    setSelectedIssueTypes((items) => items.includes(issue) ? items.filter((item) => item !== issue) : [...items, issue]);
  };

  const openPreview = () => {
    if (selectedIssueTypes.length === 0) {
      setMessage("请先勾选至少一项问题类型。");
      return;
    }
    setMessage("");
    setView("preview");
  };

  const submitReject = async () => {
    if (selectedIssueTypes.length === 0) {
      setMessage("请先勾选至少一项问题类型。");
      return;
    }
    const reason = note.trim() ? `${selectedIssueTypes.join("、")}。${note.trim()}` : selectedIssueTypes.join("、");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/series-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId: series.id, decision: "rejected", reason }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setBusy(false);
      if (!response.ok) {
        setMessage(payload?.error || "打回失败，请稍后重试。");
        setView("issues");
        return;
      }
      window.location.assign("/admin?view=reviews");
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "打回失败，请稍后重试。");
      setView("issues");
    }
  };

  const submitApprove = async () => {
    setBusy(true);
    setApproveError("");
    try {
      const response = await fetchWithTimeout("/api/admin/series-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId: series.id, decision: "approved", reason: null }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setBusy(false);
      if (!response.ok) {
        setApproveError(payload?.error || "放行失败，请稍后重试。");
        return;
      }
      window.location.assign("/admin?view=reviews");
    } catch (error) {
      setBusy(false);
      setApproveError(error instanceof Error ? error.message : "放行失败，请稍后重试。");
    }
  };

  return (
    <main className="admin-detail-shell">
      <header className="admin-detail-top">
        <Link href="/admin?view=reviews" className="admin-back-link">← 返回作品审核</Link>
        <span className="admin-detail-status">待审核</span>
      </header>

      <div className="admin-review-heading">
        <div className="admin-detail-kicker">SERIES REVIEW · 连载信息（名称/简介）</div>
        <h1>{series.name}</h1>
        <div className="admin-detail-meta">
          提交于 {new Date(series.created_at).toLocaleString("zh-CN")} · 第 {series.review_submission_number || 1} 次提交
        </div>
      </div>

      <div className="admin-review-layout">
        <aside className="admin-review-summary-column">
          <section className="admin-detail-panel">
            <h2>系统审核结果</h2>
            <p>{reviewCase?.route_reason || "连载信息命中审核关键词"}</p>
            <dl>
              <dt>审核来源</dt>
              <dd>违规词库</dd>
              <dt>规则版本</dt>
              <dd>{reviewCase?.rules_version || "keyword-v1"}</dd>
            </dl>
          </section>
          <section className="admin-detail-panel admin-risk-panel">
            <h2>风险标记</h2>
            {findings.length ? (
              <div className="admin-risk-list">
                {findings.map((finding) => (
                  <div className="admin-risk-item" key={finding.id}>
                    <strong>{categoryLabels[finding.category] || finding.category}</strong>
                    <small>命中内容：{finding.quoted_text || "未记录"}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p>未取得具体风险标记。</p>
            )}
          </section>
        </aside>

        <article className="admin-detail-content admin-review-main">
          <section className="admin-evidence-document">
            <div className="admin-document-label">连载信息</div>
            <h2>{series.name}</h2>
            <div className="admin-long-content">{series.description || "未填写简介"}</div>
            {series.tags?.length ? <p>标签：{series.tags.join("、")}</p> : null}
          </section>
        </article>

        <aside className="admin-review-action-column">
          <section className="admin-detail-panel admin-reject-panel" ref={panelRef}>
            <div className="admin-panel-title-row">
              <h2>标记问题并打回</h2>
              <span>已选 {selectedIssueTypes.length} 项</span>
            </div>
            <div className="admin-reject-issue-view" style={view === "preview" ? { display: "none" } : undefined}>
              <h3 className="admin-reject-section-title">问题类型</h3>
              <div className="admin-issue-grid">
                {issueTypes.map((issue) => (
                  <button
                    key={issue}
                    type="button"
                    disabled={busy}
                    className={`admin-issue-chip${selectedIssueTypes.includes(issue) ? " is-on" : ""}`}
                    onClick={() => toggleIssue(issue)}
                  >
                    <span className="admin-issue-box" />
                    {issue}
                  </button>
                ))}
              </div>
              <label className="admin-field">
                补充说明（选填）
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充需要作者修改的说明" maxLength={200} disabled={busy} />
              </label>
              <div className="admin-reject-bottom">
                <p className={`admin-reject-rule${canReject ? " is-ready" : ""}`}>{rejectRuleText}</p>
                <button ref={actionBtnRef} className="admin-detail-danger admin-reject-submit" type="button" disabled={busy || !canReject} onClick={openPreview}>
                  标记问题并打回
                </button>
              </div>
            </div>
            <div className="admin-reject-preview" style={view === "preview" ? undefined : { display: "none" }}>
              <h3 className="admin-preview-title">打回内容预览（将发送给作者）</h3>
              <div className="admin-preview-lines">
                {previewLines.length ? previewLines.map((line, index) => (
                  <div className="admin-preview-line" key={`${line.type}-${index}`}>
                    <span className="admin-preview-dot" />
                    <span><b>[{line.type}]</b> {line.text}</span>
                  </div>
                )) : <p className="admin-preview-empty">尚未勾选问题类型。</p>}
              </div>
              <div className="admin-reject-bottom" ref={previewActionsRef}>
                <div className="admin-preview-actions">
                  <button className="admin-preview-confirm" type="button" disabled={busy || previewLines.length === 0} onClick={() => void submitReject()}>
                    {busy ? "提交中…" : "确认打回"}
                  </button>
                  <button className="admin-preview-cancel" type="button" disabled={busy} onClick={() => setView("issues")}>
                    返回修改
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="admin-detail-panel admin-approve-panel">
            <h2>确认无违规</h2>
            <p>仅在确认连载名称和简介没有违规时放行。放行后作者可以继续发布章节。</p>
            <button className="admin-detail-secondary" type="button" disabled={busy} onClick={() => { setApproveError(""); setConfirmApprove(true); }}>
              确认无违规并放行
            </button>
          </section>

          {message ? <div className="admin-detail-message" role="status">{message}</div> : null}
        </aside>
      </div>

      {confirmApprove ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmApprove(false); }}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="approve-series-title">
            <div className="admin-modal-header">
              <div>
                <h2 id="approve-series-title">确认连载信息无违规？</h2>
                <p className="admin-modal-desc">确认后连载将结束审核，作者可继续发布章节。</p>
              </div>
            </div>
            {approveError ? <div className="admin-alert admin-alert-error" role="alert">{approveError}</div> : null}
            <div className="admin-modal-actions">
              <button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setConfirmApprove(false)}>取消</button>
              <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void submitApprove()}>{busy ? "发布中…" : "确认放行"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
