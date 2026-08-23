"use client";

import type { CSSProperties } from "react";

/**
 * 通用辉光占位块（.sk-block 由 globals.css 提供 shimmer 动画）。
 * 所有骨架屏都复用真实组件/页面的设计系统容器类（.card、.tag-card、
 * .profile-section、.user-card、.notification-item 等），仅把内容替换为
 * SB 占位块，从而保证骨架屏与加载完成后的真实组件在位置、尺寸、内容结构上完全一致。
 */
function SB({ className = "", style }: { className?: string; style: CSSProperties }) {
  return <span className={`sk-block ${className}`} style={{ display: "block", ...style }} aria-hidden="true" />;
}

/* ================= 首页 / 信息流卡片 ================= */

/** 信息流卡片骨架 —— 精确匹配 PostCard / SerialPostCard 的 .card 结构 */
function SkeletonFeedCard({ withImage = false }: { withImage?: boolean }) {
  return (
    <article className="card" aria-hidden="true">
      {/* card-header：头像 + 作者信息 + 关注按钮/更多 */}
      <div className="card-header">
        <div className="card-avatar">
          <span className="sk-circle" style={{ width: "100%", height: "100%" }} />
        </div>
        <div className="card-author-info">
          <SB style={{ width: 96, height: 14 }} />
          <SB style={{ width: 52, height: 12, marginTop: 6 }} />
        </div>
        <div className="card-header-actions">
          <span className="sk-pill" style={{ width: 72, height: 26, flexShrink: 0 }} />
          <span className="sk-circle" style={{ width: 32, height: 32, flexShrink: 0 }} />
        </div>
      </div>
      {/* card-title */}
      <SB style={{ width: "62%", height: 22, marginBottom: 14 }} />
      {/* card-excerpt（3 行） */}
      <SB style={{ width: "100%", height: 15 }} />
      <SB style={{ width: "88%", height: 15, marginTop: 8 }} />
      <SB style={{ width: "70%", height: 15, marginTop: 8 }} />
      {/* 图片带（部分卡片有图） */}
      {withImage && (
        <div className="card-image-strip">
          <div className="sk-img" style={{ width: "100%", height: 220 }} />
        </div>
      )}
      {/* card-tags */}
      <div className="card-tags" style={{ marginBottom: 14, marginTop: 14 }}>
        <span className="sk-pill" style={{ width: 56, height: 24, flexShrink: 0 }} />
        <span className="sk-pill" style={{ width: 64, height: 24, flexShrink: 0 }} />
        <span className="sk-pill" style={{ width: 48, height: 24, flexShrink: 0 }} />
      </div>
      {/* card-actions：喜欢 / 评论 / 收藏 / 分享 */}
      <div className="card-actions">
        {[0, 1, 2, 3].map((n) => (
          <SB key={n} style={{ width: 44, height: 16 }} />
        ))}
      </div>
    </article>
  );
}

/** 下方标签栏骨架（首页 tab bar 下方的占位） */
export function SkeletonFeed() {
  return (
    <div className="feed-skeleton" role="status" aria-label="内容加载中，请稍候" aria-busy="true">
      <SkeletonFeedCard withImage />
      <SkeletonFeedCard />
      <SkeletonFeedCard withImage />
      <SkeletonFeedCard />
    </div>
  );
}

/** 首页首屏（鉴权尚未完成）骨架 */
export function SkeletonHome() {
  return (
    <div className="feed-skeleton" role="status" aria-label="首页加载中，请稍候" aria-busy="true">
      <SkeletonFeedCard withImage />
      <SkeletonFeedCard />
      <SkeletonFeedCard withImage />
      <SkeletonFeedCard />
      <SkeletonFeedCard />
    </div>
  );
}

/* ================= 网格卡片（profile / tag / collection 共用） ================= */

