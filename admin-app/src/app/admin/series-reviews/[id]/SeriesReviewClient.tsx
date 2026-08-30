"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";

const issueTypes = ["连载名称或简介违规", "成人或不当内容", "攻击、骚扰或歧视性内容", "广告、诈骗或导流", "其他需要修改的问题"];
const categoryLabels: Record<string, string> = { adult: "成人或不当内容", porn: "成人或不当内容" };

type SeriesProps = {
  series: { id: string; user_id: string; name: string; description: string | null; tags: string[]; series_type: string; created_at: string; review_reason: string | null; review_submission_number?: number | null };
  reviewCase: { id?: string; status?: string | null; route_reason?: string | null; rules_version?: string | null; screening_status?: string | null; screening_sources?: string[] | null; created_at?: string | null; decided_by?: string | null; decided_at?: string | null; submission_number?: number | null } | null;
  reviewHistory: Array<{ id: string; status: string; route_reason?: string | null; screening_status?: string | null; screening_sources?: string[] | null; rules_version?: string | null; created_at: string; decided_by?: string | null; decided_at?: string | null; submission_number?: number | null }>;
  findings: Array<{ id: string; category: string; source?: string | null; severity?: string | null; quoted_text: string | null; details: string | null }>;
};

export default function SeriesReviewClient({ pendingCount, series, reviewCase, reviewHistory, findings }: SeriesProps & { pendingCount: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [selectedIssueTypes, setSelectedIssueTypes] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [view, setView] = useState<"issues" | "preview">("issues");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const actionBtnRef = useRef<HTMLButtonElement | null>(null);
  const previewActionsRef = useRef<HTMLDivElement | null>(null);

  const previewLines = useMemo(() => {
    const lines = selectedIssueTypes.map((issue) => ({ type: "问题类型", text: issue }));
    if (note.trim()) lines.push({ type: "打回说明", text: note.trim() });
    return lines;
  }, [selectedIssueTypes, note]);

  const canReject = selectedIssueTypes.length > 0;
  const active = ["pending", "reviewing"].includes(reviewCase?.status || "");
  const currentSubmissionNumber = reviewCase?.submission_number || series.review_submission_number || 1;
  const rejectRuleText = selectedIssueTypes.length === 0
    ? "请至少勾选一项问题类型，然后预览打回内容。"
    : "已勾选问题类型；可补充说明后预览打回内容。";
  const riskLevel = findings.some((finding) => finding.severity === "high") ? "高" : findings.length ? "中" : "低";
  const screeningSourceLabel = (source?: string | null) => source === "keyword" ? "违禁词库" : source === "semantic" ? "语义模型" : source === "manual" ? "人工送审" : source || "未记录";
  const reviewStatusLabel = (status: string) => status === "approved" ? "审核放行" : status === "changes_requested" ? "退回作者修改" : status === "cancelled" ? "审核任务关闭" : status === "service_error" ? "审核服务异常" : status === "reviewing" ? "开始人工审核" : "进入人工审核";
  const reviewActorLabel = (actor?: string | null) => actor ? `管理员 ${actor.slice(0, 8)}` : "系统";

  const copyId = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      setMessage("当前环境无法复制 ID，请手动选择文本。");
    }
  };

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
    const preview = slot.closest(".admin-reject-preview");
    const previewCss = preview ? getComputedStyle(preview) : null;
    const padBottom = (parseFloat(panelCss.paddingBottom) || 0) + (parseFloat(panelCss.borderBottomWidth) || 0)
      + (previewCss ? (parseFloat(previewCss.paddingBottom) || 0) + (parseFloat(previewCss.borderBottomWidth) || 0) : 0);
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
    if (!active || selectedIssueTypes.length === 0) {
      setMessage("请先勾选至少一项问题类型。");
      return;
    }
    setMessage("");
    setView("preview");
  };

  const submitReject = async () => {
    if (!active || selectedIssueTypes.length === 0) {
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
    if (!active) return;
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
    <div className="admin-app-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span className="admin-brand-mark"><svg viewBox="0 0 1535 857" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M253 848C278.56 726.64 291.64 598.27 319.94 477.94C340.59 390.11 383.9 316.25 462.37 268.37C590.46 190.21 798.39 207.91 841.07 374.94C866.81 475.66 796.07 590.94 900.35 663.66C1008.05 738.76 1144.21 668.58 1231.02 597.02C1258.43 574.42 1284.44 529.68 1325.43 542.57L1338.05 549.95L1490.94 845.01L1310.99 847L1230.02 689.9C1174.48 744.13 1114.63 795.5 1042.33 826.33C869.05 900.22 671.92 843.47 691.05 625.05C697.88 547.05 757.52 410.78 644.51 379.48C557.04 355.26 495.68 418.68 475.63 497.62C446.93 610.64 440.1 734.58 410 847.99H253V848Z"/><path d="M1185 0L1099.01 487.99L1346 240H1535C1443.66 336.03 1351.46 442.56 1251.02 529.02C1161.29 606.26 958.98 728.81 930.89 530.97L1025 0.01H1185V0Z"/><path d="M301 60L158 848H0L137 60H301Z"/></svg></span><span>Inkland 管理后台</span></div>
        <div className="admin-nav-group"><p>后台功能</p><nav aria-label="后台主导航">
          <Link className="admin-nav-item is-active" href="/admin?view=reviews"><span>作品审核</span>{pendingCount > 0 ? <b>{pendingCount}</b> : null}</Link>
          <Link className="admin-nav-item" href="/admin?view=comments"><span>评论审核</span></Link>
          <Link className="admin-nav-item" href="/admin?view=reportwork"><span>作品举报</span></Link>
          <Link className="admin-nav-item" href="/admin?view=reportcomment"><span>评论举报</span></Link>
          <Link className="admin-nav-item" href="/admin?view=reportuser"><span>用户举报</span></Link>
          <Link className="admin-nav-item" href="/admin?view=users"><span>用户管理</span></Link>
          <Link className="admin-nav-item" href="/admin?view=feedbacks"><span>用户反馈</span></Link>
          <Link className="admin-nav-item" href="/admin?view=rules"><span>审核规则</span></Link>
        </nav></div>
        <div className="admin-sidebar-foot">Inkland 内容治理后台<br />设计稿 · uicraft</div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-breadcrumb"><strong>管理后台 / 作品审核 / 连载详情</strong></div>
          <div className="admin-top-actions"><button className="admin-btn admin-btn-light" type="button">全局搜索 <span className="admin-shortcut">⌘ K</span></button><button className="admin-btn admin-btn-light" type="button" onClick={() => window.location.reload()}>刷新</button><span className="admin-last-updated">上次更新 10:24</span><button className="admin-account-trigger" type="button">管理员 A <span aria-hidden="true">⌄</span></button></div>
        </header>
        <div className="admin-review-detail-page admin-detail-shell">
      <header className="admin-detail-head">
        <div className="admin-detail-nav">
          <Link href="/admin?view=reviews" className="admin-btn admin-btn-light">← 返回作品审核</Link>
          <span className="admin-detail-queue-label">{active ? "当前连载审核详情" : "只读审核记录"}</span>
          <button className="admin-btn admin-btn-light" type="button" disabled>下一个连载 →</button>
        </div>
        <div className="admin-detail-title-line">
          <span className={`admin-risk-pill${riskLevel === "高" ? " is-high" : ""}`}>风险等级：{riskLevel}</span>
          <h1>{series.name}</h1>
        </div>
        <div className="admin-detail-meta-line">
          <p className="admin-detail-meta">
            连载信息 · 第 {currentSubmissionNumber} 次入审 · {new Date(reviewCase?.created_at || series.created_at).toLocaleString("zh-CN")} · 入审方式：{reviewCase?.route_reason || "自动命中"}
          </p>
          <div className="admin-entity-ids">
            <button type="button" className={`admin-copy-id${copiedKey === "series" ? " is-copied" : ""}`} title="点击复制连载 ID" onClick={() => void copyId("series", series.id)}>
              {copiedKey === "series" ? "已复制连载 ID" : `连载 ${series.id}`}
            </button>
            <button type="button" className={`admin-copy-id${copiedKey === "user" ? " is-copied" : ""}`} title="点击复制作者 ID" onClick={() => void copyId("user", series.user_id)}>
              {copiedKey === "user" ? "已复制作者 ID" : `作者 ${series.user_id}`}
            </button>
          </div>
        </div>
      </header>

      <div className="admin-review-layout">
        <div className="admin-review-doc">
          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>送审原因</h2></div>
            <div className="admin-evidence">
              {reviewCase?.route_reason || series.review_reason || "连载信息命中审核关键词"}；审核来源：{(reviewCase?.screening_sources || []).map(screeningSourceLabel).join("、") || "未记录"}；自动审核状态：{reviewCase?.screening_status === "failed" ? "自动审核异常，等待人工处理" : reviewCase?.screening_status === "completed" ? "已完成自动审核，等待人工决定" : "未记录自动审核状态"}；规则版本：{reviewCase?.rules_version || "keyword-v1"}。
            </div>
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>机审标记 · 人工核对</h2><span>{findings.length} 项</span></div>
            <p>逐条核对系统命中内容，确认是否需要作者修改。</p>
            {findings.length ? (
              <div className="admin-finding-list">
                {findings.map((finding) => (
                  <div className="admin-finding-item" key={finding.id}>
                    <div className="admin-finding-head"><strong>{categoryLabels[finding.category] || finding.category}</strong><span className="admin-finding-status">待确认</span></div>
                    <div className="admin-finding-tags"><span>{finding.severity === "high" ? "高风险" : "命中规则"}</span><span className="is-source">{screeningSourceLabel(finding.source)}</span></div>
                    {finding.quoted_text ? <blockquote>{finding.quoted_text}</blockquote> : null}
                    {finding.details ? <small>{finding.details}</small> : null}
                  </div>
                ))}
              </div>
            ) : <p>系统没有取得具体风险标记，可结合连载名称和简介直接判断。</p>}
          </section>

          <section className="admin-detail-panel admin-snapshot">
            <div className="admin-panel-title-row"><h2>内容快照（冻结版本）</h2><span>第 {currentSubmissionNumber} 次提交</span></div>
            <section className="admin-evidence-document">
              <div className="admin-document-label">FROZEN SERIES · 审核中固定版本</div>
              <h2>{series.name}</h2>
              <div className="admin-field-block"><h3>连载简介</h3><div className="admin-long-content">{series.description || "未填写简介"}</div></div>
              <div className="admin-field-block"><h3>连载信息</h3><dl className="admin-detail-meta-grid"><dt>连载类型</dt><dd>{series.series_type || "未填写"}</dd><dt>标签</dt><dd>{series.tags?.length ? series.tags.join("、") : "未设置标签"}</dd></dl></div>
            </section>
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>审核轨迹</h2><span>{reviewHistory.length} 条</span></div>
            <ul className="admin-timeline">{reviewHistory.length ? reviewHistory.map((item) => <li key={item.id}><b>{reviewStatusLabel(item.status)} · 第 {item.submission_number || currentSubmissionNumber} 次提交</b><span>{new Date(item.decided_at || item.created_at).toLocaleString("zh-CN")} · {reviewActorLabel(item.decided_by)}</span></li>) : <li><b>未记录审核轨迹</b><span>—</span></li>}</ul>
          </section>
          <section className="admin-detail-panel admin-audit">
            <div className="admin-panel-title-row"><h2>审计元数据</h2><span>系统记录</span></div>
            <dl>
              <div><dt>审核服务</dt><dd>{(reviewCase?.screening_sources || []).map(screeningSourceLabel).join("、") || "未记录"}</dd></div>
              <div><dt>规则版本</dt><dd>{reviewCase?.rules_version || "—"}</dd></div>
              <div><dt>冻结对象</dt><dd>{series.id}</dd></div>
              <div><dt>入审方式</dt><dd>{reviewCase?.route_reason || "自动命中"}</dd></div>
              <div><dt>提交编号</dt><dd>{currentSubmissionNumber}</dd></div>
              <div><dt>记录状态</dt><dd>{reviewStatusLabel(reviewCase?.status || "")}</dd></div>
            </dl>
          </section>
        </div>

        <aside className="admin-review-decision">
          {active ? <section className="admin-detail-panel admin-decision-panel" ref={panelRef}>
            <h2>审核决定</h2>
            <button className="admin-decision-approve" type="button" disabled={busy} onClick={() => { setApproveError(""); setConfirmApprove(true); }}>放行（无问题）</button>
            <button className="admin-decision-reject" type="button" disabled={busy} onClick={() => { setRejectOpen(true); setView("issues"); }}>退回作者修改…</button>
            {rejectOpen ? (
              <div className="admin-reject-zone">
                <p>选择问题类型后进入通知预览，确认后才退回作者修改并通知对方。</p>
                <div className="admin-reject-issue-view" style={view === "preview" ? { display: "none" } : undefined}>
                  <div className="admin-panel-title-row"><h3 className="admin-reject-section-title">问题类型</h3><span>已选 {selectedIssueTypes.length} 项</span></div>
                  <div className="admin-issue-grid">{issueTypes.map((issue) => <button key={issue} type="button" disabled={busy} className={`admin-issue-chip${selectedIssueTypes.includes(issue) ? " is-on" : ""}`} onClick={() => toggleIssue(issue)}><span className="admin-issue-box" />{issue}</button>)}</div>
                  <label className="admin-field">补充说明（选填）<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充需要作者修改的说明" maxLength={200} disabled={busy} /></label>
                  <div className="admin-reject-bottom"><p className={`admin-reject-rule${canReject ? " is-ready" : ""}`}>{rejectRuleText}</p><button ref={actionBtnRef} className="admin-reject-submit" type="button" disabled={busy || !canReject} onClick={openPreview}>生成打回预览</button></div>
                </div>
                <div className="admin-reject-preview" style={view === "preview" ? { paddingBottom: 0 } : { display: "none", paddingBottom: 0 }}>
                  <h3 className="admin-preview-title">打回内容预览（将发送给作者）</h3>
                  <div className="admin-preview-lines">{previewLines.length ? previewLines.map((line, index) => <div className="admin-preview-line" key={`${line.type}-${index}`}><span className="admin-preview-dot" /><span><b>[{line.type}]</b> {line.text}</span></div>) : <p className="admin-preview-empty">尚未勾选问题类型。</p>}</div>
                  <div className="admin-reject-bottom" ref={previewActionsRef}><div className="admin-preview-actions"><button className="admin-preview-confirm" type="button" disabled={busy || previewLines.length === 0} onClick={() => void submitReject()}>{busy ? "提交中…" : "确认打回"}</button><button className="admin-preview-cancel" type="button" disabled={busy} onClick={() => setView("issues")}>返回修改</button></div></div>
                </div>
              </div>
            ) : null}
          </section> : <section className="admin-detail-panel admin-decision-panel admin-readonly-decision">
            <div className="admin-panel-title-row"><h2>审核结果</h2><span>只读记录</span></div>
            <div className="admin-readonly-result">{reviewStatusLabel(reviewCase?.status || "")}</div>
            <p>该连载审核已完成，当前记录仅供查看，不能再次处置。</p>
          </section>}
          {message ? <div className="admin-detail-message" role="status">{message}</div> : null}
          {approveError ? <div className="admin-alert admin-alert-error" role="alert">{approveError}</div> : null}
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
        </div>
      </main>
    </div>
  );
}
