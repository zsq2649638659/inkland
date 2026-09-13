"use client";

import { useEffect, useRef, useState } from "react";
import SiteIcon from "@/components/SiteIcon";

interface DetailFloatingActionsProps {
  contentRight: number;
  hasChapterNav: boolean;
  darkMode: boolean;
  onToggleTheme: () => void;
  onOpenPanel: (panel: "font" | "width") => void;
  onReport: () => void;
}

export default function DetailFloatingActions({
  contentRight,
  hasChapterNav,
  darkMode,
  onToggleTheme,
  onOpenPanel,
  onReport,
}: DetailFloatingActionsProps) {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!mobileMoreRef.current?.contains(event.target as Node)) setMobileMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const openPanel = (panel: "font" | "width") => {
    setMobileMoreOpen(false);
    onOpenPanel(panel);
  };
  const report = () => {
    setMobileMoreOpen(false);
    onReport();
  };
  const toggleTheme = () => {
    setMobileMoreOpen(false);
    onToggleTheme();
  };

  return (
    <>
      <div className="floating-sidebar detail-floating-sidebar" style={{ left: `${contentRight + 48}px`, right: "auto" }}>
        <button className="floating-btn" title={darkMode ? "切换日间模式" : "切换夜间模式"} onClick={toggleTheme}>
          <SiteIcon name="fa-detail-night-mode" size={22} />
        </button>
        <button className="floating-btn" title="字体设置" onClick={() => openPanel("font")}>
          <SiteIcon name="fa-detail-font-adjust" size={22} />
        </button>
        <button className="floating-btn" title="页面宽度" onClick={() => openPanel("width")}>
          <SiteIcon name="fa-detail-page-width" size={22} />
        </button>
        <button className="floating-btn" title="举报作品" onClick={report}>
          <SiteIcon name="fa-detail-report" size={22} />
        </button>
        <button
          className={`floating-btn floating-backtop${showBackToTop ? " show" : ""}`}
          title="回到顶部"
          aria-label="回到顶部"
          onClick={scrollToTop}
        >
          <SiteIcon name="fa-detail-back-to-top" size={22} />
        </button>
      </div>

      <div className={`detail-mobile-floating-actions${hasChapterNav ? " has-chapter-nav" : ""}`}>
        <div className="detail-mobile-more" ref={mobileMoreRef}>
          {mobileMoreOpen && (
            <div className="detail-mobile-more-menu" role="menu" aria-label="更多详情页操作">
              <button className="floating-btn" title={darkMode ? "切换日间模式" : "切换夜间模式"} onClick={toggleTheme}>
                <SiteIcon name="fa-detail-night-mode" size={22} />
              </button>
              <button className="floating-btn" title="字体调整" onClick={() => openPanel("font")}>
                <SiteIcon name="fa-detail-font-adjust" size={22} />
              </button>
              <button className="floating-btn" title="举报作品" onClick={report}>
                <SiteIcon name="fa-detail-report" size={22} />
              </button>
            </div>
          )}
          <button
            className="floating-btn detail-mobile-more-button"
            title="更多"
            aria-label="更多"
            aria-expanded={mobileMoreOpen}
            onClick={() => setMobileMoreOpen((open) => !open)}
          >
            <SiteIcon name="fa-detail-more" size={22} />
          </button>
        </div>
        <button
          className={`floating-btn detail-mobile-backtop${showBackToTop ? " show" : ""}`}
          title="回到顶部"
          aria-label="回到顶部"
          onClick={scrollToTop}
        >
          <SiteIcon name="fa-detail-back-to-top" size={22} />
        </button>
      </div>
    </>
  );
}