/** 文字单篇 tag-card 骨架 */
function SkeletonTextCard() {
  return (
    <div className="tag-card" aria-hidden="true">
      <SB style={{ width: "84%", height: 24 }} />
      <SB style={{ width: "100%", height: 15, marginTop: 12 }} />
      <SB style={{ width: "92%", height: 15, marginTop: 8 }} />
      <div className="card-tags" style={{ marginTop: 12 }}>
        <span className="sk-pill" style={{ width: 48, height: 22, flexShrink: 0 }} />
        <span className="sk-pill" style={{ width: 56, height: 22, flexShrink: 0 }} />
      </div>
      <div className="card-footer">
        <div className="card-stats">
          {[0, 1, 2].map((n) => (
            <SB key={n} style={{ width: 40, height: 14 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 图片 tag-card 骨架（含 1:1 图片舞台） */
function SkeletonTagCard() {
  return (
    <div className="tag-card" aria-hidden="true">
      <div className="card-image-stage">
        <span className="sk-img" style={{ width: "100%", height: "100%" }} />
      </div>
      <SB style={{ width: "80%", height: 22, marginTop: 12 }} />
      <SB style={{ width: "100%", height: 14, marginTop: 10 }} />
      <div className="card-footer">
        <div className="card-stats">
          {[0, 1, 2].map((n) => (
            <SB key={n} style={{ width: 40, height: 14 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 长篇连载 tag-card 骨架（约等于系列卡片：标题 + 简介 + 章节预览 + 统计） */
function SkeletonSeriesCard() {
  return (
    <div className="tag-card series" aria-hidden="true">
      <span className="sk-pill" style={{ width: 56, height: 22, flexShrink: 0 }} />
      <SB style={{ width: "78%", height: 18, marginTop: 12 }} />
      <SB style={{ width: "100%", height: 14, marginTop: 8 }} />
      <SB style={{ width: "60%", height: 14, marginTop: 6 }} />
      <div className="chapter-preview">
        <SB style={{ width: 60, height: 11 }} />
        <SB style={{ width: "70%", height: 15, marginTop: 8 }} />
        <SB style={{ width: "90%", height: 13, marginTop: 6 }} />
      </div>
      <div className="card-footer">
        <div className="card-stats">
          {[0, 1, 2].map((n) => (
            <SB key={n} style={{ width: 40, height: 14 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 作品网格骨架 —— 匹配 profile 作品/喜欢/收藏、tag、collection 的卡片网格 */
export function SkeletonWorksGrid({
  count = 6,
  containerClass = "card-grid",
}: {
  count?: number;
  containerClass?: string;
}) {
  return (
    <div className={containerClass} role="status" aria-label="作品加载中，请稍候" aria-busy="true">
      {Array.from({ length: count }).map((_, i) =>
        i % 3 === 0 ? <SkeletonSeriesCard key={i} /> : i % 3 === 1 ? <SkeletonTagCard key={i} /> : <SkeletonTextCard key={i} />,
      )}
    </div>
  );
}

/* ================= 个人页 ================= */

/** 个人主页整体骨架 —— authLoading 时使用（标签 + 网格） */
export function SkeletonProfile() {
  return (
    <div role="status" aria-label="个人主页加载中，请稍候" aria-busy="true">
      <div className="segmented-tabs" style={{ margin: "16px 0" }}>
        <div className="segmented-tabs-left">
          <span className="sk-pill" style={{ width: 64, height: 34, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 64, height: 34, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 64, height: 34, flexShrink: 0 }} />
        </div>
        <div className="segmented-tabs-right">
          <span className="sk-pill" style={{ width: 64, height: 34, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 64, height: 34, flexShrink: 0 }} />
        </div>
      </div>
      <SkeletonWorksGrid count={6} />
    </div>
  );
}

/** 关注/粉丝列表骨架 —— 复用 .user-card 布局 */
export function SkeletonUserCardList() {
  return (
    <div className="user-cards-grid" role="status" aria-label="加载中" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="user-card" key={i} aria-hidden="true">
          <span className="sk-circle" style={{ width: 56, height: 56, flexShrink: 0 }} />
          <div className="user-info">
            <SB style={{ width: 110, height: 16 }} />
            <SB style={{ width: "70%", height: 13, marginTop: 6 }} />
          </div>
          <div className="user-actions">
            <span className="sk-pill" style={{ width: 84, height: 30, flexShrink: 0 }} />
            <span className="sk-circle" style={{ width: 24, height: 24, flexShrink: 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= 通知页 ================= */

/** 通知列表骨架 —— 复用 .notification-item 结构 */
export function SkeletonNotification() {
  return (
    <div className="notification-list" role="status" aria-label="消息加载中，请稍候" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="notification-item" key={i} aria-hidden="true">
          <div className="icon-wrapper">
            <span className="sk-circle" style={{ width: "100%", height: "100%" }} />
          </div>
          <div className="notification-content">
            <div className="notification-title-row">
              <SB style={{ width: "42%", height: 16 }} />
              <SB style={{ width: 40, height: 12, flexShrink: 0 }} />
            </div>
            <SB style={{ width: "72%", height: 13, marginTop: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= 标签详情页 ================= */

/** 标签详情页资料区骨架 —— 匹配 tag 页 profile-section（hashtag 头像 + 3 项统计） */
export function SkeletonTagProfile() {
  return (
    <section className="profile-section profile-section-skeleton" aria-label="标签资料加载中" aria-busy="true">
      <div className="profile-avatar">
        <span className="sk-circle" style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="profile-info">
        <SB style={{ width: 140, height: 26 }} />
        <SB style={{ width: "62%", height: 15, marginTop: 10 }} />
        <div className="profile-stats" style={{ marginTop: 16 }}>
          {[0, 1, 2].map((n) => (
            <div className="profile-stat" key={n} style={{ gap: 6 }}>
              <SB style={{ width: 44, height: 15 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="profile-actions">
        <span className="sk-pill" style={{ width: 96, height: 38, display: "inline-block" }} />
        <span className="sk-pill" style={{ width: 76, height: 38, display: "inline-block", marginLeft: 10 }} />
      </div>
    </section>
  );
}

/** 标签详情页骨架 —— 资料区 + 标签切换 + 类型筛选 + 网格 */
export function SkeletonTagPage() {
  return (
    <div role="status" aria-label="标签页加载中，请稍候" aria-busy="true">
      <SkeletonTagProfile />
      <div className="segmented-tabs" style={{ margin: "16px 0" }}>
        <div className="segmented-tabs-left">
          <span className="sk-pill" style={{ width: 64, height: 34, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 64, height: 34, flexShrink: 0 }} />
        </div>
        <div className="segmented-tabs-right">
          <span className="sk-pill" style={{ width: 52, height: 34, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 52, height: 34, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 52, height: 34, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 52, height: 34, flexShrink: 0 }} />
        </div>
      </div>
      <div className="type-filters-row">
        <div className="type-filters">
          <span className="sk-pill" style={{ width: 56, height: 30, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 56, height: 30, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 56, height: 30, flexShrink: 0 }} />
          <span className="sk-pill" style={{ width: 72, height: 30, flexShrink: 0 }} />
        </div>
      </div>
      <SkeletonWorksGrid count={6} />
    </div>
  );
}

/* ================= 系列详情页 ================= */

/** 系列详情页骨架 —— hero 卡片 + 章节网格 */
export function SkeletonSeriesDetail() {
  return (
    <div className="min-h-screen bg-paper" aria-label="连载详情加载中" aria-busy="true">
      <div className="page-wrapper">
        <div className="content-container">
          <div className="hero-card">
            <div className="hero-title-row">
              <div className="hero-title-left">
                <SB style={{ width: 180, height: 28 }} />
                <span className="sk-pill" style={{ width: 52, height: 22, flexShrink: 0 }} />
              </div>
              <div className="hero-actions">
                <span className="sk-pill" style={{ width: 96, height: 34, flexShrink: 0 }} />
                <span className="sk-pill" style={{ width: 96, height: 34, flexShrink: 0 }} />
              </div>
            </div>
            <div className="hero-meta-row">
              <span className="sk-circle" style={{ width: 20, height: 20, flexShrink: 0 }} />
              <SB style={{ width: 64, height: 14 }} />
              <span className="meta-sep">|</span>
              <SB style={{ width: 48, height: 14 }} />
            </div>
            <div className="hero-stats-row">
              <SB style={{ width: 76, height: 16 }} />
              <span className="stat-sep">|</span>
              <SB style={{ width: 76, height: 16 }} />
            </div>
            <SB style={{ width: "100%", height: 14, marginTop: 8 }} />
            <SB style={{ width: "88%", height: 14, marginTop: 8 }} />
            <div className="tags-row" style={{ marginTop: 16 }}>
              <span className="sk-pill" style={{ width: 56, height: 26, flexShrink: 0 }} />
              <span className="sk-pill" style={{ width: 60, height: 26, flexShrink: 0 }} />
              <span className="sk-pill" style={{ width: 48, height: 26, flexShrink: 0 }} />
            </div>
          </div>
          <div className="chapter-section">
            <div className="chapter-section-header">
              <div>
                <SB style={{ width: 64, height: 18 }} />
              </div>
            </div>
            <div className="chapter-grid-wrapper">
              <div className="chapter-grid">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div className="chapter-grid-item" key={i} aria-hidden="true">
                    <span className="sk-block" style={{ width: "72%", height: 14, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= 合集详情页 ================= */

/** 合集详情页骨架 —— hero + 筛选 + 网格 */
export function SkeletonCollectionDetail() {
  return (
    <div className="collection-page-wrapper" aria-label="合集加载中" aria-busy="true">
      <div className="collection-content-container">
        <section className="collection-hero">
          <div className="collection-hero-title-row">
            <div className="collection-title-block">
              <SB style={{ width: 200, height: 30 }} />
            </div>
            <div className="collection-hero-actions">
              <span className="sk-pill" style={{ width: 104, height: 32, flexShrink: 0 }} />
              <span className="sk-pill" style={{ width: 80, height: 32, flexShrink: 0 }} />
            </div>
          </div>
          <div className="collection-description" style={{ marginTop: 12 }}>
            <SB style={{ width: "60%", height: 15 }} />
          </div>
          <div className="collection-meta-row" style={{ marginTop: 16 }}>
            <span className="sk-circle" style={{ width: 22, height: 22, flexShrink: 0 }} />
            <SB style={{ width: 84, height: 14 }} />
            <span className="collection-meta-sep">|</span>
            <SB style={{ width: 60, height: 14 }} />
            <span className="collection-meta-sep">|</span>
            <SB style={{ width: 60, height: 14 }} />
          </div>
        </section>
        <div className="collection-works-head">
          <SB style={{ width: 80, height: 18 }} />
          <div className="collection-filters" style={{ display: "flex", gap: 8 }}>
            <span className="sk-pill" style={{ width: 56, height: 30, flexShrink: 0 }} />
            <span className="sk-pill" style={{ width: 56, height: 30, flexShrink: 0 }} />
            <span className="sk-pill" style={{ width: 56, height: 30, flexShrink: 0 }} />
          </div>
        </div>
        <SkeletonWorksGrid count={6} containerClass="collection-card-grid" />
      </div>
    </div>
  );
}

/* ================= 创作中心 ================= */

/** 创作中心骨架 —— 标题 + 统计卡 + 工具栏 + 作品网格 */
export function SkeletonStudio() {
  return (
    <div role="status" aria-label="创作中心加载中，请稍候" aria-busy="true">
      <div className="page-header">
        <div className="page-title">
          <SB style={{ width: 144, height: 28 }} />
        </div>
        <div className="page-subtitle">
          <SB style={{ width: 300, height: 14 }} />
        </div>
      </div>
      <div className="stats-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="stat-card" key={i} aria-hidden="true">
            <span className="sk-block" style={{ width: 36, height: 36, borderRadius: 10, display: "inline-block" }} />
            <SB style={{ width: 48, height: 28, marginTop: 10 }} />
            <SB style={{ width: 56, height: 13, marginTop: 6 }} />
          </div>
        ))}
      </div>
      <div className="toolbar toolbar-pc">
        <div className="toolbar-pc-normal">
          <div className="segmented-tabs">
            <div className="segmented-tabs-left">
              <span className="sk-pill" style={{ width: 72, height: 34, flexShrink: 0 }} />
              <span className="sk-pill" style={{ width: 72, height: 34, flexShrink: 0 }} />
            </div>
            <div className="segmented-tabs-right">
              <span className="sk-pill" style={{ width: 72, height: 34, flexShrink: 0 }} />
              <span className="sk-pill" style={{ width: 72, height: 34, flexShrink: 0 }} />
            </div>
          </div>
          <div className="studio-toolbar-row2" style={{ marginTop: 10 }}>
            <div className="search-wrap">
              <span className="sk-pill" style={{ width: 260, height: 36, display: "inline-block" }} />
            </div>
          </div>
        </div>
      </div>
      <div className="works-card-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="work-card" key={i} aria-hidden="true">
            <div className="card-body">
              <div className="card-meta">
                <SB style={{ width: 64, height: 14 }} />
                <SB style={{ width: 48, height: 14 }} />
              </div>
              <SB style={{ width: "78%", height: 20, marginTop: 6 }} />
              <SB style={{ width: "100%", height: 13, marginTop: 12 }} />
              <SB style={{ width: "88%", height: 13, marginTop: 8 }} />
              <div className="studio-card-tags" style={{ marginTop: 12 }}>
                <span className="sk-pill" style={{ width: 44, height: 24, flexShrink: 0 }} />
                <span className="sk-pill" style={{ width: 44, height: 24, flexShrink: 0 }} />
              </div>
              <div className="card-actions" style={{ marginTop: "auto", paddingTop: 12 }}>
                <span className="sk-pill" style={{ width: 64, height: 30 }} />
                <span className="sk-pill" style={{ width: 64, height: 30 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= 搜索页 ================= */

/** 搜索结果骨架 —— 仅渲染当前生效的筛选分区 */
export function SkeletonSearchResults({ variant = "tags" }: { variant?: "tags" | "users" | "works" | "posts" }) {
  return (
    <div className="results-area" role="status" aria-label="搜索加载中，请稍候" aria-busy="true">
      <div className="result-section">
        {variant === "tags" && (
          <div className="tags-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="tag-card" key={i} aria-hidden="true">
                <span className="sk-circle" style={{ width: 22, height: 22 }} />
                <SB style={{ width: 56, height: 16, marginTop: 14 }} />
                <SB style={{ width: 40, height: 13, marginTop: 8 }} />
              </div>
            ))}
          </div>
        )}
        {variant === "users" && (
          <div className="user-cards-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="user-card" key={i} aria-hidden="true">
                <span className="sk-circle" style={{ width: 48, height: 48, flexShrink: 0 }} />
                <div className="user-info">
                  <SB style={{ width: 96, height: 15 }} />
                </div>
                <div className="user-actions">
                  <span className="sk-pill" style={{ width: 88, height: 32, flexShrink: 0 }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {variant === "works" && (
          <div className="work-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="work-item" key={i} aria-hidden="true">
                <span className="sk-block" style={{ width: 36, height: 40, borderRadius: 8, flexShrink: 0 }} />
                <div className="work-info">
                  <SB style={{ width: "58%", height: 18 }} />
                  <div className="work-meta" style={{ marginTop: 8 }}>
                    <SB style={{ width: 44, height: 14 }} />
                    <span className="meta-dot" />
                    <SB style={{ width: 52, height: 14 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {variant === "posts" && (
          <div className="post-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="post-item" key={i} aria-hidden="true">
                <span className="sk-circle" style={{ width: 36, height: 36, flexShrink: 0 }} />
                <div className="post-item-content">
                  <SB style={{ width: "92%", height: 14 }} />
                  <SB style={{ width: "68%", height: 14, marginTop: 8 }} />
                  <SB style={{ width: "40%", height: 12, marginTop: 10 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= 通用 ================= */

/** 单行文本骨架（通用导出） */
export function SkeletonLine({ width = "100%", height = "1rem" }: { width?: string | number; height?: string | number }) {
  return <span className="sk-block" style={{ width, height, display: "block" }} aria-hidden="true" />;
}
