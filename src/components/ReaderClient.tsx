"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { marked } from "marked";
import { createClient } from "@/lib/supabase/browser";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
import ParagraphCommentPanel from "@/components/ParagraphCommentPanel";
import EmojiPicker from "@/components/EmojiPicker";
import type { Post, Comment } from "@/lib/types";

interface ReaderClientProps {
  post: Post;
}

export default function ReaderClient({ post }: ReaderClientProps) {
  const supabase = createClient();
  const { user, profile } = useAuth();
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
  const [reportModal, setReportModal] = useState<{ open: boolean; commentId: string; commentUserId: string } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  // 评论操作菜单
  const [commentMenuId, setCommentMenuId] = useState<string | null>(null);
  // 上一章/下一章
  const [prevChapter, setPrevChapter] = useState<{ id: string; title: string } | null>(null);
  const [nextChapter, setNextChapter] = useState<{ id: string; title: string } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [panelLeft, setPanelLeft] = useState(0);

  // 是否为文字作品（启用段评）
  const isTextPost = post.post_type === "novel" || post.post_type === "serial" || post.post_type === "article";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showParaPanel) {
          setShowParaPanel(false);
          setSelectedParaIndex(null);
        } else if (showSettings) setShowSettings(false);
        else if (commentMenuId) setCommentMenuId(null);
      }
    };
    const handleClickOutside = () => setCommentMenuId(null);
    if (commentMenuId) {
      document.addEventListener("click", handleClickOutside);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showParaPanel, showSettings, commentMenuId]);

  // 追踪 main 元素右边缘位置，用于面板和侧边栏的固定定位
  useEffect(() => {
    if (!mainRef.current) return;
    const updatePosition = () => {
      if (mainRef.current) {
        setPanelLeft(mainRef.current.getBoundingClientRect().right);
      }
    };
    const timer = setTimeout(updatePosition, 50);
    window.addEventListener("resize", updatePosition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showParaPanel, selectedParaIndex, readerWidth]);

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
    const cn = post.chapter_number;
    if (!sn || !cn) return;
    const { data: prevData } = await supabase
      .from("posts")
      .select("id, title, chapter_number")
      .eq("series_name", sn)
      .eq("status", "published")
      .eq("post_type", "serial")
      .gt("chapter_number", 0)
      .lt("chapter_number", cn)
      .order("chapter_number", { ascending: false })
      .limit(1);
    if (prevData && prevData.length > 0) {
      const p = prevData[0] as Record<string, unknown>;
      setPrevChapter({ id: p.id as string, title: `第${p.chapter_number}章 ${(p.title as string) || ""}` });
    }
    const { data: nextData } = await supabase
      .from("posts")
      .select("id, title, chapter_number")
      .eq("series_name", sn)
      .eq("status", "published")
      .eq("post_type", "serial")
      .gt("chapter_number", 0)
      .gt("chapter_number", cn)
      .order("chapter_number", { ascending: true })
      .limit(1);
    if (nextData && nextData.length > 0) {
      const n = nextData[0] as Record<string, unknown>;
      setNextChapter({ id: n.id as string, title: `第${n.chapter_number}章 ${(n.title as string) || ""}` });
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

  const loadComments = async () => {
    const { data } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, parent_id, paragraph_index, author:profiles!comments_user_id_fkey(nickname, avatar_url)")
      .eq("post_id", post.id)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      const formatted: Comment[] = (data as Record<string, unknown>[]).map((c) => {
        const author = c.author as { nickname: string; avatar_url: string | null } | null;
        return {
          id: c.id as string,
          post_id: post.id,
          user_id: c.user_id as string,
          content: c.content as string,
          created_at: c.created_at as string,
          parent_id: null,
          paragraph_index: c.paragraph_index as number | null,
          author: {
            nickname: author?.nickname || "匿名用户",
            avatar_url: author?.avatar_url,
          },
        };
      });
      setComments(formatted);
      setTotalComments(formatted.length);
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
    setReportModal({ open: true, commentId, commentUserId });
    setReportReason("");
  };

  const submitReport = async () => {
    if (!reportModal || !reportReason.trim()) return;
    setReportSubmitting(true);
    const { error } = await supabase.from("comment_reports").insert({
      comment_id: reportModal.commentId,
      reporter_id: user!.id,
      reason: reportReason.trim(),
    });
    setReportSubmitting(false);
    if (error) { alert("举报失败: " + error.message); return; }
    setReportModal(null);
    alert("举报已提交，管理员会尽快处理。");
  };

  const handleBlockUser = async (blockedUserId: string) => {
    if (!user) { goToLogin(); return; }
    if (!confirm("确定要屏蔽该用户吗？屏蔽后你将不再看到该用户的评论和作品。")) return;
    const { error } = await supabase.from("blocked_users").insert({
      user_id: user.id,
      blocked_user_id: blockedUserId,
    });
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      alert("操作失败: " + error.message);
      return;
    }
    setComments((prev) => prev.filter((c) => c.user_id !== blockedUserId));
    setTotalComments((c) => Math.max(0, c - 1));
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
    const html = (marked.parseInline(textWithoutImages) as string) || textWithoutImages;

    // 把图片占位符替换回 img 标签
    let result = html;
    images.forEach((url, i) => {
      result = result.replace(
        `__IMG_${i}__`,
        `<img src="${url}" alt="" class="max-w-full rounded-lg my-2" style="max-height:400px" loading="lazy" />`
      );
    });

    return <span dangerouslySetInnerHTML={{ __html: result }} />;
  };

  return (
    <div
      className={`min-h-screen ${darkMode ? "dark" : ""}`}
      style={{
        background: darkMode ? "#1a1a1a" : themeColors[currentTheme].bg,
        color: darkMode ? "#b8b0a0" : themeColors[currentTheme].text,
      }}
    >
      {/* Content */}
      <div className="flex justify-center px-10 max-md:px-4 pt-4">
        <div className="flex items-start">
        <main
          ref={mainRef}
          className="max-w-full py-6 pb-16"
          style={{ width: readerWidth === "auto" ? "100%" : `${readerWidth}px` }}
        >
          <header className="mb-10">
            <h1
              className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold mb-3 leading-tight"
              style={{ color: darkMode ? "#e6e0d8" : "#2c2416" }}
            >
              {post.title}
            </h1>
            <div className="flex flex-wrap gap-3 items-center text-sm text-muted mb-3">
              <span className="flex items-center gap-1"><i className="fa-solid fa-user-pen" />{authorName}</span>
              <span className="opacity-50">|</span>
              <span>{post.word_count?.toLocaleString() || 0}字</span>
              <span className="opacity-50">|</span>
              <span>{createdAt}</span>
            </div>
            {tagNames.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {tagNames.map((tag) => (
                  <Link key={tag} href={`/tag/${tag}`} className="tag">
                    {tag}
                  </Link>
                ))}
              </div>
            )}
          </header>
          <hr style={{ borderColor: darkMode ? "#333" : "#e8e0d5", margin: "0 0 32px" }} />

          {/* 段落模式（文字作品） */}
          {isTextPost ? (
            <article
              className="overflow-hidden"
              style={{
                fontFamily: fontMap[fontFamily],
                fontSize: `${fontSize}px`,
                lineHeight: 2,
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
                    className={`cursor-pointer transition-all duration-150 rounded-md px-2 ${
                      isSelected ? "selected-para" : "hover:bg-accent-light/20"
                    }`}
                    style={{
                      textIndent: "2em",
                      marginBottom: "0.8em",
                      ...(isSelected
                        ? {
                            background: darkMode ? "rgba(184,117,46,0.12)" : "rgba(184,117,46,0.08)",
                            borderBottom: "1px dashed rgba(184,117,46,0.4)",
                            boxShadow: "none",
                          }
                        : {}),
                      color: "inherit",
                    }}
                    onClick={() => handleParagraphClick(idx)}
                  >
                    {renderParagraph(para)}
                    {paraCount > 0 && (
                      <span
                        className="ml-1.5 rounded-[4px] font-medium select-none"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: paraCount >= 10 ? "26px" : "20px",
                          height: "18px",
                          fontSize: "12px",
                          textIndent: 0,
                          verticalAlign: "middle",
                          background: darkMode ? "rgba(184,117,46,0.15)" : "rgba(184,117,46,0.1)",
                          color: darkMode ? "#c8964a" : "#b8752e",
                        }}
                      >
                        {paraCount}
                      </span>
                    )}
                  </p>
                );
              })}
            </article>
          ) : (
            /* 非文字作品：Markdown 渲染 */
            <article
              style={{
                fontFamily: fontMap[fontFamily],
                fontSize: `${fontSize}px`,
                lineHeight: 2,
                wordBreak: "break-word",
              }}
            >
              <div
                className="reader-content"
                dangerouslySetInnerHTML={{ __html: marked.parse(content) }}
                style={{ color: "inherit" }}
              />
            </article>
          )}

          {/* 互动数据 + 评论区 */}
          <div className="mt-10 pt-8 border-t" style={{ borderColor: darkMode ? "#333" : "#e8e0d5" }}>
            {/* 热度数据 */}
            <div className="flex items-center gap-5 mb-5">
              <LikeButton
                postId={post.id}
                initialCount={stats.like_count}
                onLogin={goToLogin}
                iconOnly
                plain
              />
              <BookmarkButton
                postId={post.id}
                initialCount={stats.bookmark_count}
                onLogin={goToLogin}
                iconOnly
                plain
              />
              <span className="flex items-center gap-1 text-sm text-muted">
                <i className="fa-regular fa-comment" />
                <span>{stats.comment_count}</span>
              </span>
            </div>

            {/* 写评论 */}
            <h3
              className="text-lg font-bold mb-4"
              style={{ color: darkMode ? "#d4c8b8" : "#2c2416" }}
            >
              <i className="fa-regular fa-comments mr-2" />
              评论 ({totalComments})
            </h3>

            {user ? (
              <div className="mb-6">
                <div className="relative">
                  <textarea
                    placeholder="写下你的评论..."
                    className="w-full px-4 py-3 text-sm border rounded-lg font-sans resize-none"
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={{
                      borderColor: darkMode ? "#444" : "#e8e0d5",
                      background: darkMode ? "#1a1a1a" : "#faf8f5",
                      color: darkMode ? "#d4c8b8" : "#2c2416",
                    }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <EmojiPicker
                      darkMode={darkMode}
                      onSelect={(emoji) => setCommentText((prev) => prev + emoji)}
                    />
                    <button
                      className="submit-btn text-sm px-4 py-2"
                      onClick={submitComment}
                      disabled={commentLoading || !commentText.trim()}
                    >
                      {commentLoading ? "发送中..." : "发送"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-4 text-center rounded-lg" style={{ background: darkMode ? "#1a1a1a" : "#faf8f5", borderColor: darkMode ? "#333" : "#e8e0d5", border: "1px solid" }}>
                <p className="text-sm text-muted mb-2">
                  <i className="fa-regular fa-message mr-1" />
                  登录后参与评论
                </p>
                <Link href="/login" className="btn-accent text-sm no-underline inline-block">
                  登录
                </Link>
              </div>
            )}

            <div className="space-y-4">
              {comments.length === 0 ? (
                <EmptyState icon="fa-comment-dots" title="暂无评论，成为第一个评论的人吧" compact />
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="flex gap-3 pb-4 border-b relative"
                    style={{ borderColor: darkMode ? "#333" : "#f0ebe3" }}
                  >
                    <img
                      src={c.author?.avatar_url || `https://placehold.co/36x36/e8d5c8/8c6b4a?text=${(c.author?.nickname || "?")[0]}`}
                      className="avatar-sm flex-shrink-0 mt-0.5"
                      alt="avatar"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium" style={{ color: darkMode ? "#d4c8b8" : "#2c2416" }}>
                          {c.author?.nickname || "匿名用户"}
                        </span>
                        <span className="text-xs text-muted">
                          {c.created_at ? getTimeAgo(c.created_at) : ""}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: darkMode ? "#c8c0b8" : "#4a3f2f" }}>
                        {c.content}
                      </p>
                    </div>
                    {user && c.user_id !== user.id && (
                      <div className="relative flex-shrink-0">
                        <button
                          className="w-6 h-6 flex items-center justify-center rounded-full text-muted hover:bg-accent-light hover:text-accent bg-transparent border-none cursor-pointer text-sm"
                          onClick={() => setCommentMenuId(commentMenuId === c.id ? null : c.id)}
                        >
                          <i className="fa-solid fa-ellipsis" />
                        </button>
                        {commentMenuId === c.id && (
                          <div className="absolute right-0 top-7 bg-white border border-rule rounded-lg shadow-lg py-1 z-[300] min-w-[100px]">
                            <button
                              className="w-full text-left px-4 py-2 text-sm text-warm hover:bg-accent-light bg-transparent border-none cursor-pointer whitespace-nowrap"
                              onClick={() => { setCommentMenuId(null); handleReport(c.id, c.user_id); }}
                            >
                              <i className="fa-solid fa-flag mr-2 text-xs text-red-400" />举报
                            </button>
                            <button
                              className="w-full text-left px-4 py-2 text-sm text-warm hover:bg-accent-light bg-transparent border-none cursor-pointer whitespace-nowrap"
                              onClick={() => { setCommentMenuId(null); handleBlockUser(c.user_id); }}
                            >
                              <i className="fa-solid fa-ban mr-2 text-xs text-red-400" />屏蔽
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </main>

        {/* 段评面板（仅文字作品）—— 固定定位，不随滚动 */}
        {isTextPost && showParaPanel && selectedParaIndex !== null && (
          <div
            className="fixed top-14 w-[420px] border-l z-[100]"
            style={{
              height: "calc(100vh - 56px)",
              left: `${panelLeft}px`,
              borderColor: darkMode ? "#333" : "#e8e0d5",
              background: darkMode ? "#1a1a1a" : "#faf8f5",
            }}
          >
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
          </div>
        )}
        {/* 当面板打开时，留一个占位 spacer 保持正文不偏移 */}
        {isTextPost && showParaPanel && selectedParaIndex !== null && (
          <div className="w-[420px] flex-shrink-0" />
        )}

        {/* Right Sidebar - 固定定位，始终屏幕垂直居中 */}
        <div className="fixed top-1/2 -translate-y-1/2 flex flex-col gap-1.5 max-md:hidden"
          style={{
            left: `${panelLeft + (showParaPanel && selectedParaIndex !== null ? 440 : 20)}px`,
          }}
        >
          {post.series_name && (
            <Link href={`/series/${encodeURIComponent(post.series_name)}`} className="rs-btn no-underline" title="查看目录">
              <i className="fa-solid fa-list-ul" />
            </Link>
          )}
          {(prevChapter || nextChapter) && (
            <>
              {prevChapter ? (
                <Link href={`/read/${prevChapter.id}`} className="rs-btn no-underline" title={prevChapter.title}>
                  <i className="fa-solid fa-chevron-left" />
                </Link>
              ) : (
                <div className="rs-btn opacity-30 cursor-not-allowed">
                  <i className="fa-solid fa-chevron-left" />
                </div>
              )}
              {nextChapter ? (
                <Link href={`/read/${nextChapter.id}`} className="rs-btn no-underline" title={nextChapter.title}>
                  <i className="fa-solid fa-chevron-right" />
                </Link>
              ) : (
                <div className="rs-btn opacity-30 cursor-not-allowed">
                  <i className="fa-solid fa-chevron-right" />
                </div>
              )}
              <span className="w-6 h-px bg-rule mx-auto" />
            </>
          )}
          <button
            className="rs-btn"
            title={darkMode ? "切换日间模式" : "切换夜间模式"}
            onClick={() => {
              if (darkMode) applyTheme("warm");
              else applyTheme("dark");
            }}
          >
            <i className={`fa-solid fa-${darkMode ? "sun" : "moon"}`} />
          </button>
          <button className="rs-btn" title="设置" onClick={() => setShowSettings(true)}>
            <i className="fa-solid fa-gear" />
          </button>
        </div>
        </div>
      </div>

      {/* Settings Overlay */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="rounded-2xl p-7 w-[420px] max-w-[90vw]"
            style={{
              background: darkMode ? "#2a2a2a" : "#fff",
              borderColor: darkMode ? "#444" : "#e8e0d5",
              border: "1px solid",
              color: darkMode ? "#d4c8b8" : "#2c2416",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5">
              <h4 className="text-sm font-semibold mb-1.5">阅读主题</h4>
              <div className="flex gap-2">
                {[
                  { name: "white", bg: "#fff" },
                  { name: "warm", bg: "#faf8f5" },
                  { name: "beige", bg: "#f5f0e8" },
                  { name: "green", bg: "#e8f0e8" },
                  { name: "blue", bg: "#e8eef5" },
                  { name: "dark", bg: "#1a1a1a" },
                ].map((t) => (
                  <div
                    key={t.name}
                    className="theme-swatch cursor-pointer"
                    style={{
                      background: t.bg,
                      borderColor: currentTheme === t.name ? "#b8752e" : darkMode ? "#444" : "#e8e0d5",
                      boxShadow: currentTheme === t.name ? "0 0 0 2px rgba(184,117,46,0.4)" : "none",
                    }}
                    onClick={() => applyTheme(t.name)}
                  />
                ))}
              </div>
            </div>

            <div className="mb-5">
              <h4 className="text-sm font-semibold mb-1.5">正文字体</h4>
              <div className="flex gap-2">
                {[
                  { key: "sans", label: "黑体" },
                  { key: "serif", label: "宋体" },
                  { key: "kai", label: "楷体" },
                ].map((f) => (
                  <button
                    key={f.key}
                    className={`reader-font-btn ${fontFamily === f.key ? "active" : ""}`}
                    onClick={() => setFontFamily(f.key)}
                    style={{
                      background: fontFamily === f.key ? "#b8752e" : darkMode ? "#3a3a3a" : "#f5f0ea",
                      color: fontFamily === f.key ? "#fff" : darkMode ? "#8a8078" : "#8c7b6b",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <h4 className="text-sm font-semibold mb-1.5">字体大小</h4>
              <div className="flex items-center gap-3">
                <button
                  className="rs-slider-btn"
                  onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                  disabled={fontSize <= 12}
                >
                  <i className="fa-solid fa-minus" />
                </button>
                <span className="text-base font-semibold text-accent min-w-8 text-center select-none">
                  {fontSize}
                </span>
                <button
                  className="rs-slider-btn"
                  onClick={() => setFontSize(Math.min(48, fontSize + 2))}
                  disabled={fontSize >= 48}
                >
                  <i className="fa-solid fa-plus" />
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-1.5">页面宽度</h4>
              <div className="flex flex-wrap gap-2">
                {["auto", "640", "800", "900", "1000", "1280"].map((w) => (
                  <button
                    key={w}
                    className={`reader-width-btn ${readerWidth === w ? "active" : ""}`}
                    onClick={() => setReaderWidth(w)}
                    style={{
                      background: readerWidth === w ? "#b8752e" : darkMode ? "#3a3a3a" : "#f5f0ea",
                      color: readerWidth === w ? "#fff" : darkMode ? "#8a8078" : "#8c7b6b",
                    }}
                  >
                    {w === "auto" ? "自动" : w}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 举报弹窗 */}
    {reportModal?.open && (
      <div className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center" onClick={() => setReportModal(null)}>
        <div className="bg-white rounded-2xl p-6 w-[400px] max-w-[90vw] shadow-xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-warm mb-4">举报评论</h3>
          <p className="text-sm text-muted mb-4">请选择举报原因：</p>
          <div className="space-y-2 mb-5">
            {[
              "垃圾广告",
              "色情低俗",
              "人身攻击",
              "违法违规",
              "抄袭侵权",
              "其他原因",
            ].map((reason) => (
              <label key={reason} className="flex items-center gap-2 cursor-pointer text-sm text-warm hover:bg-accent-light/30 px-3 py-2 rounded-lg transition-colors">
                <input
                  type="radio"
                  name="reportReason"
                  value={reason}
                  checked={reportReason === reason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="accent-accent"
                />
                {reason}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button className="px-4 py-2 text-sm text-muted border border-rule rounded-lg bg-transparent cursor-pointer hover:bg-gray-50"
              onClick={() => setReportModal(null)}>取消</button>
            <button className="submit-btn text-sm px-4 py-2"
              onClick={submitReport}
              disabled={reportSubmitting || !reportReason}>
              {reportSubmitting ? "提交中..." : "提交举报"}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
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