"use client";
/* eslint-disable @next/next/no-img-element -- 审核页需要展示作品原图。 */

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

/* ==================== 类型 ==================== */

type NamedUser = { nickname?: string | null } | null;

type Finding = {
  id: string;
  source?: string | null;
  category?: string | null;
  severity?: string | null;
  status?: string | null;
  location_type?: string | null;
  field_name?: string | null;
  paragraph_index?: number | null;
  start_offset?: number | null;
  end_offset?: number | null;
  image_index?: number | null;
  quoted_text?: string | null;
  details?: string | null;
  metadata?: Record<string, unknown> | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
};

type ReviewCase = {
  id: string;
  post_id: string;
  post_version_id: string;
  author_id?: string;
  status?: string | null;
  priority?: string | null;
  route_reason?: string | null;
  screening_status?: string | null;
  screening_sources?: string[] | null;
  screening_result?: unknown;
  rules_version?: string | null;
  model_name?: string | null;
  model_version?: string | null;
  submission_number?: number | null;
  assigned_admin_id?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
} | null;

type Post = {
  id: string;
  user_id?: string;
  title?: string | null;
  content?: string | null;
  author_note?: string | null;
  post_type?: string | null;
  series_name?: string | null;
  chapter_number?: number | null;
  chapter_title?: string | null;
  status?: string | null;
  review_status?: string | null;
  review_reason?: string | null;
  pending_review_status?: string | null;
  pending_review_reason?: string | null;
  visibility?: string | null;
  pending_visibility?: string | null;
  content_rating?: string | null;
  word_count?: number | null;
  created_at?: string | null;
  published_at?: string | null;
  current_version_number?: number | null;
  review_submission_number?: number | null;
  published_version_number?: number | null;
  author?: NamedUser;
};

type Version = {
  id: string;
  post_id?: string;
  author_id?: string;
  version_number?: number | null;
  submission_number?: number | null;
  title?: string | null;
  content?: string | null;
  author_note?: string | null;
  series_name?: string | null;
  chapter_number?: number | null;
  chapter_title?: string | null;
  word_count?: number | null;
  published_at?: string | null;
  visibility?: string | null;
  post_type?: string | null;
  snapshot?: unknown;
  source?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
};

type HistoryCase = {
  id: string;
  status?: string | null;
  priority?: string | null;
  route_reason?: string | null;
  submission_number?: number | null;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
};

