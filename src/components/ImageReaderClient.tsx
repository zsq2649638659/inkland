"use client";
import SiteIcon from "@/components/SiteIcon";
import Radio from "@/components/inkland/Radio";

import { type CSSProperties, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import LikeButton from "@/components/LikeButton";
import BookmarkButton from "@/components/BookmarkButton";
import EmojiPicker from "@/components/EmojiPicker";
import DefaultAvatar from "@/components/DefaultAvatar";
import { createNotification } from "@/lib/notifications";
import { submitReportV1 } from "@/lib/reportContent";
import { MODERATION_REASON_OPTIONS } from "@shared/moderationReasons";
import { assertCanComment } from "@/lib/userRestrictions";
import type { Post, Comment } from "@/lib/types";
import { useAppDialog } from "@/components/AppDialogProvider";
import { includeTestDataForProfile } from "@/lib/test-data-visibility";
import DetailFloatingActions from "@/components/DetailFloatingActions";
import ChapterNav from "@/components/ChapterNav";
import { loadReadingHistory, saveReadingHistory } from "@/lib/readingHistory";

const READER_DEFAULT_FONT_SIZE = 16;

function getReaderLineHeightRange(fontSize: number) {
  const min = Math.max(18, Math.ceil((fontSize * 1.5) / 2) * 2);
  let max = Math.max(min + 8, Math.ceil((fontSize * 2) / 2) * 2);
  if ((max - min) % 4 !== 0) max += 2;
  const defaultValue = (min + max) / 2;

  return { min, max, defaultValue };
}

function getReaderLineHeightValue(range: ReturnType<typeof getReaderLineHeightRange>, position: number | null) {
  if (position === null) return range.defaultValue;
  return range.min + Math.round((position * (range.max - range.min)) / 2) * 2;
}

interface ImageItem {
  url: string;
  caption?: string;
}

interface AdjacentChapter {
  id: string;
  title: string;
}

interface ImageReaderClientProps {
  post: Post;
  images?: ImageItem[];
  initialAdjacent?: { previous: AdjacentChapter | null; next: AdjacentChapter | null };
}

export default function ImageReaderClient({ post, images: initialImages, initialAdjacent }: ImageReaderClientProps) {
  const supabase = createClient();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const dialog = useAppDialog();
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [lineHeightPosition, setLineHeightPosition] = useState<number | null>(null);
  const [paragraphSpacing, setParagraphSpacing] = useState<number | null>(null);
  const [readerWidth, setReaderWidth] = useState("900");
  const [fontFamily, setFontFamily] = useState("sans");
  const [showSettings, setShowSettings] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentSort, setCommentSort] = useState<"recent" | "hot">("hot");
  const [expandedReplyIds, setExpandedReplyIds] = useState<Set<string>>(new Set());
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
  const prevChapter = initialAdjacent?.previous || null;
  const nextChapter = initialAdjacent?.next || null;
  // 浮动面板状态
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentRight, setContentRight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  // 评论回复状态
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  // 评论 hover 状态
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  // Toast 提示
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Lightbox 状态
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const readingSaveTimerRef = useRef<number | null>(null);
  const readingRestoredRef = useRef(false);

  // 图片列表
  const images: ImageItem[] = initialImages || (post.images as string[] | undefined)?.map((url) => ({ url } as ImageItem)) || [];

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Lightbox 打开关闭
  const openLightbox = useCallback((src: string) => {
    setLightboxImage(src);
    document.body.style.overflow = "hidden";
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxImage(null);
    document.body.style.overflow = "";
  }, []);

  // 事件委托：鼠标悬停时查找最近的 [data-comment-id] 元素
  const handleCommentMouseOver = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-comment-id]");
    if (el) {
      const id = el.getAttribute("data-comment-id");
      if (id) setHoveredCommentId(id);
    }
  }, []);

  // 鼠标离开评论容器时重置 hover 状态
  const handleCommentMouseOut = useCallback((e: React.MouseEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setHoveredCommentId(null);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxImage) {
          closeLightbox();
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
        if (!target.closest(".floating-panel") && !target.closest(".floating-btn")) {
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
  }, [lightboxImage, showSettings, commentMenuId, activePanel]);

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
    fetchStats();
    // 读取 localStorage 中保存的主题
    try {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark") applyTheme("dark");
    } catch { /* ignore */ }
  }, [post.id, profile?.is_test_account]);

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
    const { data } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, parent_id, author:profiles!comments_user_id_fkey(nickname, avatar_url, is_test_account)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const all: Comment[] = (data as Record<string, unknown>[])
        .filter((c) => includeTestDataForProfile(profile) || !((c.author as { is_test_account?: boolean } | null)?.is_test_account))
        .map((c) => {
        const author = c.author as { nickname: string; avatar_url: string | null } | null;
        return {
          id: c.id as string,
          post_id: post.id,
          user_id: c.user_id as string,
          content: c.content as string,
          created_at: c.created_at as string,
          parent_id: c.parent_id as string | null,
          paragraph_index: null,
          author: {
            nickname: author?.nickname || "匿名用户",
            avatar_url: author?.avatar_url,
          },
        };
      });

      const ids = all.map((c) => c.id);
      const { data: statsData } = await supabase
        .from("comment_stats")
        .select("id, like_count, reply_count")
        .in("id", ids);
      const statsMap = new Map<string, { like_count: number; reply_count: number }>();
      if (statsData) {
        for (const s of statsData as Array<Record<string, unknown>>) {
          statsMap.set(s.id as string, {
            like_count: (s.like_count as number) || 0,
            reply_count: (s.reply_count as number) || 0,
          });
        }
      }
      const likedIds = new Set<string>();
      if (user && ids.length > 0) {
        const { data: likedRows } = await supabase
          .from("comment_likes")
          .select("comment_id")
          .eq("user_id", user.id)
          .in("comment_id", ids);
        for (const row of (likedRows || []) as Array<Record<string, unknown>>) likedIds.add(row.comment_id as string);
      }
      setLikedCommentIds(likedIds);
      for (const c of all) {
        const st = statsMap.get(c.id) || { like_count: 0, reply_count: 0 };
        c.like_count = st.like_count;
        c.reply_count = st.reply_count;
        c.liked_by_me = likedIds.has(c.id);
      }

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

  const toggleCommentLike = async (commentId: string) => {
    if (!user) { goToLogin(); return; }
    const liked = likedCommentIds.has(commentId);
    const result = liked
      ? await supabase.from("comment_likes").delete().eq("user_id", user.id).eq("comment_id", commentId)
      : await supabase.from("comment_likes").insert({ user_id: user.id, comment_id: commentId });
    if (result.error) return;
    setLikedCommentIds((current) => {
      const next = new Set(current);
      if (liked) next.delete(commentId); else next.add(commentId);
      return next;
    });
    const delta = liked ? -1 : 1;
    setComments((current) => current.map((comment) => comment.id === commentId ? { ...comment, like_count: Math.max(0, (comment.like_count || 0) + delta), liked_by_me: !liked } : comment));
    setReplies((current) => Object.fromEntries(Object.entries(current).map(([parentId, replyList]) => [parentId, replyList.map((reply) => reply.id === commentId ? { ...reply, like_count: Math.max(0, (reply.like_count || 0) + delta), liked_by_me: !liked } : reply)])));
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

  const readerLineHeightRange = getReaderLineHeightRange(fontSize ?? READER_DEFAULT_FONT_SIZE);
  const readerLineHeight = getReaderLineHeightValue(readerLineHeightRange, lineHeightPosition);

  const readerTextStyle: CSSProperties = {
    fontFamily: fontMap[fontFamily],
    ...(fontSize !== null ? { "--reader-font-size": `${fontSize}px` } : {}),
    ...(fontSize !== null || lineHeightPosition !== null ? { "--reader-line-height": `${readerLineHeight}px` } : {}),
    ...(paragraphSpacing !== null ? { "--reader-paragraph-spacing": `${paragraphSpacing}px` } : {}),
  } as CSSProperties;

  const themeColors: Record<string, { bg: string; text: string }> = {
    white: { bg: "#ffffff", text: "#1a1a1a" },
    warm: { bg: "#faf8f5", text: "#2c2416" },
    beige: { bg: "#f5f0e8", text: "#2c2416" },
    green: { bg: "#e8f0e8", text: "#1a2a1a" },
    blue: { bg: "#e8eef5", text: "#1a2a3a" },
    dark: { bg: "#1a1a1a", text: "#b8a090" },
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

  // 移除 Markdown 图片链接，只保留纯文本描述
  const cleanContent = content.replace(/!\[.*?\]\(.*?\)/g, "").trim();

  const saveCurrentReading = useCallback(() => {
    if (authLoading || !user) return;

    const scrollableHeight = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const progressRatio = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
    const imagesOnPage = Array.from(document.querySelectorAll<HTMLElement>("[data-image-index]"));
    const currentImage = imagesOnPage.find((element) => element.getBoundingClientRect().bottom >= 120);
    const imageIndex = currentImage ? Number(currentImage.dataset.imageIndex) : null;
    const percent = Math.round(Math.min(1, Math.max(0, progressRatio)) * 100);
    const positionLabel = imageIndex === null ? `已读${percent}%` : `第${imageIndex + 1}张 · ${percent}%`;

    void saveReadingHistory(supabase, {
      user_id: user.id,
      post_id: post.id,
      progress_ratio: Math.min(1, Math.max(0, progressRatio)),
      paragraph_index: imageIndex,
      position_label: positionLabel,
      chapter_number: post.chapter_number ?? null,
      post: {
        id: post.id,
        title: post.title ?? null,
        content: post.content ?? null,
        post_type: post.post_type ?? null,
        series_name: post.series_name ?? null,
        chapter_number: post.chapter_number ?? null,
        word_count: post.word_count ?? null,
        cover_url: post.cover_url ?? null,
        user_id: post.user_id ?? null,
        author: post.author
          ? { nickname: post.author.nickname ?? null, avatar_url: post.author.avatar_url ?? null }
          : null,
        tags: Array.isArray(post.tags)
          ? post.tags.map((tag) => typeof tag === "string" ? tag : tag.name).filter(Boolean)
          : [],
        status: post.status ?? null,
      },
    }).catch(() => {
      // 本地记录已经保存；数据库不可用时不打断阅读。
    });
  }, [authLoading, post, supabase, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    readingRestoredRef.current = false;

    const restoreReadingPosition = async () => {
      const { records } = await loadReadingHistory(supabase, user.id);
      if (!active) return;
      const currentRecord = records.find((record) => record.post_id === post.id);
      if (!currentRecord) {
        readingRestoredRef.current = true;
        saveCurrentReading();
        return;
      }

      window.requestAnimationFrame(() => {
        if (!active) return;
        if (currentRecord.paragraph_index !== null && currentRecord.paragraph_index !== undefined) {
          const image = document.querySelector<HTMLElement>(`[data-image-index="${currentRecord.paragraph_index}"]`);
          image?.scrollIntoView({ block: "center" });
        } else if (currentRecord.progress_ratio > 0) {
          const scrollableHeight = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo({ top: scrollableHeight * currentRecord.progress_ratio, behavior: "auto" });
        }
        readingRestoredRef.current = true;
      });
    };

    const handleScroll = () => {
      if (readingSaveTimerRef.current !== null) window.clearTimeout(readingSaveTimerRef.current);
      readingSaveTimerRef.current = window.setTimeout(() => {
        readingSaveTimerRef.current = null;
        if (readingRestoredRef.current) saveCurrentReading();
      }, 900);
    };

    void restoreReadingPosition();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      active = false;
      window.removeEventListener("scroll", handleScroll);
      if (readingSaveTimerRef.current !== null) window.clearTimeout(readingSaveTimerRef.current);
      readingSaveTimerRef.current = null;
      saveCurrentReading();
    };
  }, [authLoading, post.id, saveCurrentReading, supabase, user]);

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
    if (authLoading) return;
    router.push("/login");
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
    const reason = reportReason.trim();
    const details = reportReason === "其他违规" ? reportCustomReason.trim() : undefined;
    if (!reportModal || !reason || (reportReason === "其他违规" && !details)) return;
    setReportSubmitting(true);
    const result = await submitReportV1(supabase, { targetType: reportModal.targetType, targetId: reportModal.targetId, reason, details });
    setReportSubmitting(false);
    if (!result.ok) { showToast(result.message); return; }
    setReportModal(null);
    showToast(result.message);
  };

  const handleBlockUser = async (blockedUserId: string) => {
    if (!user) { goToLogin(); return; }
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
      <DetailFloatingActions
        contentRight={contentRight}
        hasChapterNav={Boolean(post.series_name)}
        darkMode={darkMode}
        onToggleTheme={() => {
          if (darkMode) applyTheme("warm");
          else applyTheme("dark");
        }}
        onOpenPanel={togglePanel}
        onReport={handlePostReport}
      />

      {/* Content Wrapper - 居中显示 */}
      <div
        ref={contentRef}
        className={`content-wrapper image-reader-page detail-reader-page${post.series_name ? " has-chapter-nav" : ""}`}
        style={{
          maxWidth: readerWidth === "auto" ? "var(--content-width, 900px)" : `${readerWidth}px`,
          color: darkMode ? "#b8a090" : themeColors[currentTheme].text,
        }}
      >
        {/* Title */}
        <h1 className="work-title">{post.title}</h1>

        {/* Tags Row (below title & above author) */}
        {tagNames.length > 0 && (
          <div className="tags-row">
            {tagNames.map((tag) => (
              <Link key={tag} href={`/tag/${tag}`} className="tag tag--site site-card__tag">
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
            {post.image_count && post.image_count > 0 ? (
              <span className="meta-item">
                <SiteIcon name="fa-image" variant="outline" />
                <span className="meta-value">{post.image_count}张</span>
              </span>
            ) : images.length > 0 ? (
              <span className="meta-item">
                <SiteIcon name="fa-image" variant="outline" />
                <span className="meta-value">{images.length}张</span>
              </span>
            ) : null}
            <span className="meta-item">
              <SiteIcon name="fa-calendar" variant="outline" />
              <span className="meta-value">{createdAt}</span>
            </span>
          </div>
        </div>

        {/* 正文描述 */}
        {cleanContent && (
          <div
            className="work-content"
            style={{ ...readerTextStyle, wordBreak: "break-word" }}
          >
            <p>{cleanContent}</p>
          </div>
        )}

        {/* 图片列表 */}
        {images.length > 0 && (
            <div className="work-content">
            {images.map((img, idx) => (
              <div key={idx} className="image-container" data-image-index={idx}>
                <img
                  src={img.url}
                  alt={`图片 ${idx + 1}`}
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.replaceWith(Object.assign(document.createElement("span"), {
                      className: "image-load-error",
                      textContent: "图片加载失败",
                    }));
                  }}
                  onClick={() => openLightbox(img.url)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Chapter Navigation (合集作品) */}
        {post.series_name && (
          <ChapterNav
            postType={post.post_type}
            seriesName={post.series_name}
            previous={prevChapter}
            next={nextChapter}
          />
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
            <SiteIcon name="fa-comment" variant="outline" hoverVariant="solid" />
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
            <SiteIcon name="fa-share-from-square" variant="outline" hoverVariant="solid" />
            <span>分享</span>
          </button>
        </div>

        {/* 评论区 */}
        <div id="comments" className="comments-section" onMouseOver={handleCommentMouseOver} onMouseOut={handleCommentMouseOut}>
          {authLoading ? (
            <div style={{ marginBottom: 32, padding: 24, textAlign: "center", borderRadius: 12, background: "var(--color-bg-secondary, #E8E4E0)" }} role="status" aria-busy="true">
              <p style={{ fontSize: 14, color: "var(--color-text-muted, #6B6B6B)" }}>
                <SiteIcon name="fa-message" variant="outline" style={{ marginRight: 6 }} />
                正在确认登录状态…
              </p>
            </div>
          ) : user ? (
            <div className="comment-input-area">
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
                    发布
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 32, padding: 24, textAlign: "center", borderRadius: 12, background: "var(--color-bg-secondary, #E8E4E0)" }}>
              <p style={{ fontSize: 14, color: "var(--color-text-muted, #6B6B6B)", marginBottom: 12 }}>
                <SiteIcon name="fa-message" variant="outline" style={{ marginRight: 6 }} />
                登录后参与评论
              </p>
              <Link href="/login" className="btn-submit" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                登录
              </Link>
            </div>
          )}

          {/* 评论列表 */}
          <div className="inline-comment-list-head">
            <span className="inline-comment-list-title">全部评论</span>
            <div className="inline-comment-sort" role="group" aria-label="评论排序">
              <button type="button" className={commentSort === "recent" ? "active" : ""} onClick={() => setCommentSort("recent")}>最新</button>
              <button type="button" className={commentSort === "hot" ? "active" : ""} onClick={() => setCommentSort("hot")}>最热</button>
            </div>
          </div>
          {comments.length === 0 ? (
            <div className="para-comment-panel-empty" style={{ padding: "60px 0" }}>
              <p>还没有人发表评论</p>
              <p>来做第一个评论的人吧</p>
            </div>
          ) : (
            [...comments].sort((a, b) => {
              if (commentSort === "recent") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              const aScore = (a.like_count || 0) + (a.reply_count || 0);
              const bScore = (b.like_count || 0) + (b.reply_count || 0);
              return bScore - aScore || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }).map((c) => (
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
                        className={`comment-action-btn${likedCommentIds.has(c.id) ? " liked" : ""}`}
                        onClick={() => void toggleCommentLike(c.id)}
                      >
                        <SiteIcon name="fa-heart" variant={likedCommentIds.has(c.id) ? "solid" : "outline"} hoverVariant={likedCommentIds.has(c.id) ? undefined : "solid"} />
                        <span>{c.like_count || 0}</span>
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
                          <SiteIcon name="fa-comment" variant="outline" hoverVariant="solid" />
                          <span>{c.reply_count || replies[c.id]?.length || 0}</span>
                        </button>
                      )}
                      {user && c.user_id === user.id && (
                        <button
                          className="comment-action-btn-delete"
                          onClick={() => handleDeleteComment(c.id)}
                        >
                          <SiteIcon name="fa-action-delete" variant="outline" hoverVariant="solid" size={13} />
                        </button>
                      )}
                      <button
                        className="comment-more-btn"
                        title="更多"
                        onClick={() => setCommentMenuId(commentMenuId === c.id ? null : c.id)}
                      >
                        <SiteIcon name="fa-ellipsis-vertical" variant="solid" />
                      </button>
                      {commentMenuId === c.id && (
                        <div className="comment-popup show">
                          <button
                            className="comment-popup-item"
                            onClick={() => { setCommentMenuId(null); handleReport(c.id, c.user_id); }}
                          >
                          <SiteIcon name="fa-flag" variant="outline" hoverVariant="solid" />
                            举报
                          </button>
                          <button
                            className="comment-popup-item"
                            onClick={() => { setCommentMenuId(null); handleBlockUser(c.user_id); }}
                          >
                            <SiteIcon name="fa-action-forbid" variant="outline" hoverVariant="solid" />
                            屏蔽
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 回复列表 */}
                    {replies[c.id] && replies[c.id].length > 0 && (
                      <div className="nested-replies">
                        {(expandedReplyIds.has(c.id) ? replies[c.id] : replies[c.id].slice(0, 3)).map((reply) => (
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
                                  className={`comment-action-btn${likedCommentIds.has(reply.id) ? " liked" : ""}`}
                                  onClick={() => void toggleCommentLike(reply.id)}
                                >
                                  <SiteIcon name="fa-heart" variant={likedCommentIds.has(reply.id) ? "solid" : "outline"} hoverVariant={likedCommentIds.has(reply.id) ? undefined : "solid"} />
                                  <span>{reply.like_count || 0}</span>
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
                                    <SiteIcon name="fa-comment" variant="outline" hoverVariant="solid" />
                                    <span>{reply.reply_count || 0}</span>
                                  </button>
                                )}
                                {user && reply.user_id === user.id && (
                                  <button
                                    className="comment-action-btn-delete"
                                    onClick={() => handleDeleteComment(reply.id)}
                                  >
                                    <SiteIcon name="fa-action-delete" variant="outline" hoverVariant="solid" size={13} />
                                  </button>
                                )}
                                <button
                                  className="comment-more-btn"
                                  style={{ marginLeft: "auto" }}
                                  title="更多"
                                  onClick={() => setCommentMenuId(commentMenuId === reply.id ? null : reply.id)}
                                >
                                  <SiteIcon name="fa-ellipsis-vertical" variant="solid" />
                                </button>
                                {commentMenuId === reply.id && (
                                  <div className="comment-popup show">
                                    <button
                                      className="comment-popup-item"
                                      onClick={() => { setCommentMenuId(null); handleReport(reply.id, reply.user_id); }}
                                    >
                                  <SiteIcon name="fa-flag" variant="outline" hoverVariant="solid" />
                                      举报
                                    </button>
                                    <button
                                      className="comment-popup-item"
                                      onClick={() => { setCommentMenuId(null); handleBlockUser(reply.user_id); }}
                                    >
                                      <SiteIcon name="fa-action-forbid" variant="outline" hoverVariant="solid" />
                                      屏蔽
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {replies[c.id].length > 3 && (
                          <button
                            type="button"
                            className="nested-comment-expand"
                            onClick={() =>
                              setExpandedReplyIds((current) => {
                                const next = new Set(current);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              })
                            }
                          >
                            {expandedReplyIds.has(c.id) ? (
                              <>收起回复 <SiteIcon name="fa-chevron-up" variant="solid" /></>
                            ) : (
                              <>展开全部{replies[c.id].length}条回复 <SiteIcon name="fa-chevron-down" variant="solid" /></>
                            )}
                          </button>
                        )}
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
                            发布
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
        className={`floating-panel ${activePanel ? "active" : ""}`}
        style={{ right: `${viewportWidth - contentRight - 36}px`, left: "auto" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setActivePanel(null);
        }}
      >
        {/* Font Panel */}
        <div className={`panel-content ${activePanel === "font" ? "active" : ""}`} id="panelFont" onClick={(e) => e.stopPropagation()}>
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
                value={fontSize ?? 16}
                step="2"
                onChange={(e) => setFontSize(parseInt(e.target.value))}
              />
              <span className="font-size-label font-size-label-large">A</span>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-title">行高</div>
            <div className="font-size-slider-row reader-setting-slider-row">
              <SiteIcon name="fa-detail-line-height" className="reader-setting-slider-icon reader-setting-slider-icon-small" size={16} />
              <input
                type="range"
                className="font-size-slider"
                min={readerLineHeightRange.min}
                max={readerLineHeightRange.max}
                step="2"
                value={readerLineHeight}
                aria-label="行高"
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  setLineHeightPosition((value - readerLineHeightRange.min) / (readerLineHeightRange.max - readerLineHeightRange.min));
                }}
              />
              <SiteIcon name="fa-detail-line-height" className="reader-setting-slider-icon" size={20} />
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-title">段间距</div>
            <div className="font-size-slider-row reader-setting-slider-row">
              <SiteIcon name="fa-detail-paragraph-spacing" className="reader-setting-slider-icon reader-setting-slider-icon-small" size={16} />
              <input
                type="range"
                className="font-size-slider"
                min="0"
                max="32"
                step="2"
                value={paragraphSpacing ?? 12}
                aria-label="段间距"
                onChange={(e) => setParagraphSpacing(parseInt(e.target.value, 10))}
              />
              <SiteIcon name="fa-detail-paragraph-spacing" className="reader-setting-slider-icon" size={20} />
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
                <Radio
                  name="reader-font"
                  value={f.key}
                  variant="card"
                  key={f.key}
                  className={`font-option ${fontFamily === f.key ? "active" : ""}`}
                  checked={fontFamily === f.key}
                  onChange={() => setFontFamily(f.key)}
                >
                  {f.label}
                </Radio>
              ))}
            </div>
          </div>
        </div>

        {/* Width Panel */}
        <div className={`panel-content ${activePanel === "width" ? "active" : ""}`} id="panelWidth" onClick={(e) => e.stopPropagation()}>
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

      {/* 举报弹窗 */}
      <div className={`modal-overlay moderation-modal-overlay detail-reader-modal-overlay${reportModal?.open ? " active" : ""}`} onClick={() => setReportModal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">举报原因</div>
          <div className="modal-body">
            <ul className="report-reason-list" role="radiogroup" aria-label="举报原因">
              {MODERATION_REASON_OPTIONS.map((reason) => (
                <li
                  key={reason}
                  className={`report-reason-item${reportReason === reason ? " selected" : ""}`}
                  data-reason={reason}
                >
                  <Radio name="reader-report-reason" value={reason} variant="control" className="report-reason-control" checked={reportReason === reason} onChange={() => setReportReason(reason)}>
                    {reason}
                  </Radio>
                </li>
              ))}
            </ul>
            {reportReason === "其他违规" && (
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
              disabled={reportSubmitting || !reportReason || (reportReason === "其他违规" && !reportCustomReason.trim())}
            >
              {reportSubmitting ? "提交中..." : "提交举报"}
            </button>
          </div>
        </div>
      </div>

      {/* 屏蔽确认弹窗 */}
      <div className={`modal-overlay${blockModal?.open ? " active" : ""}`} onClick={() => setBlockModal(null)}>
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
      <div className={`toast${toastMessage ? " show" : ""}`}>{toastMessage || ""}</div>

      {/* Lightbox 图片查看器 */}
      {lightboxImage && (
        <div className="lightbox-overlay active" onClick={closeLightbox}>
          <button className="lightbox-close" onClick={closeLightbox}>
            <SiteIcon name="fa-xmark" variant="solid" />
          </button>
          <img
            className="lightbox-img"
            src={lightboxImage}
            alt="大图查看"
            decoding="async"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
