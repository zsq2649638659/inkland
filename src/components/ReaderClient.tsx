"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
import ParagraphCommentPanel from "@/components/ParagraphCommentPanel";
import EmojiPicker from "@/components/EmojiPicker";
import { createNotification } from "@/lib/notifications";
import { submitReportV1 } from "@/lib/reportContent";
import { assertCanComment } from "@/lib/userRestrictions";
import type { Post, Comment } from "@/lib/types";
import DefaultAvatar from "@/components/DefaultAvatar";
import { isSafeExternalImageUrl, renderSafeInlineMarkdown, renderSafeMarkdown } from "@/lib/markdown";
import { useAppDialog } from "@/components/AppDialogProvider";

interface ReaderClientProps {
  post: Post;
}

export default function ReaderClient({ post }: ReaderClientProps) {
  const supabase = createClient();
  const { user, profile } = useAuth();
  const dialog = useAppDialog();
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [readerWidth, setReaderWidth] = useState("800");
  const [fontFamily, setFontFamily] = useState("sans");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedParaIndex, setSelectedParaIndex] = useState<number | null>(null);
  const [showParaPanel, setShowParaPanel] = useState(false);
  const [paraCommentCounts, setParaCommentCounts] = useState<Map<number, number>>(new Map());
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [totalComments, setTotalComments] = useState(post.comment_count || 0);
  const [stats, setStats] = useState({
    like_count: post.like_count || 0,
    bookmark_count: post.bookmark_count || 0,
    comment_count: post.comment_count || 0,
  });
  // 举报状态
  const [reportModal, setReportModal] = useState<{ open: boolean; targetType: "comment" | "post"; targetId: string } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportCustomReason, setReportCustomReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  // 屏蔽弹窗状态
  const [blockModal, setBlockModal] = useState<{ open: boolean; userId: string } | null>(null);
  // 评论操作菜单
  const [commentMenuId, setCommentMenuId] = useState<string | null>(null);
  // 上一章/下一章
  const [prevChapter, setPrevChapter] = useState<{ id: string; title: string } | null>(null);
  const [nextChapter, setNextChapter] = useState<{ id: string; title: string } | null>(null);
  // 浮动面板状态
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentRight, setContentRight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  // 评论回复状态
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  // 评论 hover 状态
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  // Toast 提示
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // 事件委托：鼠标悬停时查找最近的 [data-comment-id] 元素
  const handleCommentMouseOver = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-comment-id]');
    if (el) {
      const id = el.getAttribute('data-comment-id');
      if (id) setHoveredCommentId(id);
    }
  }, []);

  // 鼠标离开评论容器时重置 hover 状态
  const handleCommentMouseOut = useCallback((e: React.MouseEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setHoveredCommentId(null);
    }
  }, []);

  // 是否为文字作品（启用段评）
  const isTextPost = post.post_type === "novel" || post.post_type === "serial" || post.post_type === "article";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showParaPanel) {
          setShowParaPanel(false);
          setSelectedParaIndex(null);
        } else if (activePanel) setActivePanel(null);
        else if (showSettings) setShowSettings(false);
        else if (commentMenuId) setCommentMenuId(null);
        else if (reportModal) setReportModal(null);
        else if (blockModal) setBlockModal(null);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (commentMenuId) {
        setCommentMenuId(null);
      }
      if (activePanel) {
        const target = e.target as HTMLElement;
        if (!target.closest('.floating-panel') && !target.closest('.floating-btn')) {
          setActivePanel(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showParaPanel, showSettings, commentMenuId, activePanel]);

  // 追踪 content-wrapper 的右边缘位置（相对于视口左边缘），用于浮动侧边栏和面板定位
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const updatePosition = () => {
      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        setContentRight(rect.right);
        setViewportWidth(window.innerWidth);
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [readerWidth]);

  useEffect(() => {
    loadComments();
    loadParaCommentCounts();
    fetchStats();
    loadAdjacentChapters();
    // 读取 localStorage 中保存的主题
    try {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark") applyTheme("dark");
    } catch { /* ignore */ }
    // 保存阅读进度（长篇连载）
    if (post.series_name && post.chapter_number && post.chapter_number > 0) {
      try {
        localStorage.setItem(
          `reading_progress_${post.series_name}`,
          JSON.stringify({ chapterId: post.id, chapterNumber: post.chapter_number })
        );
      } catch { /* ignore */ }
    }
  }, [post.id]);

  const loadAdjacentChapters = async () => {
    setPrevChapter(null);
    setNextChapter(null);
    const sn = post.series_name;
    if (!sn) return;

    // 查询合集中所有已发布的作品，按创建时间排序
    const { data: allPosts } = await supabase
      .from("posts")
      .select("id, title, chapter_number, created_at")
      .eq("series_name", sn)
      .eq("status", "published")
      .order("created_at", { ascending: true });

    if (!allPosts || allPosts.length === 0) return;

    // 找到当前作品在合集中的位置
    const allArr = allPosts as Array<Record<string, unknown>>;
    const currentIndex = allArr.findIndex((p) => p.id === post.id);
    if (currentIndex === -1) return;

    // 前一篇
    if (currentIndex > 0) {
      const prev = allArr[currentIndex - 1];
      setPrevChapter({ id: prev.id as string, title: (prev.title as string) || "" });
    }

    // 后一篇
    if (currentIndex < allArr.length - 1) {
      const next = allArr[currentIndex + 1];
      setNextChapter({ id: next.id as string, title: (next.title as string) || "" });
    }
  };

  const fetchStats = async () => {
    const { data } = await supabase
      .from("post_stats")
      .select("like_count, comment_count, bookmark_count")
      .eq("id", post.id)
      .single();
    if (data) {
      setStats({
        like_count: (data as Record<string, number>).like_count || 0,
        bookmark_count: (data as Record<string, number>).bookmark_count || 0,
        comment_count: (data as Record<string, number>).comment_count || 0,
      });
    }
  };

  const [replies, setReplies] = useState<Record<string, Comment[]>>({});

  const loadComments = async () => {
    // 加载所有评论（包括回复）
    const { data } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, parent_id, paragraph_index, author:profiles!comments_user_id_fkey(nickname, avatar_url)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const all: Comment[] = (data as Record<string, unknown>[]).map((c) => {
        const author = c.author as { nickname: string; avatar_url: string | null } | null;
        return {
          id: c.id as string,
          post_id: post.id,
          user_id: c.user_id as string,
          content: c.content as string,
          created_at: c.created_at as string,
          parent_id: c.parent_id as string | null,
          paragraph_index: c.paragraph_index as number | null,
          author: {
            nickname: author?.nickname || "匿名用户",
            avatar_url: author?.avatar_url,
          },
        };
      });

      // 分离顶级评论和回复
      const topLevel = all.filter((c) => !c.parent_id);
      const replyMap: Record<string, Comment[]> = {};
      all.forEach((c) => {
        if (c.parent_id) {
          if (!replyMap[c.parent_id]) replyMap[c.parent_id] = [];
          replyMap[c.parent_id].push(c);
        }
      });

      setComments(topLevel);
      setReplies(replyMap);
      setTotalComments(all.length);
    }
  };

  const loadParaCommentCounts = async () => {
    const { data } = await supabase
      .from("comments")
      .select("paragraph_index")
      .eq("post_id", post.id)
      .not("paragraph_index", "is", null);

    if (data) {
      const counts = new Map<number, number>();
      for (const c of data as Array<Record<string, unknown>>) {
        const idx = c.paragraph_index as number;
        counts.set(idx, (counts.get(idx) || 0) + 1);
      }
      setParaCommentCounts(counts);
    }
  };

  const submitComment = async () => {
    if (!user) return;
    if (!commentText.trim()) return;
    const blocked = await assertCanComment();
    if (blocked) {
      showToast(blocked);
      return;
    }
    setCommentLoading(true);

    const { error } = await supabase.from("comments").insert({
      post_id: post.id,
      user_id: user.id,
      content: commentText.trim(),
    });

    if (!error) {
      setCommentText("");
      setTotalComments((c) => c + 1);
      await loadComments();
      fetchStats();
      createNotification({
        type: "comment",
        actor_id: user.id,
        post_id: post.id,
        content: commentText.trim(),
      });
    }
    setCommentLoading(false);
  };

  const fontMap: Record<string, string> = {
    sans: '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
    serif: '"Noto Serif SC","Songti SC","SimSun",serif',
    kai: '"KaiTi","STKaiti","Noto Serif SC",serif',
  };

  const themeColors: Record<string, { bg: string; text: string }> = {
    white: { bg: "#ffffff", text: "#1a1a1a" },
    warm: { bg: "#faf8f5", text: "#2c2416" },
    beige: { bg: "#f5f0e8", text: "#2c2416" },
    green: { bg: "#e8f0e8", text: "#1a2a1a" },
    blue: { bg: "#e8eef5", text: "#1a2a3a" },
    dark: { bg: "#1a1a1a", text: "#b8b0a0" },
  };

  const [currentTheme, setCurrentTheme] = useState("warm");

  const applyTheme = useCallback((theme: string) => {
    setCurrentTheme(theme);
    const isDark = theme === "dark";
    setDarkMode(isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    try { localStorage.setItem("theme", isDark ? "dark" : "light"); } catch { /* ignore */ }
  }, []);

  const authorName = post.author?.nickname || "匿名用户";
  const content = post.content || "";

  // 按换行分割段落
  const paragraphs = isTextPost
    ? content.split(/\r?\n+/).filter((p) => p.trim())
    : [];

  const tags = Array.isArray(post.tags) ? post.tags : [];
  const tagNames = tags.map((t) => (typeof t === "string" ? t : t.name));
  const createdAt = post.created_at
    ? new Date(post.created_at).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const displayName = profile?.nickname || user?.email?.split("@")[0] || "?";
  const avatarChar = profile?.nickname?.[0] || user?.email?.[0] || "?";

  const goToLogin = () => {
    window.location.href = "/login";
  };

  const handleReport = (commentId: string, commentUserId: string) => {
    if (!user) { goToLogin(); return; }
    setReportModal({ open: true, targetType: "comment", targetId: commentId });
    setReportReason("");
    setReportCustomReason("");
  };

  const handlePostReport = () => {
    if (!user) { goToLogin(); return; }
    setReportModal({ open: true, targetType: "post", targetId: post.id });
    setReportReason("");
    setReportCustomReason("");
  };

  const submitReport = async () => {
    const reason = reportReason === "其他" ? reportCustomReason.trim() : reportReason.trim();
    if (!reportModal || !reason) return;
    setReportSubmitting(true);
    const result = await submitReportV1(supabase, { targetType: reportModal.targetType, targetId: reportModal.targetId, reason });
    setReportSubmitting(false);
    if (!result.ok) { showToast(result.message); return; }
    setReportModal(null);
    showToast(result.message);
  };

  const handleBlockUser = async (blockedUserId: string) => {
    if (!user) { goToLogin(); return; }
    // 打开屏蔽确认弹窗
    setBlockModal({ open: true, userId: blockedUserId });
  };

  const confirmBlockUser = async () => {
    if (!blockModal || !user) return;
    const { error } = await supabase.from("blocked_users").insert({
      user_id: user.id,
      blocked_user_id: blockModal.userId,
    });
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      showToast("操作失败: " + error.message);
      return;
    }
    setComments((prev) => prev.filter((c) => c.user_id !== blockModal.userId));
    setTotalComments((c) => Math.max(0, c - 1));
    setBlockModal(null);
    showToast("屏蔽成功");
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    if (!await dialog.confirm({ title:"删除评论", message:"确定要删除这条评论吗？删除后无法恢复。", confirmLabel:"删除评论", variant:"danger" })) return;
    const { error } = await supabase.from("comments").delete().eq("id", commentId).eq("user_id", user.id);
    if (!error) {
      await loadComments();
      fetchStats();
    }
  };

  const togglePanel = (panelId: string | null) => {
    setActivePanel((prev) => (prev === panelId ? null : panelId));
  };

  const handleParagraphClick = (index: number) => {
    if (!isTextPost) return;
    if (selectedParaIndex === index) {
      setSelectedParaIndex(null);
      setShowParaPanel(false);
    } else {
      setSelectedParaIndex(index);
      setShowParaPanel(true);
    }
  };

  // 渲染段落内容（处理 Markdown 内联格式 + 图片）
  const renderParagraph = (text: string): React.ReactNode => {
    // 检查是否为纯图片段落
    const imageMatch = text.match(/^!\[.*?\]\((.*?)\)$/);
    if (imageMatch) {
      if (!isSafeExternalImageUrl(imageMatch[1])) return <span>{text}</span>;
      return (
        <div className="flex justify-center my-4">
          <img
            src={imageMatch[1]}
            alt=""
            className="max-w-full rounded-lg"
            style={{ maxHeight: "400px" }}
            loading="lazy"
          />
        </div>
      );
    }

    // 提取图片并替换为占位符
    const images: string[] = [];
    const textWithoutImages = text.replace(/!\[.*?\]\((.*?)\)/g, (_, url) => {
      images.push(url);
      return `__IMG_${images.length - 1}__`;
    });

    // 渲染 Markdown 内联
    const html = renderSafeInlineMarkdown(textWithoutImages) || textWithoutImages;

    // 把图片占位符替换回 img 标签
    let result = html;
    images.forEach((url, i) => {
      result = result.replace(
        `__IMG_${i}__`,
        `<img src="${url}" alt="" class="max-w-full rounded-lg my-2" style="max-height:400px" loading="lazy" />`
      );
    });

    return <span dangerouslySetInnerHTML={{ __html: renderSafeInlineMarkdown(result) }} />;
  };

  // 设置页面背景色到 body
  useEffect(() => {
    const bg = darkMode ? "#1a1a1a" : themeColors[currentTheme].bg;
    document.body.style.backgroundColor = bg;
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [darkMode, currentTheme]);

  return (
    <>
      {/* Floating Sidebar - 在 content-wrapper 右侧外侧 */}
      <div className="floating-sidebar" style={{ left: `${contentRight + 48}px`, right: 'auto' }}>
        <button
          className="floating-btn"
          title={darkMode ? "切换日间模式" : "切换夜间模式"}
          onClick={() => {
            if (darkMode) applyTheme("warm");
            else applyTheme("dark");
          }}
        >
          <svg width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor">
            <path d="M513.17 128A255.06 255.06 0 0 0 448 298.67c0 141.38 114.62 256 256 256a255.36 255.36 0 0 0 189.8-84.2c1.45 13.65 2.2 27.5 2.2 41.53 0 212.08-171.93 384-384 384S128 724.07 128 512c0-209.7 168.1-380.16 376.96-383.94z m-117.82 85.93l-3.52 1.41C274.65 262.83 192 377.77 192 512c0 176.73 143.27 320 320 320 145.41 0 268.16-96.98 307.11-229.8l1.54-5.5-1.6 0.64a319.51 319.51 0 0 1-106.5 21.22L704 618.67c-176.73 0-320-143.27-320-320 0-28.48 3.75-56.4 10.94-83.2z"/>
          </svg>
        </button>
        <button className="floating-btn" title="字体设置" onClick={() => togglePanel('font')}>
          <svg width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor">
            <path d="M701.6 735.97l-33.8 92.8a32 32 0 0 1-60.15-21.89l130.37-358.08a31.97 31.97 0 0 1 42.01-21.89c10.21 3.71 17.38 12.1 19.97 21.86l130.34 358.08a32 32 0 0 1-60.16 21.92l-33.76-92.8H701.6z m23.26-64h88.26l-44.13-121.28-44.13 121.28zM234.75 576h202.5L336 297.86 234.75 576z m-23.3 64L144.64 823.65a32 32 0 0 1-60.13-21.89L303.36 200.32a32 32 0 0 1 32.64-20.96 32 32 0 0 1 32.64 20.96l218.88 601.4a32 32 0 0 1-60.16 21.89L460.58 640H211.46z"/>
          </svg>
        </button>
        <button className="floating-btn" title="页面宽度" onClick={() => togglePanel('width')}>
          <svg width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor">
            <path d="M866.18 128c33.15 0.19 47.49 1.15 58.88 6.98a64 64 0 0 1 27.97 27.97C960 176.64 960 194.56 960 244.1v483.58c0 40.7-0.64 56.83-6.98 69.38a64 64 0 0 1-27.97 27.97C911.36 832 893.44 832 843.9 832H168.32c-40.7 0-56.83-0.64-69.38-6.98a64 64 0 0 1-27.97-27.97c-5.76-11.39-6.78-25.73-6.91-58.88V221.82c0.13-33.15 1.09-47.49 6.91-58.88a64 64 0 0 1 27.97-27.97c11.39-5.76 25.73-6.78 58.88-6.91zM896 192H128l0.7 2.56c-0.45 6.78-0.7 23.3-0.7 49.54V768l2.56-0.7c6.78 0.45 23.3 0.7 49.54 0.7H896l-0.7-2.56c0.45-6.78 0.7-23.3 0.7-49.54V192z m-162.56 170.11l88 94.08c1.34 1.28 2.56 2.56 3.71 4.03 12.16 13 11.9 32.58-0.13 44.8l-92.16 93.44a32 32 0 1 1-45.63-44.93l40.96-41.53H301.25l41.28 41.34a32 32 0 1 1-45.25 45.25l-96-96a32 32 0 0 1 0-45.25l96-96a32 32 0 1 1 45.25 45.31L301.25 448h424.83l-39.42-42.11a32 32 0 1 1 46.72-43.78z"/>
          </svg>
        </button>
        <button className="floating-btn" title="举报作品" onClick={handlePostReport}>
          <i className="fa-regular fa-flag" />
        </button>
      </div>

      {/* Content Wrapper - 居中显示，与 floating-sidebar 同级，无多余外层 */}
      <div
        ref={contentRef}
        className="content-wrapper"
        style={{
          maxWidth: readerWidth === "auto" ? "var(--content-width, 800px)" : `${readerWidth}px`,
          color: darkMode ? "#b8b0a0" : themeColors[currentTheme].text,
        }}
      >
            {/* Title */}
            <h1 className="work-title">{post.title}</h1>

            {/* Tags Row (below title & above author) */}
            {tagNames.length > 0 && (
              <div className="tags-row">
                {tagNames.map((tag) => (
                  <Link key={tag} href={`/tag/${tag}`} className="tag">
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Author Row */}
            <div className="author-row">
              <div className="author-avatar">
                {post.author?.avatar_url ? (
                  <img src={post.author.avatar_url} alt={authorName} />
                ) : (
                  <DefaultAvatar name={authorName} className="author-avatar-placeholder" />
                )}
              </div>
              <Link href={`/user/${post.author?.nickname || ""}`} className="author-name">
                {authorName}
              </Link>
              <div className="work-meta">
                <span className="meta-item">
                  <i className="fa-regular fa-file-lines" />
                  <span className="meta-value">{post.word_count?.toLocaleString() || 0}字</span>
                </span>
                <span className="meta-item">
                  <i className="fa-regular fa-calendar" />
                  <span className="meta-value">{createdAt}</span>
                </span>
              </div>
            </div>

          {/* 段落模式（文字作品） */}
          {isTextPost ? (
            <div
              className="work-content"
              style={{
                fontFamily: fontMap[fontFamily],
                fontSize: `${fontSize}px`,
                lineHeight: 1.85,
                wordBreak: "break-word",
              }}
            >
              {paragraphs.map((para, idx) => {
                const isSelected = selectedParaIndex === idx;
                const paraCount = paraCommentCounts.get(idx) || 0;
                return (
                  <p
                    key={idx}
                    data-para-index={idx}
                    className={`${isSelected ? "selected-para" : ""}`}
                    onClick={() => handleParagraphClick(idx)}
                  >
                    {renderParagraph(para)}
                    {paraCount > 0 && (
                      <span className="para-comment-badge" data-para-index={idx}>
                        {paraCount}
                      </span>
                    )}
                  </p>
                );
              })}
            </div>
          ) : (
            /* 非文字作品：Markdown 渲染 */
            <div
              className="work-content"
              style={{
                fontFamily: fontMap[fontFamily],
                fontSize: `${fontSize}px`,
                lineHeight: 1.85,
                wordBreak: "break-word",
              }}
            >
              <div
                className="reader-content"
                dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(content) }}
                style={{ color: "inherit" }}
              />
            </div>
          )}

          {/* Chapter Navigation (合集作品) */}
          {post.series_name && (
            <div className="chapter-nav">
              {prevChapter ? (
                <Link href={`/read/${prevChapter.id}`} className="chapter-nav-btn prev">
                  <span className="chapter-nav-label"><i className="fa-solid fa-chevron-left" /> 上一篇</span>
                </Link>
              ) : (
                <span className="chapter-nav-btn prev disabled">
                  <span className="chapter-nav-label"><i className="fa-solid fa-chevron-left" /> 上一篇</span>
                </span>
              )}
              <Link href={`/${post.post_type === "serial" ? "series" : "collection"}/${encodeURIComponent(post.series_name)}`} className="chapter-nav-btn back">
                <span className="chapter-nav-label">{post.post_type === "serial" ? "返回目录" : "返回合集"}</span>
              </Link>
              {nextChapter ? (
                <Link href={`/read/${nextChapter.id}`} className="chapter-nav-btn next">
                  <span className="chapter-nav-label">下一篇 <i className="fa-solid fa-chevron-right" /></span>
                </Link>
              ) : (
                <span className="chapter-nav-btn next disabled">
                  <span className="chapter-nav-label">下一篇 <i className="fa-solid fa-chevron-right" /></span>
                </span>
              )}
            </div>
          )}

          {/* Stats Bar */}
          <div className="stats-bar">
            <LikeButton
              postId={post.id}
              initialCount={stats.like_count}
              onLogin={goToLogin}
              iconOnly
              plain
              className="stat-item"
            />
            <span className="stat-item" data-stat="comment">
              <i className="fa-regular fa-comment" />
              <span>{stats.comment_count}</span>
            </span>
            <BookmarkButton
              postId={post.id}
              initialCount={stats.bookmark_count}
              onLogin={goToLogin}
              iconOnly
              plain
              className="stat-item"
            />
            <button className="stat-item" data-stat="share" onClick={goToLogin}>
              <i className="fa-regular fa-share-from-square" />
              <span>分享</span>
            </button>
          </div>

          {/* 评论区 */}
          <div id="comments" className="comments-section" onMouseOver={handleCommentMouseOver} onMouseOut={handleCommentMouseOut}>

            {user ? (
              <div className="comment-input-area">
                <div className="comment-input-avatar">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={displayName} />
                  ) : (
                    <DefaultAvatar name={displayName} className="avatar" style={{ width: 56, height: 56 }} />
                  )}
                </div>
                <div className="comment-input-main">
                  <textarea
                    placeholder="写下你的想法..."
                    className="comment-textarea"
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={{
                      background: darkMode ? "var(--color-bg-secondary, #2a2a2a)" : "var(--color-card, #FFFFFF)",
                      color: darkMode ? "#d4c8b8" : "var(--color-text, #1A1A1A)",
                    }}
                  />
                  <div className="comment-submit-row">
                    <EmojiPicker
                      darkMode={darkMode}
                      onSelect={(emoji) => setCommentText((prev) => prev + emoji)}
                    />
                    <button
                      className="btn-submit"
                      onClick={submitComment}
                      disabled={commentLoading || !commentText.trim()}
                    >
                      <i className="fa-solid fa-paper-plane" /> 发布
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 32, padding: 24, textAlign: 'center', borderRadius: 12, background: 'var(--color-bg-secondary, #E8E4E0)' }}>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted, #6B6B6B)', marginBottom: 12 }}>
                  <i className="fa-regular fa-message" style={{ marginRight: 6 }} />
                  登录后参与评论
                </p>
                <Link href="/login" className="btn-submit" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                  <i className="fa-solid fa-right-to-bracket" /> 登录
                </Link>
              </div>
            )}

            {/* 评论列表 */}
            {comments.length === 0 ? (
              <div className="para-comment-panel-empty" style={{ padding: '60px 0' }}>
                <p>还没有人发表评论</p>
                <p>来做第一个评论的人吧</p>
              </div>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="comment" data-comment-id={c.id}>
                  <div className="comment-main">
                    <div className="comment-avatar">
                      {c.author?.avatar_url ? (
                        <img src={c.author.avatar_url} alt={c.author?.nickname || "?"} />
                      ) : (
                        <DefaultAvatar name={c.author?.nickname || "?"} className="comment-avatar-placeholder" />
                      )}
                    </div>
                    <div className="comment-body">
                      <div className="comment-header">
                        <span className="comment-name">{c.author?.nickname || "匿名用户"}</span>
                        <span className="comment-time">{c.created_at ? getTimeAgo(c.created_at) : ""}</span>
                      </div>
                      <p className="comment-text">{c.content}</p>
                      <div className="comment-actions">
                        <button
                          className="comment-action-btn"
                          onClick={() => {
                            if (!user) { goToLogin(); return; }
                            // TODO: like comment
                          }}
                        >
                          <i className="fa-regular fa-heart" />
                          <span>0</span>
                        </button>
                        {user && (
                          <button
                            className="comment-action-btn"
                            onClick={() => {
                              setReplyOpenId(replyOpenId === c.id ? null : c.id);
                              if (replyOpenId !== c.id) {
                                setReplyText(`@${c.author?.nickname || "匿名用户"} `);
                              }
                            }}
                          >
                            <i className="fa-regular fa-comment" />
                            <span>回复</span>
                          </button>
                        )}
                        {user && c.user_id === user.id && (
                          <button
                            className="comment-action-btn-delete"
                            onClick={() => handleDeleteComment(c.id)}
                          >
                            <i className="fa-regular fa-trash-can" />
                          </button>
                        )}
                        <button
                          className="comment-more-btn"
                          style={{ opacity: hoveredCommentId === c.id ? 1 : 0 }}
                          title="更多"
                          onClick={() => setCommentMenuId(commentMenuId === c.id ? null : c.id)}
                        >
                          ⋮
                        </button>
                        {commentMenuId === c.id && (
                          <div className="comment-popup show">
                            <button
                              className="comment-popup-item"
                              onClick={() => { setCommentMenuId(null); handleReport(c.id, c.user_id); }}
                            >
                              <i className="fa-solid fa-flag" />
                              举报
                            </button>
                            <button
                              className="comment-popup-item"
                              onClick={() => { setCommentMenuId(null); handleBlockUser(c.user_id); }}
                            >
                              <i className="fa-solid fa-ban" />
                              屏蔽
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 回复列表 */}
                      {replies[c.id] && replies[c.id].length > 0 && (
                        <div className="nested-replies">
                          {replies[c.id].map((reply) => (
                            <div key={reply.id} className="nested-reply-item" data-comment-id={reply.id}>
                              <div className="nested-reply-avatar">
                                <Link href={`/user/${reply.user_id}`}>
                                  {reply.author?.avatar_url ? (
                                    <img src={reply.author.avatar_url} alt={reply.author?.nickname || "?"} />
                                  ) : (
                                    <DefaultAvatar name={reply.author?.nickname || "?"} className="nested-reply-avatar-placeholder" />
                                  )}
                                </Link>
                              </div>
                              <div className="nested-reply-body">
                                <div className="nested-reply-header">
                                  <Link href={`/user/${reply.user_id}`} className="nested-reply-name">
                                    {reply.author?.nickname || "匿名用户"}
                                  </Link>
                                  <span className="reply-to">回复 <Link href={`/user/${c.user_id}`}>@{c.author?.nickname || "匿名用户"}</Link></span>
                                  <span className="nested-reply-time">{reply.created_at ? getTimeAgo(reply.created_at) : ""}</span>
                                </div>
                                <p className="nested-reply-text">{reply.content}</p>
                                <div className="nested-reply-actions">
                                  <button
                                    className="comment-action-btn"
                                    onClick={() => {
                                      if (!user) { goToLogin(); return; }
                                    }}
                                  >
                                    <i className="fa-regular fa-heart" />
                                    <span>0</span>
                                  </button>
                                  {user && (
                                    <button
                                      className="comment-action-btn"
                                      onClick={() => {
                                        setReplyOpenId(replyOpenId === c.id ? null : c.id);
                                        if (replyOpenId !== c.id) {
                                          setReplyText(`@${reply.author?.nickname || "匿名用户"} `);
                                        }
                                      }}
                                    >
                                      <i className="fa-regular fa-comment" />
                                      <span>回复</span>
                                    </button>
                                  )}
                                  {user && reply.user_id === user.id && (
                                    <button
                                      className="comment-action-btn-delete"
                                      onClick={() => handleDeleteComment(reply.id)}
                                    >
                                      <i className="fa-regular fa-trash-can" />
                                    </button>
                                  )}
                                  <button
                                    className="comment-more-btn"
                                    style={{ opacity: hoveredCommentId === reply.id ? 1 : 0, marginLeft: 'auto' }}
                                    title="更多"
                                    onClick={() => setCommentMenuId(commentMenuId === reply.id ? null : reply.id)}
                                  >
                                    ⋮
                                  </button>
                                  {commentMenuId === reply.id && (
                                    <div className="comment-popup show">
                                      <button
                                        className="comment-popup-item"
                                        onClick={() => { setCommentMenuId(null); handleReport(reply.id, reply.user_id); }}
                                      >
                                        <i className="fa-solid fa-flag" />
                                        举报
                                      </button>
                                      <button
                                        className="comment-popup-item"
                                        onClick={() => { setCommentMenuId(null); handleBlockUser(reply.user_id); }}
                                      >
                                        <i className="fa-solid fa-ban" />
                                        屏蔽
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 回复输入框 */}
                      {replyOpenId === c.id && user && (
                        <div className="reply-input-area">
                          <textarea
                            placeholder={`回复 ${c.author?.nickname || "匿名用户"}...`}
                            rows={2}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            style={{
                              background: darkMode ? "var(--color-bg-secondary, #2a2a2a)" : "var(--color-bg-page, #FAF9F7)",
                              color: darkMode ? "#d4c8b8" : "var(--color-text, #1A1A1A)",
                            }}
                          />
                          <div className="reply-input-actions">
                            <button className="btn-cancel-reply" onClick={() => { setReplyOpenId(null); setReplyText(""); }}>
                              取消
                            </button>
                            <button
                              className="btn-submit-reply"
                              disabled={!replyText.trim()}
                              onClick={async () => {
                                if (!replyText.trim()) return;
                                const blocked = await assertCanComment();
                                if (blocked) {
                                  showToast(blocked);
                                  return;
                                }
                                setCommentLoading(true);
                                const { error } = await supabase.from("comments").insert({
                                  post_id: post.id,
                                  user_id: user.id,
                                  content: replyText.trim(),
                                  parent_id: c.id,
                                });
                                if (!error) {
                                  setReplyText("");
                                  setReplyOpenId(null);
                                  setTotalComments((n) => n + 1);
                                  await loadComments();
                                  fetchStats();
                                  createNotification({
                                    type: "reply",
                                    actor_id: user.id,
                                    post_id: post.id,
                                    content: replyText.trim(),
                                  });
                                }
                                setCommentLoading(false);
                              }}
                            >
                              <i className="fa-solid fa-paper-plane" /> 发布
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>



      {/* Floating Panel */}
      <div
        className={`floating-panel ${activePanel ? 'active' : ''}`}
        style={{ right: `${viewportWidth - contentRight - 36}px`, left: 'auto' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setActivePanel(null);
        }}
      >
        {/* Font Panel */}
        <div className={`panel-content ${activePanel === 'font' ? 'active' : ''}`} id="panelFont" onClick={(e) => e.stopPropagation()}>
          <div className="panel-header">字体设置</div>

          <div className="panel-section">
            <div className="panel-section-title">字号大小</div>
            <div className="font-size-slider-row">
              <span className="font-size-label">A</span>
              <input
                type="range"
                className="font-size-slider"
                min="12"
                max="40"
                value={fontSize}
                step="2"
                onChange={(e) => setFontSize(parseInt(e.target.value))}
              />
              <span className="font-size-label font-size-label-large">A</span>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-title">字体</div>
            <div className="font-grid">
              {[
                { key: "sans", label: "思源黑体" },
                { key: "serif", label: "思源宋体" },
                { key: "kai", label: "霞鹜文楷" },
              ].map((f) => (
                <button
                  key={f.key}
                  className={`font-option ${fontFamily === f.key ? "active" : ""}`}
                  onClick={() => setFontFamily(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Width Panel */}
        <div className={`panel-content ${activePanel === 'width' ? 'active' : ''}`} id="panelWidth" onClick={(e) => e.stopPropagation()}>
          <div className="panel-header">页面宽度</div>
          <div className="width-options">
            {["auto", "640", "800", "900", "1000", "1280"].map((w) => (
              <button
                key={w}
                className={`width-option ${readerWidth === w ? "active" : ""}`}
                onClick={() => setReaderWidth(w)}
              >
                {w === "auto" ? "自动" : w}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Paragraph Comment Bottom Sheet Modal */}
      <div
        className={`para-comment-panel-overlay ${isTextPost && showParaPanel && selectedParaIndex !== null ? 'active' : ''}`}
        onClick={() => {
          setShowParaPanel(false);
          setSelectedParaIndex(null);
        }}
      >
        <div className="para-comment-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: readerWidth === "auto" ? "var(--content-width, 800px)" : `${readerWidth}px` }}>
          {isTextPost && selectedParaIndex !== null && (
            <ParagraphCommentPanel
              postId={post.id}
              paragraphIndex={selectedParaIndex}
              open={showParaPanel}
              onClose={() => {
                setShowParaPanel(false);
                setSelectedParaIndex(null);
              }}
              darkMode={darkMode}
              onReport={(commentId, commentUserId) => handleReport(commentId, commentUserId)}
            />
          )}
        </div>
      </div>

      {/* 举报弹窗 */}
      <div className={`modal-overlay moderation-modal-overlay${reportModal?.open ? ' active' : ''}`} onClick={() => setReportModal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">举报原因</div>
          <div className="modal-body">
            <ul className="report-reason-list">
              {["垃圾广告", "色情低俗内容", "人身攻击与辱骂", "违法违规内容", "引战与恶意引战", "其他"].map((reason) => (
                <li
                  key={reason}
                  className={`report-reason-item${reportReason === reason ? ' selected' : ''}`}
                  data-reason={reason}
                  onClick={() => setReportReason(reason)}
                >
                  <span className="report-reason-radio"></span>
                  {reason}
                </li>
              ))}
            </ul>
            {reportReason === "其他" && (
              <textarea
                className="moderation-custom-reason"
                value={reportCustomReason}
                onChange={(event) => setReportCustomReason(event.target.value)}
                placeholder="请填写举报理由"
                rows={3}
                autoFocus
              />
            )}
          </div>
          <div className="modal-actions">
            <button className="btn-modal btn-modal-cancel" onClick={() => setReportModal(null)}>取消</button>
            <button
              className="btn-modal btn-modal-primary"
              onClick={submitReport}
              disabled={reportSubmitting || !reportReason || (reportReason === "其他" && !reportCustomReason.trim())}
            >
              {reportSubmitting ? "提交中..." : "提交举报"}
            </button>
          </div>
        </div>
      </div>

      {/* 屏蔽确认弹窗 */}
      <div className={`modal-overlay${blockModal?.open ? ' active' : ''}`} onClick={() => setBlockModal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">确认屏蔽</div>
          <div className="modal-body">
            <p>确定要屏蔽该用户吗？屏蔽后，该用户将无法评论你的作品。</p>
          </div>
          <div className="modal-actions">
            <button className="btn-modal btn-modal-cancel" onClick={() => setBlockModal(null)}>取消</button>
            <button className="btn-modal btn-modal-danger" onClick={confirmBlockUser}>确认屏蔽</button>
          </div>
        </div>
      </div>

      {/* Toast 提示 */}
      <div className={`toast${toastMessage ? ' show' : ''}`}>{toastMessage || ''}</div>
  </>
);
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}
