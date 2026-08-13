"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { renderSafeMarkdown } from "@/lib/markdown";

interface ChapterPreviewData {
  seriesName: string;
  chapterNumber: number;
  title: string;
  titleMode: "numbered" | "free";
  content: string;
  authorNote: string;
  wordCount: number;
}

export default function ChapterPreviewPage() {
  const router = useRouter();
  const [preview, setPreview] = useState<ChapterPreviewData | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("inkland:chapter-preview");
    if (!stored) return;
    try {
      setPreview(JSON.parse(stored) as ChapterPreviewData);
    } catch {
      window.localStorage.removeItem("inkland:chapter-preview");
    }
  }, []);

  if (!preview) {
    return <main className="chapter-static-preview-empty"><i className="fa-regular fa-file-lines" /><h1>暂无可预览的章节</h1><p>请返回章节编辑页，填写内容后再次点击预览。</p><button type="button" onClick={() => router.back()}>返回编辑</button></main>;
  }

  const displayTitle = preview.titleMode === "numbered"
    ? `第 ${preview.chapterNumber} 章${preview.title ? ` ${preview.title}` : ""}`
    : (preview.title || "未命名章节");

  return (
    <main className="chapter-static-preview-page">
      <div className="chapter-static-preview-toolbar">
        <div><span>章节发布效果预览</span><strong>{preview.seriesName}</strong></div>
        <button type="button" onClick={() => window.close()}><i className="fa-solid fa-arrow-left" />返回编辑</button>
      </div>
      <article className="content-wrapper chapter-static-preview-content">
        <h1 className="work-title">{displayTitle}</h1>
        <div className="chapter-static-preview-meta">
          <span><i className="fa-solid fa-book-open" />{preview.seriesName}</span>
          <span><i className="fa-regular fa-file-lines" />{preview.wordCount.toLocaleString()}字</span>
          <span><i className="fa-regular fa-calendar" />发布后显示日期</span>
        </div>
        <div className="work-content">
          <div className="reader-content" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(preview.content) }} />
        </div>
        {preview.authorNote && <aside className="chapter-static-author-note"><strong>作者的话</strong><p>{preview.authorNote}</p></aside>}
        <div className="chapter-nav chapter-static-preview-nav">
          <span className="chapter-nav-btn prev disabled"><span className="chapter-nav-label"><i className="fa-solid fa-chevron-left" /> 上一章</span></span>
          <span className="chapter-nav-btn back"><span className="chapter-nav-label">返回目录</span></span>
          <span className="chapter-nav-btn next disabled"><span className="chapter-nav-label">下一章 <i className="fa-solid fa-chevron-right" /></span></span>
        </div>
      </article>
    </main>
  );
}
