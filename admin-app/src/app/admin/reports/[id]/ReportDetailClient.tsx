"use client";
/* eslint-disable @next/next/no-img-element -- 举报证据需要按原始远程地址展示，后续统一图片域名后再切换 next/image。 */

import Link from "next/link";
import { useState } from "react";

type NamedUser = { nickname?: string | null } | null;
type ReportDetail = {
  id: string;
  status: string;
  reason: string;
  created_at: string;
  target_type?: "post" | "user";
  target_id?: string;
  comment_id?: string;
  reporter?: NamedUser;
  comment?: {
    content?: string | null;
    author?: NamedUser;
    post?: { title?: string | null } | null;
  } | null;
  post?: {
    title?: string | null;
    content?: string | null;
    author?: NamedUser;
  } | null;
  profile?: {
    nickname?: string | null;
    bio?: string | null;
  } | null;
};

type Props = { source: "content" | "comment"; report: ReportDetail };

export default function ReportDetailClient({ source, report }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isComment = source === "comment";
  const title = isComment
    ? `评论于《${report.comment?.post?.title || "未知作品"}》`
    : report.target_type === "post"
      ? report.post?.title || "未知作品"
      : `用户：${report.profile?.nickname || "未知用户"}`;
  const content = isComment
    ? report.comment?.content || "评论内容已不存在"
    : report.target_type === "post"
      ? report.post?.content || "作品内容已不存在"
      : report.profile?.bio || "该用户没有填写个人简介";
  const images = [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  const plainText = content.replace(/!\[[^\]]*\]\(([^)]+)\)/g, "").trim();

  const handle = async (status: "resolved" | "dismissed") => {
    setBusy(true);
    const action = status === "resolved"
      ? isComment
        ? "delete_comment"
        : report.target_type === "post"
          ? "delete_post"
          : undefined
      : undefined;
    const response = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: report.id, status, source, action }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage("操作失败，请稍后重试");
      return;
    }
    window.location.href = "/admin?view=reports";
  };

  const targetAuthor = isComment
    ? report.comment?.author?.nickname || "未知用户"
    : report.target_type === "post"
      ? report.post?.author?.nickname || "未知作者"
      : report.profile?.nickname || "未知用户";

  return (
    <main className="admin-detail-shell">
      <header className="admin-detail-top">
        <Link href="/admin?view=reports" className="admin-back-link">← 返回后台举报中心</Link>
        <span className="admin-detail-status">{report.status === "pending" ? "待处理" : report.status}</span>
      </header>
      <div className="admin-detail-layout">
        <article className="admin-detail-content">
          <div className="admin-detail-kicker">REPORT EVIDENCE · {isComment ? "COMMENT" : report.target_type === "post" ? "POST" : "USER"}</div>
          <h1>{title}</h1>
          <div className="admin-detail-meta">举报理由：{report.reason} · 举报人：{report.reporter?.nickname || "匿名"} · {new Date(report.created_at).toLocaleString("zh-CN")}</div>
          {isComment ? <div className="admin-context-card"><span>评论所属作品</span><strong>{report.comment?.post?.title || "未知作品"}</strong><p>以下是被举报评论的原文，处理评论前请先确认上下文。</p></div> : null}
          <section className="admin-evidence-document">
            <div className="admin-document-label">被举报内容</div>
            <h2>{isComment ? "评论原文" : report.target_type === "post" ? "作品全文" : "用户资料"}</h2>
            {plainText ? <div className="admin-long-content">{plainText}</div> : <p className="admin-detail-empty">暂无可读取的文字内容</p>}
            {images.length > 0 ? <div className="admin-detail-images">{images.map((url, index) => <figure key={`${url}-${index}`}><img src={url} alt={`被举报作品图片 ${index + 1}`} /><figcaption>图片 {index + 1}</figcaption></figure>)}</div> : null}
          </section>
        </article>
        <aside className="admin-detail-aside">
          <section className="admin-detail-panel">
            <h2>处理举报</h2>
            <p>请先阅读左侧完整内容，再选择处理动作。</p>
            <button className="admin-detail-danger" disabled={busy} onClick={() => void handle("resolved")}>{isComment ? "删除评论" : report.target_type === "post" ? "删除作品" : "记录违规"}</button>
            <button className="admin-detail-secondary" disabled={busy} onClick={() => void handle("dismissed")}>驳回举报</button>
            {message ? <div className="admin-detail-message">{message}</div> : null}
            <small>无论处理还是驳回，举报人都会收到系统统一的受理通知，不会看到管理员内部结论。</small>
          </section>
          <section className="admin-detail-panel">
            <h2>对象信息</h2>
            <dl><dt>对象类型</dt><dd>{isComment ? "评论" : report.target_type === "post" ? "作品" : "用户"}</dd><dt>对象作者</dt><dd>{targetAuthor}</dd><dt>对象 ID</dt><dd className="admin-mono">{report.target_id || report.comment_id}</dd></dl>
          </section>
        </aside>
      </div>
    </main>
  );
}