type HistoryVersion = {
  id: string;
  version_number?: number | null;
  submission_number?: number | null;
  title?: string | null;
  word_count?: number | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

type ManualFindingDraft = {
  clientId: string;
  category: string;
  location_type: string;
  field_name: string;
  paragraph_index: number | null;
  image_index: number | null;
  quoted_text: string | null;
  details: string | null;
};

/* ==================== 文案映射 ==================== */

const typeLabels: Record<string, string> = { illustration: "图片作品", novel: "小说", article: "文章", serial: "连载章节" };
const sourceLabels: Record<string, string> = {
  keyword: "违规词库",
  moderation_api: "内容审核接口",
  nudenet_modelscope: "NudeNet 图片模型",
  nsfwjs_client: "NSFWJS 漫画辅助模型",
  paddleocr_modelscope: "PaddleOCR 图片文字识别",
  rating_rule: "评级规则",
  admin: "管理员",
};
const riskLabels: Record<string, string> = {
  buttocks_exposed: "臀部裸露",
  female_breast_exposed: "女性胸部裸露",
  male_breast_exposed: "男性胸部裸露",
  female_genitalia_exposed: "女性生殖器裸露",
  male_genitalia_exposed: "男性生殖器裸露",
  exposed_anus: "肛门裸露",
  exposed_breast_f: "女性胸部裸露",
  exposed_breast_m: "男性胸部裸露",
  exposed_genitalia_f: "女性生殖器裸露",
  exposed_genitalia_m: "男性生殖器裸露",
  exposed_buttocks: "臀部裸露",
  penis_exposed: "阴茎裸露",
  vagina_exposed: "阴道裸露",
  keyword: "命中违规词",
  porn: "成人色情内容",
  hentai: "成人漫画内容",
  sexy: "性暗示内容",
};
const issueTypes = [
  "内容评级与实际内容不符",
  "成人或不当内容",
  "暴力、血腥或威胁性内容",
  "攻击、骚扰或歧视性内容",
  "广告、诈骗或导流",
  "其他需要修改的问题",
];
const statusLabels: Record<string, string> = {
  pending: "待人工审核",
  reviewing: "审核中",
  service_error: "服务异常，待人工处理",
  approved: "已放行",
  changes_requested: "已打回",
  cancelled: "已取消",
};
const screeningStatusLabels: Record<string, string> = {
  completed: "已完成自动审核，等待人工决定",
  failed: "自动审核异常，等待人工处理",
  pending: "自动审核进行中",
  not_configured: "未配置自动审核",
};
const findingStatusLabels: Record<string, string> = {
  suggested: "待确认",
  confirmed: "已确认",
  dismissed: "已忽略",
};

function sourceLabel(source?: string | null) {
  return sourceLabels[source || ""] || source || "未知来源";
}

function riskLabel(category?: string | null) {
  if (!category) return "待确认问题";
  return riskLabels[category.toLowerCase()] || category.replaceAll("_", " ");
}

function locationTitle(finding: Finding) {
  if (finding.location_type === "image") return `图片 ${(finding.image_index ?? 0) + 1}`;
  if (finding.location_type === "image_ocr") return `图片内文字 · 图片 ${(finding.image_index ?? 0) + 1}`;
  if (finding.field_name === "title") return "标题";
  if (finding.field_name === "author_note") return "作者的话";
  if (finding.field_name === "content" && finding.paragraph_index) return `正文 · 段落 ${finding.paragraph_index}`;
  return "正文";
}

function ocrConfidence(finding: Finding) {
  const metadata = finding.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const confidence = metadata.ocr_confidence;
  return typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

/* ==================== 高亮 ==================== */

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!text) return <>{text}</>;
  const uniqueTerms = [...new Set(terms.filter(Boolean))];
  if (!uniqueTerms.length) return <>{text}</>;

  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const term of uniqueTerms) {
    const needle = term.toLowerCase();
    let index = lower.indexOf(needle);
    while (index !== -1) {
      ranges.push([index, index + term.length]);
      index = lower.indexOf(needle, index + 1);
    }
  }
  if (!ranges.length) return <>{text}</>;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([start, end], index) => {
    if (start > cursor) nodes.push(<span key={`t-${index}`}>{text.slice(cursor, start)}</span>);
    nodes.push(<mark key={`m-${index}`}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  if (cursor < text.length) nodes.push(<span key="t-end">{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

/* ==================== 主组件 ==================== */

export default function ReviewDetailClient({ post, version, reviewCase, findings, historyCases, historyVersions, imageAccessError }: {
  post: Post;
  version: Version;
  reviewCase: ReviewCase;
  findings: Finding[];
  historyCases: HistoryCase[];
  historyVersions: HistoryVersion[];
  imageAccessError?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [brokenImages, setBrokenImages] = useState<number[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<string[]>(() => findings.filter((f) => f.status === "confirmed").map((f) => f.id));
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => findings.filter((f) => f.status === "dismissed").map((f) => f.id));
  const [selectedIssueType, setSelectedIssueType] = useState<string | null>(null);
  const [manualFindings, setManualFindings] = useState<ManualFindingDraft[]>([]);
  const [manualField, setManualField] = useState<"title" | "content" | "author_note" | "image" | "image_ocr">("content");
  const [manualParagraph, setManualParagraph] = useState("");
  const [manualImage, setManualImage] = useState("");
  const [manualCategory, setManualCategory] = useState(issueTypes[issueTypes.length - 1]);
  const [manualQuoted, setManualQuoted] = useState("");
  const [manualDetails, setManualDetails] = useState("");

  const noteStripped = useMemo(() => (version.content || "").replace(/<!--\s*作者的话：[\s\S]*?-->/g, ""), [version.content]);
  const imageUrls = useMemo(() => [...noteStripped.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]), [noteStripped]);
  const paragraphs = useMemo(
    () => noteStripped.replace(/!\[[^\]]*\]\(([^)]+)\)/g, "").split(/\n\n+/).map((part) => part.trim()).filter(Boolean),
    [noteStripped],
  );

  const titleTerms = findings.filter((f) => f.field_name === "title" && f.quoted_text).map((f) => f.quoted_text as string);
  const authorNoteTerms = findings.filter((f) => f.field_name === "author_note" && f.quoted_text).map((f) => f.quoted_text as string);
  const paragraphTerms = (paragraphIndex: number) => findings
    .filter((f) => f.quoted_text && (f.location_type === "text_range" || f.location_type === "paragraph") && (
      (f.field_name === "content" && (f.paragraph_index ?? 0) === paragraphIndex) || !f.field_name
    ))
    .map((f) => f.quoted_text as string);

  const statusOf = (finding: Finding) => {
    if (confirmedIds.includes(finding.id)) return "confirmed";
    if (dismissedIds.includes(finding.id)) return "dismissed";
    return finding.status === "confirmed" ? "confirmed" : finding.status === "dismissed" ? "dismissed" : "suggested";
  };

  const toggleConfirm = (finding: Finding) => {
    setConfirmedIds((prev) => prev.includes(finding.id) ? prev.filter((id) => id !== finding.id) : [...prev, finding.id]);
    setDismissedIds((prev) => prev.filter((id) => id !== finding.id));
  };

  const toggleDismiss = (finding: Finding) => {
    setDismissedIds((prev) => prev.includes(finding.id) ? prev.filter((id) => id !== finding.id) : [...prev, finding.id]);
    setConfirmedIds((prev) => prev.filter((id) => id !== finding.id));
  };

  const scrollTo = (finding: Finding) => {
    const id = finding.location_type === "image" || finding.location_type === "image_ocr"
      ? `img-${finding.image_index ?? 0}`
      : finding.field_name === "title" ? "field-title"
      : finding.field_name === "author_note" ? "field-author-note"
      : finding.paragraph_index ? `para-${finding.paragraph_index}`
      : "field-content";
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const addManualFinding = () => {
    const paragraph = manualField === "content" ? Number.parseInt(manualParagraph, 10) : null;
    const imageInput = manualField === "image" || manualField === "image_ocr" ? Number.parseInt(manualImage, 10) : null;
    if (manualField === "content" && (!Number.isInteger(paragraph) || (paragraph ?? 0) < 1)) {
      setMessage("正文标记请填写段落编号（从 1 开始）。");
      return;
    }
    if ((manualField === "image" || manualField === "image_ocr") && (!Number.isInteger(imageInput) || (imageInput ?? 0) < 1)) {
      setMessage("图片标记请填写图片序号（从 1 开始）。");
      return;
    }
    setManualFindings((prev) => [...prev, {
      clientId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: manualCategory,
      location_type: manualField === "image_ocr" ? "image_ocr" : manualField === "image" ? "image" : "text_range",
      field_name: manualField,
      paragraph_index: paragraph,
      image_index: imageInput !== null ? imageInput - 1 : null,
      quoted_text: manualQuoted.trim() || null,
      details: manualDetails.trim() || null,
    }]);
    setManualQuoted("");
    setManualDetails("");
    setMessage("");
  };

  const removeManualFinding = (clientId: string) => {
    setManualFindings((prev) => prev.filter((item) => item.clientId !== clientId));
  };

  const reject = async () => {
    if (!selectedIssueType) {
      setMessage("打回作品前请先选择问题类型。");
      return;
    }
    if (confirmedIds.length === 0 && manualFindings.length === 0) {
      setMessage("打回作品前请至少确认一项系统标记，或添加一项人工标记。");
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewCaseId: reviewCase?.id,
        decision: "rejected",
        reason: selectedIssueType,
        confirmedFindingIds: confirmedIds,
        dismissedFindingIds: dismissedIds,
        manualFindings: manualFindings.map((item) => ({
          category: item.category,
          location_type: item.location_type,
          field_name: item.field_name,
          paragraph_index: item.paragraph_index,
          image_index: item.image_index,
          quoted_text: item.quoted_text,
          details: item.details,
        })),
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "打回操作失败，请稍后重试。");
      return;
    }
    window.location.assign("/admin?view=reviews");
  };

  const approve = async () => {
    if (!window.confirm("确认该审核版本没有违规并立即公开发布吗？")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewCaseId: reviewCase?.id,
        decision: "approved",
        reason: null,
        confirmedFindingIds: confirmedIds,
        dismissedFindingIds: dismissedIds,
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "放行操作失败，请稍后重试。");
      return;
    }
    window.location.assign("/admin?view=reviews");
  };

  const screeningSources = (reviewCase?.screening_sources || []).map((source) => sourceLabel(source)).join("、") || "未记录";
  const imageFindingsByIndex = (index: number) => findings.filter((f) => (f.location_type === "image" || f.location_type === "image_ocr") && (f.image_index ?? 0) === index);

  return (
    <main className="admin-detail-shell">
      <header className="admin-detail-top">
        <Link href="/admin?view=reviews" className="admin-back-link">← 返回作品审核</Link>
        <span className="admin-detail-status">{statusLabels[reviewCase?.status || ""] || "待人工审核"}</span>
      </header>

      <div className="admin-review-heading">
        <div className="admin-detail-kicker">
          POST-PUBLISH REVIEW · {typeLabels[version.post_type || post.post_type || ""] || "作品"} · 冻结版本 v{version.version_number ?? 1}
        </div>
        <h1><Highlight text={version.title || "无标题"} terms={titleTerms} /></h1>
        <div className="admin-detail-meta">
          作者：{post.author?.nickname || "未知作者"}
          {version.post_type === "serial" && version.series_name ? ` · 连载《${version.series_name}》` : ""}
          {version.post_type === "serial" && version.chapter_number != null ? ` · 第 ${version.chapter_number} 章` : ""}
          {version.chapter_title ? ` · ${version.chapter_title}` : ""}
          {" · "}{post.content_rating || "未评级"}
          {" · "}第 {reviewCase?.submission_number || 1} 次提交
          {" · "}提交于 {formatDate(version.submitted_at || version.created_at)}
        </div>
      </div>

      <div className="admin-review-layout">
        <aside className="admin-review-summary-column">
          <section className="admin-detail-panel">
            <div className="admin-panel-title-row">
              <h2>审核信息</h2>
              <span>{reviewCase?.priority === "high" ? "高风险" : "普通"}</span>
            </div>
            <dl>
              <dt>审核状态</dt>
              <dd>{statusLabels[reviewCase?.status || ""] || reviewCase?.status || "待人工审核"}</dd>
              <dt>自动审核状态</dt>
              <dd>{screeningStatusLabels[reviewCase?.screening_status || ""] || "—"}</dd>
              <dt>触发来源</dt>
              <dd>{reviewCase?.route_reason || "—"}</dd>
              <dt>审核来源</dt>
              <dd>{screeningSources}</dd>
              <dt>规则/模型版本</dt>
              <dd>{reviewCase?.rules_version || reviewCase?.model_version || "—"}</dd>
              <dt>版本</dt>
              <dd>v{version.version_number ?? 1} · 字数 {version.word_count ?? post.word_count ?? 0}</dd>
              <dt>可见范围</dt>
              <dd>{post.pending_visibility || version.visibility || "public"}</dd>
            </dl>
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row">
              <h2>历史审核记录</h2>
              <span>{historyCases.length} 条</span>
            </div>
            {historyCases.length ? (
              <div className="admin-history-list">
                {historyCases.map((item) => (
                  <div className="admin-history-item" key={item.id}>
                    <strong>{statusLabels[item.status || ""] || item.status || "已处理"} · 第 {item.submission_number || 1} 次提交</strong>
                    <span>{item.route_reason || "—"} · {formatDate(item.decided_at || item.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>暂无历史审核记录。</p>
            )}
            {historyVersions.length > 0 && (
              <div className="admin-history-list" style={{ marginTop: 12 }}>
                {historyVersions.slice(0, 8).map((item) => (
                  <div className="admin-history-item" key={item.id}>
                    <strong>{item.title || "无标题"} · v{item.version_number ?? "?"}</strong>
                    <span>字数 {item.word_count ?? 0} · {formatDate(item.submitted_at || item.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <article className="admin-detail-content admin-review-main">
          <section className="admin-evidence-document">
            <div className="admin-document-label">FROZEN VERSION · 审核中固定版本</div>
            <h2 id="field-title"><Highlight text={version.title || "无标题"} terms={titleTerms} /></h2>
            {imageAccessError ? <div className="admin-image-access-error" role="alert">{imageAccessError}</div> : null}

            {paragraphs.length > 0 && (
              <div className="admin-field-block" id="field-content">
                <h3>正文（{paragraphs.length} 段）</h3>
                {paragraphs.map((paragraph, index) => (
                  <div className="admin-paragraph" id={`para-${index + 1}`} key={`para-${index + 1}`}>
                    <span className="admin-paragraph-num">{index + 1}</span>
                    <div className="admin-long-content">
                      <Highlight text={paragraph} terms={paragraphTerms(index + 1)} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {version.author_note ? (
              <div className="admin-field-block" id="field-author-note">
                <h3>作者的话</h3>
                <div className="admin-long-content">
                  <Highlight text={version.author_note} terms={authorNoteTerms} />
                </div>
              </div>
            ) : null}

            {imageUrls.length ? (
              <div className="admin-field-block">
                <h3>全部图片（{imageUrls.length} 张）</h3>
                <div className="admin-detail-images">
                  {imageUrls.map((url, index) => {
                    const risks = imageFindingsByIndex(index);
                    const unavailable = url.startsWith("private://") || brokenImages.includes(index);
                    const ocrNotes = findings.filter((f) => f.location_type === "image_ocr" && (f.image_index ?? 0) === index);
                    return (
                      <figure key={`${url}-${index}`} id={`img-${index}`} className={risks.length ? "is-flagged" : undefined}>
                        {unavailable ? (
                          <div className="admin-image-unavailable">
                            <strong>图片 {index + 1} 暂时无法显示</strong>
                            <span>请检查后台私有图片访问配置后重新加载页面。</span>
                          </div>
                        ) : (
                          <a href={url} target="_blank" rel="noreferrer" title="打开原图">
                            <img
                              src={url}
                              alt={`作品图片 ${index + 1}`}
                              onError={() => setBrokenImages((items) => items.includes(index) ? items : [...items, index])}
                            />
                          </a>
                        )}
                        <figcaption>
                          图片 {index + 1}
                          {risks.length ? ` · 系统提示：${risks.filter((r) => r.location_type === "image").map((r) => riskLabel(r.category)).join("、") || "文字识别命中"}` : ""}
                        </figcaption>
                        {ocrNotes.length > 0 && (
                          <div className="admin-ocr-note">
                            {ocrNotes.map((note) => {
                              const confidence = ocrConfidence(note);
                              return (
                                <div key={note.id}>
                                  图片文字：{note.quoted_text || "（无引用文本）"}
                                  {confidence !== null ? `（置信度 ${Math.round(confidence * 100)}%）` : ""}
                                  {note.details ? ` · ${note.details}` : ""}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </figure>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!paragraphs.length && !imageUrls.length && !version.author_note ? (
              <p className="admin-detail-empty">版本内容已不存在或无法读取。</p>
            ) : null}
          </section>
        </article>

        <aside className="admin-review-action-column">
          <section className="admin-detail-panel">
            <div className="admin-panel-title-row">
              <h2>系统标记与风险</h2>
              <span>{findings.length} 项</span>
            </div>
            <p>确认需要作者修改的标记；其余可以忽略。已确认标记会进入打回问题清单。</p>
            {findings.length ? (
              <div className="admin-finding-list">
                {findings.map((finding) => {
                  const status = statusOf(finding);
                  const confidence = ocrConfidence(finding);
                  return (
                    <div className={`admin-finding-item ${status === "confirmed" ? "is-confirmed" : status === "dismissed" ? "is-dismissed" : ""}`} key={finding.id}>
                      <div className="admin-finding-head">
                        <strong>{locationTitle(finding)}</strong>
                        <span className={`admin-finding-status ${status === "confirmed" ? "is-confirmed" : status === "dismissed" ? "is-dismissed" : ""}`}>
                          {findingStatusLabels[status] || "待确认"}
                        </span>
                      </div>
                      <div className="admin-finding-tags">
                        <span>{riskLabel(finding.category)}</span>
                        <span className="is-source">{sourceLabel(finding.source)}</span>
                        {confidence !== null && <span>OCR 置信度 {Math.round(confidence * 100)}%</span>}
                      </div>
                      {finding.quoted_text ? <blockquote>{finding.quoted_text}</blockquote> : null}
                      {finding.details ? <small>{finding.details}</small> : null}
                      <div className="admin-finding-actions">
                        <button className={status === "confirmed" ? "is-active" : ""} type="button" disabled={busy} onClick={() => toggleConfirm(finding)}>
                          {status === "confirmed" ? "取消确认" : "确认"}
                        </button>
                        <button className={status === "dismissed" ? "is-active" : ""} type="button" disabled={busy} onClick={() => toggleDismiss(finding)}>
                          {status === "dismissed" ? "取消忽略" : "忽略"}
                        </button>
                        <button className="is-muted" type="button" onClick={() => scrollTo(finding)}>定位</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>系统没有自动标记。可直接放行，或使用下方人工标记添加问题。</p>
            )}
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row">
              <h2>添加人工标记</h2>
              {manualFindings.length ? <span>{manualFindings.length} 项</span> : null}
            </div>
            <div className="admin-manual-form">
              <label className="admin-field">
                标记位置
                <select value={manualField} onChange={(event) => setManualField(event.target.value as typeof manualField)}>
                  <option value="content">正文段落</option>
                  <option value="title">标题</option>
                  <option value="author_note">作者的话</option>
                  <option value="image">图片</option>
                  <option value="image_ocr">图片内文字</option>
                </select>
              </label>
              <div className="admin-field-row">
                {manualField === "content" && (
                  <label className="admin-field">
                    段落编号
                    <input type="number" min={1} max={Math.max(paragraphs.length, 1)} value={manualParagraph} onChange={(event) => setManualParagraph(event.target.value)} placeholder={`1-${Math.max(paragraphs.length, 1)}`} />
                  </label>
                )}
                {(manualField === "image" || manualField === "image_ocr") && (
                  <label className="admin-field">
                    图片序号
                    <input type="number" min={1} max={Math.max(imageUrls.length, 1)} value={manualImage} onChange={(event) => setManualImage(event.target.value)} placeholder={`1-${Math.max(imageUrls.length, 1)}`} />
                  </label>
                )}
                <label className="admin-field">
                  问题类型
                  <select value={manualCategory} onChange={(event) => setManualCategory(event.target.value)}>
                    {issueTypes.map((issueType) => <option key={issueType}>{issueType}</option>)}
                  </select>
                </label>
              </div>
              {manualField !== "image" && manualField !== "image_ocr" && (
                <label className="admin-field">
                  引用文本（选填）
                  <input value={manualQuoted} onChange={(event) => setManualQuoted(event.target.value)} placeholder="标记的具体文字，便于作者定位" maxLength={500} />
                </label>
              )}
              <label className="admin-field">
                说明（选填）
                <textarea value={manualDetails} onChange={(event) => setManualDetails(event.target.value)} placeholder="补充需要作者修改的细节" maxLength={2000} />
              </label>
              <button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={addManualFinding}>添加到问题清单</button>
            </div>
            {manualFindings.length > 0 && (
              <div className="admin-finding-list admin-manual-findings">
                {manualFindings.map((item) => (
                  <div className="admin-finding-item is-confirmed" key={item.clientId}>
                    <div className="admin-finding-head">
                      <strong>
                        {item.field_name === "title" ? "标题" : item.field_name === "author_note" ? "作者的话" : item.field_name === "image" ? `图片 ${(item.image_index ?? 0) + 1}` : item.field_name === "image_ocr" ? `图片内文字 · 图片 ${(item.image_index ?? 0) + 1}` : `正文 · 段落 ${item.paragraph_index ?? "?"}`}
                      </strong>
                      <span className="admin-finding-status is-confirmed">已确认</span>
                    </div>
                    <div className="admin-finding-tags">
                      <span>{item.category}</span>
                      <span className="is-source">管理员</span>
                    </div>
                    {item.quoted_text ? <blockquote>{item.quoted_text}</blockquote> : null}
                    {item.details ? <small>{item.details}</small> : null}
                    <div className="admin-finding-actions">
                      <button className="is-muted" type="button" onClick={() => removeManualFinding(item.clientId)}>移除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="admin-detail-panel admin-reject-panel">
            <h2>标记问题并打回</h2>
            <p>选择问题类型后点击打回，系统会把已确认的问题清单发给作者。</p>
            <div className="admin-issue-buttons">
              {issueTypes.map((issueType) => (
                <button
                  key={issueType}
                  type="button"
                  className={selectedIssueType === issueType ? "is-selected" : ""}
                  disabled={busy}
                  onClick={() => setSelectedIssueType(issueType)}
                >
                  {issueType}
                </button>
              ))}
            </div>
            <button className="admin-detail-danger" type="button" disabled={busy} onClick={() => void reject()}>
              {busy ? "处理中…" : "标记问题并打回"}
            </button>
            <small>打回前必须至少确认一项系统标记或添加一项人工标记。</small>
          </section>

          <section className="admin-detail-panel admin-approve-panel">
            <h2>确认无违规</h2>
            <p>仅在确认审核版本没有违规时放行。放行后作品将按冻结版本公开发布。</p>
            <button className="admin-detail-secondary" type="button" disabled={busy} onClick={() => void approve()}>
              {busy ? "处理中…" : "确认无违规并放行"}
            </button>
          </section>

          {message ? <div className="admin-detail-message" role="status">{message}</div> : null}
        </aside>
      </div>
    </main>
  );
}
