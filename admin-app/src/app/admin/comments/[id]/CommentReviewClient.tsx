"use client";

import Link from "next/link";
import { useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";
import { MODERATION_REASON_OPTIONS, normalizeModerationReason } from "@/lib/moderationReasons";
import { displayPublicId } from "@/lib/publicIds";

type ReviewCase = {
  id: string; public_id?: string | null; comment_id: string | null; post_id: string | null; author_id: string | null; parent_id: string | null; paragraph_index: number | null;
  status: string; priority: string; route_reason: string | null; screening_status: string | null; screening_sources: string[] | null;
  rules_version: string | null; submission_number: number | null; comment_snapshot: Record<string, unknown> | null; decision_reason: string | null;
  decided_by: string | null; decided_at: string | null; created_at: string; updated_at: string;
};
type Finding = { id: string; source: string; category: string; severity: string; status: string; quoted_text: string | null; details: string | null };
type FindingGroup = Finding & { ids: string[]; count: number };
type HistoryItem = { id: string; public_id?: string | null; status: string; priority: string; route_reason: string | null; screening_sources: string[] | null; submission_number: number | null; decision_reason: string | null; decided_by: string | null; decided_at: string | null; created_at: string; comment_snapshot: Record<string, unknown> | null };

const sourceLabels: Record<string, string> = { keyword: "违禁词库", semantic: "语义模型", manual: "人工送审" };
const statusLabels: Record<string, string> = { approved: "已放行", reminded: "已提醒", deleted: "已删除", cancelled: "已取消", pending: "进入人工审核", reviewing: "开始人工审核" };
const commentStatusLabel = (status?: string | null) => statusLabels[status || ""] || "已处理";
const typeLabel = (parentId: string | null, paragraphIndex: number | null) => parentId ? "回复" : paragraphIndex !== null ? "段评" : "评论";
const sourceLabel = (sources: string[] | null, screeningStatus: string | null) => screeningStatus === "failed" ? "服务异常" : (sources || []).map((item) => sourceLabels[item] || item).join("、") || "未记录";
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—";

export default function CommentReviewClient({ adminName, adminEmail, pendingCount, pendingCommentCount, queuePosition, queueTotal, previousCaseId, nextCaseId, reviewCase, comment, author, post, parentComment, findings, history }: {
  adminName: string; adminEmail: string; pendingCount: number; pendingCommentCount: number; queuePosition: number | null; queueTotal: number; previousCaseId: string | null; nextCaseId: string | null; reviewCase: ReviewCase;
  comment: { id: string; public_id?: string | null; post_id: string; user_id: string; parent_id: string | null; paragraph_index: number | null; content: string; created_at: string } | null;
  author: { id: string; public_id?: string | null; nickname: string | null } | null; post: { id: string; public_id?: string | null; title: string | null; user_id: string } | null;
  parentComment: { id: string; public_id?: string | null; user_id: string; content: string } | null; findings: Finding[]; history: HistoryItem[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<"approve" | "remind" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [findingStates, setFindingStates] = useState<Record<string, "confirmed" | "dismissed">>({});
  const [manualText, setManualText] = useState("");
  const active = reviewCase.status === "pending" || reviewCase.status === "reviewing";
  const snapshot = reviewCase.comment_snapshot || {};
  const content = comment?.content || String(snapshot.content || "评论内容已删除");
  const commentDbId = comment?.id || reviewCase.comment_id || String(snapshot.id || "—");
  const commentId = displayPublicId(comment?.public_id, commentDbId);
  const postDbId = comment?.post_id || reviewCase.post_id || String(snapshot.post_id || "—");
  const postId = displayPublicId(post?.public_id, postDbId);
  const userId = displayPublicId(author?.public_id, reviewCase.author_id || String(snapshot.user_id || "—"));
  const parentId = comment?.parent_id ?? reviewCase.parent_id ?? (typeof snapshot.parent_id === "string" ? snapshot.parent_id : null);
  const paragraphIndex = comment?.paragraph_index ?? reviewCase.paragraph_index ?? (typeof snapshot.paragraph_index === "number" ? snapshot.paragraph_index : null);
  const authorName = author?.nickname || "未知用户";
  const findingGroups = Object.values(findings.reduce<Record<string, FindingGroup>>((groups, finding) => {
    const normalizedCategory = normalizeModerationReason(finding.category);
    const key = `${normalizedCategory}|${finding.source}|${finding.quoted_text || ""}`;
    const current = groups[key];
    if (current) { current.ids.push(finding.id); current.count += 1; }
    else groups[key] = { ...finding, category: normalizedCategory, ids: [finding.id], count: 1 };
    return groups;
  }, {}));

  const setFindingState = async (group: FindingGroup, status: "confirmed" | "dismissed") => {
    if (!active || busy) return;
    setBusy(true); setMessage("");
    try {
      const responses = await Promise.all(group.ids.map((findingId) => fetchWithTimeout("/api/admin/comment-review", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: reviewCase.id, findingId, status }),
      })));
      const failed = responses.find((response) => !response.ok);
      if (failed) { setMessage("审核标记更新失败，请刷新后重试。"); return; }
      setFindingStates((current) => ({ ...current, [group.id]: status }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "审核标记更新失败，请刷新后重试。"); }
    finally { setBusy(false); }
  };
  const addManualFinding = async () => {
    const value = manualText.trim();
    if (!active || !value || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/comment-review", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: reviewCase.id, manualText: value }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) { setMessage(payload?.error || "人工标记添加失败，请重试。"); return; }
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "人工标记添加失败，请重试。"); }
    finally { setBusy(false); }
  };

  const copyId = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(null), 1600); }
    catch { setMessage("当前环境无法复制 ID，请手动选择文本。"); }
  };
  const actionText = confirmAction === "approve" ? "放行评论" : confirmAction === "remind" ? "放行并提醒发布者" : "删除评论并警告发布者";
  const needsReason = confirmAction === "remind" || confirmAction === "delete";
  const execute = async () => {
    if (!confirmAction) return;
    if (needsReason && !reason.trim()) { setMessage("请选择或填写一个处理原因。"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/comment-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: reviewCase.id, action: confirmAction, reason: reason.trim() || null }) });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) { setMessage(payload?.error || "评论审核处理失败，请稍后重试。"); setBusy(false); return; }
      window.location.assign("/admin?view=comments");
    } catch (error) { setMessage(error instanceof Error ? error.message : "评论审核处理失败，请稍后重试。"); setBusy(false); }
  };

  return <div className="admin-app-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span className="admin-brand-mark"><svg viewBox="0 0 1535 857" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M253 848C278.56 726.64 291.64 598.27 319.94 477.94C340.59 390.11 383.9 316.25 462.37 268.37C590.46 190.21 798.39 207.91 841.07 374.94C866.81 475.66 796.07 590.94 900.35 663.66C1008.05 738.76 1144.21 668.58 1231.02 597.02C1258.43 574.42 1284.44 529.68 1325.43 542.57L1338.05 549.95L1490.94 845.01L1310.99 847L1230.02 689.9C1174.48 744.13 1114.63 795.5 1042.33 826.33C869.05 900.22 671.92 843.47 691.05 625.05C697.88 547.05 757.52 410.78 644.51 379.48C557.04 355.26 495.68 418.68 475.63 497.62C446.93 610.64 440.1 734.58 410 847.99H253V848Z"/><path d="M1185 0L1099.01 487.99L1346 240H1535C1443.66 336.03 1351.46 442.56 1251.02 529.02C1161.29 606.26 958.98 728.81 930.89 530.97L1025 0.00999451H1185V0Z"/><path d="M301 60L158 848H0L137 60H301Z"/></svg></span><span>Inkland 管理后台</span></div>
      <div className="admin-nav-group"><p>后台功能</p><nav aria-label="后台主导航">
        <Link className="admin-nav-item" href="/admin?view=reviews"><span>作品审核</span>{pendingCount ? <b>{pendingCount}</b> : null}</Link>
        <Link className="admin-nav-item is-active" href="/admin?view=comments"><span>评论审核</span>{pendingCommentCount ? <b>{pendingCommentCount}</b> : null}</Link>
        <Link className="admin-nav-item" href="/admin?view=reportwork"><span>作品举报</span></Link><Link className="admin-nav-item" href="/admin?view=reportcomment"><span>评论举报</span></Link><Link className="admin-nav-item" href="/admin?view=reportuser"><span>用户举报</span></Link><Link className="admin-nav-item" href="/admin?view=users"><span>用户管理</span></Link><Link className="admin-nav-item" href="/admin?view=feedbacks"><span>用户反馈</span></Link><Link className="admin-nav-item" href="/admin?view=rules"><span>审核规则</span></Link>
      </nav></div><div className="admin-sidebar-foot">Inkland 内容治理后台<br />设计稿 · uicraft</div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-breadcrumb"><strong>管理后台 / 评论审核 / 详情</strong></div><div className="admin-top-actions"><button className="admin-btn admin-btn-light" type="button">全局搜索 <span className="admin-shortcut">⌘ K</span></button><button className="admin-btn admin-btn-light" type="button" onClick={() => window.location.reload()}>刷新</button><span className="admin-last-updated">上次更新 10:24</span><button className="admin-account-trigger" type="button">{adminName.slice(0, 8)} <span aria-hidden="true">⌄</span></button></div></header>
      <div className="admin-review-detail-page admin-comment-detail-page admin-detail-shell">
        <header className="admin-detail-head"><div className="admin-detail-nav">{previousCaseId ? <Link href={`/admin/comments/${previousCaseId}`} className="admin-btn admin-btn-light">← 上一条</Link> : <button className="admin-btn admin-btn-light" type="button" disabled>← 上一条</button>}<span className="admin-detail-queue-label">{queuePosition ? `待审队列第 ${queuePosition} / ${queueTotal} 条` : "只读审核记录"}</span>{nextCaseId ? <Link href={`/admin/comments/${nextCaseId}`} className="admin-btn admin-btn-light">下一条 →</Link> : <button className="admin-btn admin-btn-light" type="button" disabled>下一条 →</button>}</div><div className="admin-detail-title-line"><span className={`admin-risk-pill${reviewCase.priority === "high" ? " is-high" : ""}`}>风险等级：{reviewCase.priority === "high" ? "高" : "中"}</span><h1>{authorName} 的评论{active ? "待复核" : "审核记录"}</h1></div><div className="admin-detail-meta-line"><p className="admin-detail-meta">《{post?.title || "未知作品"}》 · {dateLabel(comment?.created_at || String(snapshot.created_at || reviewCase.created_at))} · 入审方式：{sourceLabel(reviewCase.screening_sources, reviewCase.screening_status)} · 类型：{typeLabel(parentId, paragraphIndex)}</p><div className="admin-entity-ids"><button type="button" className={`admin-copy-id${copied === "comment" ? " is-copied" : ""}`} onClick={() => void copyId("comment", commentId)}>{copied === "comment" ? "已复制评论 ID" : `评论 ${commentId}`}</button><button type="button" className={`admin-copy-id${copied === "user" ? " is-copied" : ""}`} onClick={() => void copyId("user", userId)}>{copied === "user" ? "已复制用户 ID" : `用户 ${userId}`}</button><button type="button" className={`admin-copy-id${copied === "post" ? " is-copied" : ""}`} onClick={() => void copyId("post", postId)}>{copied === "post" ? "已复制作品 ID" : `作品 ${postId}`}</button></div></div></header>
        <div className="admin-review-layout"><div className="admin-review-doc">
          <section className="admin-detail-panel"><div className="admin-panel-title-row"><h2>送审原因</h2></div><div className="admin-evidence">{reviewCase.route_reason || "评论文本命中审核关键词"}；审核来源：{sourceLabel(reviewCase.screening_sources, reviewCase.screening_status)}；规则版本：{reviewCase.rules_version || "keyword-v1"}。</div></section>
          <section className="admin-detail-panel"><div className="admin-panel-title-row"><h2>机审标记 · 人工核对</h2></div><p>逐条确认/忽略系统命中标记，也可手工补充文字或图片标记作为处置依据。</p>{findingGroups.length ? <div className="admin-finding-list">{findingGroups.map((finding) => { const state = findingStates[finding.id] || (finding.status === "confirmed" || finding.status === "dismissed" ? finding.status : null); return <div className="admin-finding-item" key={finding.id}><div className="admin-finding-head"><strong>{finding.category}</strong><span className={`admin-finding-status${state ? ` is-${state}` : ""}`}>{state === "confirmed" ? "已确认成立" : state === "dismissed" ? "已忽略" : ""}</span></div><p className="admin-finding-meta">{finding.count > 1 ? `命中 ${finding.count} 处 · ` : ""}{sourceLabels[finding.source] || finding.source} · {finding.severity === "high" ? "高风险" : "命中规则"}</p>{finding.quoted_text ? <blockquote>{finding.quoted_text}</blockquote> : null}{finding.details ? <small>{finding.details}</small> : null}<div className="admin-finding-actions"><button className={`admin-btn admin-btn-light${state === "confirmed" ? " is-selected" : ""}`} type="button" disabled={!active || busy} onClick={() => void setFindingState(finding, "confirmed")}>确认成立</button><button className={`admin-btn admin-btn-light${state === "dismissed" ? " is-selected" : ""}`} type="button" disabled={!active || busy} onClick={() => void setFindingState(finding, "dismissed")}>忽略</button></div></div>; })}</div> : <p>系统没有取得具体风险标记，可结合评论原文和所属作品上下文直接判断。</p>}<div className="admin-finding-manual"><input value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder="补充文字标记，例如：图注末尾含站外联系方式" aria-label="补充人工标记" /><button className="admin-btn admin-btn-light" type="button" disabled={!active || !manualText.trim() || busy} onClick={() => void addManualFinding()}>添加文字标记</button><button className="admin-btn admin-btn-light" type="button" disabled title="评论审核没有图片证据">图片标记占位</button></div><p className="admin-finding-foot">已确认违规 <b>{findingGroups.filter((finding) => (findingStates[finding.id] || finding.status) === "confirmed").length}</b> 项。放行前请确认已核对全部依据。</p></section>
          <section className="admin-detail-panel admin-comment-content-panel">
            <div className="admin-panel-title-row"><h2>评论内容</h2><span>{typeLabel(parentId, paragraphIndex)}</span></div>
            <blockquote className="admin-comment-quote">{content}</blockquote>
            <dl className="admin-comment-location">
              <div><dt>所在作品</dt><dd>{post?.title || "未知作品"}</dd></div>
              <div><dt>所在位置</dt><dd>{parentId ? "回复评论" : paragraphIndex !== null ? `正文第 ${paragraphIndex} 段` : "作品评论区"}</dd></div>
            </dl>
            {parentComment ? <div className="admin-comment-parent"><span>回复对象的原评论</span><b>{parentComment.content}</b></div> : null}
          </section>
          <section className="admin-detail-panel"><div className="admin-panel-title-row"><h2>审核轨迹</h2></div><ul className="admin-timeline">{history.length ? history.map((item) => <li key={item.id}><b>{statusLabels[item.status] || item.status} · 第 {item.submission_number || 1} 次提交</b><span>{dateLabel(item.decided_at || item.created_at)} · {item.decided_by ? `管理员 ${item.decided_by.slice(0, 8)}` : "系统"}</span></li>) : <li><b>未记录审核轨迹</b><span>—</span></li>}</ul></section>
          <section className="admin-detail-panel admin-audit"><div className="admin-panel-title-row"><h2>审计元数据</h2><span>系统记录</span></div><dl><div><dt>审核服务</dt><dd>{sourceLabel(reviewCase.screening_sources, reviewCase.screening_status)}</dd></div><div><dt>规则版本</dt><dd>{reviewCase.rules_version || "—"}</dd></div><div><dt>冻结对象</dt><dd>{commentId}</dd></div><div><dt>入审方式</dt><dd>{reviewCase.route_reason || "自动命中"}</dd></div><div><dt>提交编号</dt><dd>{reviewCase.submission_number || 1}</dd></div><div><dt>记录状态</dt><dd>{commentStatusLabel(reviewCase.status)}</dd></div></dl></section>
        </div><aside className="admin-review-decision"><section className="admin-detail-panel admin-decision-panel"><h2>{active ? "审核决定" : "只读审核记录"}</h2>{active ? <><p>① 无问题 → 放行 / 放行并轻提醒：均为一键确认，不需要任何说明<br />② 有问题 → 选择处置动作，确认后才会写入审计记录。</p><button className="admin-decision-approve" type="button" disabled={busy} onClick={() => { setReason(""); setConfirmAction("approve"); }}>放行（无问题）</button><button className="admin-decision-reject admin-comment-remind" type="button" disabled={busy} onClick={() => { setReason(""); setConfirmAction("remind"); }}>放行并轻提醒发布者</button><button className="admin-preview-confirm admin-comment-delete" type="button" disabled={busy} onClick={() => { setReason(""); setConfirmAction("delete"); }}>删除并警告…</button><small>放行同样写入留底；删除的评论不可恢复，提醒与删除都会通知评论发布者并写入管理员审计记录。</small></> : <><p>该评论审核已经完成，不提供再次放行、提醒或删除。</p><div className="admin-comment-history-result">处理结果：{commentStatusLabel(reviewCase.status)}{reviewCase.decision_reason ? ` · ${reviewCase.decision_reason}` : ""}</div><small>删除结果保留的是处理时冻结快照，不会恢复原评论。</small></>}</section>{message ? <div className="admin-detail-message" role="status">{message}</div> : null}</aside></div>
      </div>
    </main>
              {confirmAction ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmAction(null); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="comment-action-title"><div className="admin-modal-header"><div><h2 id="comment-action-title">确认{actionText}？</h2><p className="admin-modal-desc">对象：{authorName} 在《{post?.title || "未知作品"}》下的{typeLabel(parentId, paragraphIndex)}。确认后会写入审核记录{confirmAction === "remind" || confirmAction === "delete" ? "并通知发布者" : ""}。</p></div></div>{needsReason ? <div className="admin-field admin-report-reason-field"><span className="admin-field-label">常见处理原因</span><div className="admin-warn-reason-options">{MODERATION_REASON_OPTIONS.map((item) => <button className={reason === item ? "admin-warn-reason-chip is-selected" : "admin-warn-reason-chip"} type="button" key={item} disabled={busy} onClick={() => setReason(item)}>{item}</button>)}</div></div> : null}<label className="admin-field">处理说明（可修改）<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder={needsReason ? "也可以直接填写处理说明" : undefined} /></label><div className="admin-modal-actions"><button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setConfirmAction(null)}>取消</button><button className={`admin-btn ${confirmAction === "delete" ? "admin-btn-danger-fill" : "admin-btn-primary"}`} type="button" disabled={busy || (needsReason && !reason.trim())} onClick={() => void execute()}>{busy ? "处理中…" : "确认执行"}</button></div></div></div> : null}
  </div>;
}
