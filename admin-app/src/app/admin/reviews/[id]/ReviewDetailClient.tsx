"use client";
/* eslint-disable @next/next/no-img-element -- 审核页需要展示作品原图。 */

import Link from "next/link";
import { useState } from "react";

type NamedUser = { nickname?: string | null } | null;
type Finding = { id: string; source?: string | null; category?: string | null; location_type?: string | null; image_index?: number | null; quoted_text?: string | null; details?: string | null };
type ReviewCase = { route_reason?: string | null; screening_status?: string | null; screening_sources?: string[] | null; rules_version?: string | null } | null;
type Post = { id: string; title?: string | null; content?: string | null; post_type?: string | null; review_reason?: string | null; created_at?: string | null; review_submission_number?: number | null; author?: NamedUser };

const labels: Record<string, string> = { illustration: "图片作品", novel: "小说", article: "文章", serial: "连载章节" };
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

function riskLabel(category?: string | null) {
  if (!category) return "待确认问题";
  return riskLabels[category.toLowerCase()] || category.replaceAll("_", " ");
}

export default function ReviewDetailClient({ post, reviewCase, findings, imageAccessError }: { post: Post; reviewCase: ReviewCase; findings: Finding[]; imageAccessError?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [brokenImages, setBrokenImages] = useState<number[]>([]);
  const images = [...(post.content || "").matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  const plainText = (post.content || "").replace(/!\[[^\]]*\]\(([^)]+)\)/g, "").trim();
  const imageFindings = findings.filter((finding) => finding.location_type === "image");
  const groupedFindings = findings.reduce<Array<{ key: string; title: string; items: Finding[] }>>((groups, finding) => {
    const key = finding.location_type === "image" ? `image-${finding.image_index ?? 0}` : `text-${finding.id}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.items.push(finding);
    else groups.push({ key, title: finding.location_type === "image" ? `图片 ${(finding.image_index ?? 0) + 1}` : "文字内容", items: [finding] });
    return groups;
  }, []);

  const reject = async (issueType: string) => {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: post.id, decision: "rejected", reason: issueType }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("打回操作失败，请稍后重试。");
      return;
    }
    window.location.assign("/admin?view=reviews");
  };

  const approve = async () => {
    if (!window.confirm("确认该作品没有违规并立即公开发布吗？")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: post.id, decision: "approved", reason: null }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("放行操作失败，请稍后重试。");
      return;
    }
    window.location.assign("/admin?view=reviews");
  };

  return (
    <main className="admin-detail-shell">
      <header className="admin-detail-top">
        <Link href="/admin?view=reviews" className="admin-back-link">← 返回作品审核</Link>
        <span className="admin-detail-status">待审核</span>
      </header>

      <div className="admin-review-heading">
        <div className="admin-detail-kicker">PRE-PUBLISH REVIEW · {labels[post.post_type || ""] || "作品"}</div>
        <h1>{post.title || "无标题"}</h1>
        <div className="admin-detail-meta">作者：{post.author?.nickname || "未知作者"} · 提交于 {post.created_at ? new Date(post.created_at).toLocaleString("zh-CN") : "未知时间"} · 第 {post.review_submission_number || 1} 次提交</div>
      </div>

      <div className="admin-review-layout">
        <aside className="admin-review-summary-column">
          <section className="admin-detail-panel">
            <h2>系统审核结果</h2>
            <p>{reviewCase?.route_reason || post.review_reason || "未取得自动审核结果，需人工确认。"}</p>
            <dl>
              <dt>审核状态</dt>
              <dd>{reviewCase?.screening_status === "completed" ? "已完成自动审核，等待人工决定" : reviewCase?.screening_status === "failed" ? "自动审核异常，等待人工处理" : "等待人工审核"}</dd>
              <dt>审核来源</dt>
              <dd>{reviewCase?.screening_sources?.map((source) => source === "nudenet_modelscope" ? "NudeNet 图片模型" : source === "nsfwjs_client" ? "NSFWJS 漫画辅助模型" : source === "keyword" ? "违规词库" : source).join("、") || "未记录"}</dd>
              <dt>规则/模型</dt>
              <dd>{reviewCase?.rules_version || "未记录"}</dd>
            </dl>
          </section>

          <section className="admin-detail-panel admin-risk-panel">
            <div className="admin-panel-title-row"><h2>风险标记</h2><span>{findings.length} 项</span></div>
            {groupedFindings.length ? <div className="admin-risk-list">{groupedFindings.map((group) => <div className="admin-risk-item" key={group.key}>
              <strong>{group.title}</strong>
              <div className="admin-risk-tags">{group.items.map((finding) => <span key={finding.id}>{riskLabel(finding.category)}</span>)}</div>
              {group.items.some((finding) => finding.details) ? <small>{group.items.find((finding) => finding.details)?.details}</small> : null}
            </div>)}</div> : <p>系统没有提供具体风险位置。请结合完整内容人工判断。</p>}
          </section>
        </aside>

        <article className="admin-detail-content admin-review-main">
          <section className="admin-evidence-document">
            <div className="admin-document-label">完整作品内容</div>
            <h2>{images.length ? `全部图片（${images.length} 张）` : "正文"}</h2>
            {imageAccessError ? <div className="admin-image-access-error" role="alert">{imageAccessError}</div> : null}
            {plainText ? <div className="admin-long-content">{plainText}</div> : null}
            {images.length ? <div className="admin-detail-images">{images.map((url, index) => {
              const risks = imageFindings.filter((finding) => finding.image_index === index);
              const unavailable = url.startsWith("private://") || brokenImages.includes(index);
              return <figure key={`${url}-${index}`}>
                {unavailable ? <div className="admin-image-unavailable"><strong>图片 {index + 1} 暂时无法显示</strong><span>请检查后台私有图片访问配置后重新加载页面。</span></div> : <a href={url} target="_blank" rel="noreferrer" title="打开原图"><img src={url} alt={`作品图片 ${index + 1}`} onError={() => setBrokenImages((items) => items.includes(index) ? items : [...items, index])} /></a>}
                <figcaption>图片 {index + 1}{risks.length ? ` · 系统提示：${risks.map((risk) => riskLabel(risk.category)).join("、")}` : ""}</figcaption>
              </figure>;
            })}</div> : null}
            {!plainText && !images.length ? <p className="admin-detail-empty">作品内容已不存在或无法读取。</p> : null}
          </section>
        </article>

        <aside className="admin-review-action-column">
          <section className="admin-detail-panel admin-reject-panel">
            <h2>标记问题并打回</h2>
            <p>请选择问题类型，点击后将立即打回作者修改。</p>
            <div className="admin-issue-buttons">
              {issueTypes.map((issueType) => <button key={issueType} type="button" disabled={busy} onClick={() => void reject(issueType)}>{issueType}</button>)}
            </div>
          </section>

          <section className="admin-detail-panel admin-approve-panel">
            <h2>确认无违规</h2>
            <p>仅在确认作品内容没有违规时放行。放行后作品将公开发布。</p>
            <button className="admin-detail-secondary" disabled={busy} onClick={() => void approve()}>{busy ? "处理中…" : "确认无违规并放行"}</button>
          </section>

          {message ? <div className="admin-detail-message">{message}</div> : null}
        </aside>
      </div>
    </main>
  );
}
