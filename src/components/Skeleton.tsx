"use client";

/** 骨架屏脉冲动画 */
function Pulse({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-rule rounded ${className || ""}`}
    />
  );
}

/** 网格卡片骨架 */
export function SkeletonCardGrid() {
  return (
    <div className="rounded-[16px] bg-card border border-rule overflow-hidden flex flex-col aspect-square">
      <div className="flex-1 bg-rule animate-pulse" />
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-rule animate-pulse" />
          <div className="h-3 w-16 bg-rule animate-pulse rounded" />
        </div>
        <div className="flex gap-1">
          <div className="h-4 w-10 bg-rule animate-pulse rounded-full" />
          <div className="h-4 w-12 bg-rule animate-pulse rounded-full" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <div className="h-3 w-8 bg-rule animate-pulse rounded" />
            <div className="h-3 w-8 bg-rule animate-pulse rounded" />
          </div>
          <div className="h-3 w-12 bg-rule animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}

/** 通知列表骨架 */
export function SkeletonNotification() {
  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="flex flex-col">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-4 px-5 py-4">
            <div className="w-11 h-11 rounded-xl bg-rule animate-pulse flex-shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-4 w-48 bg-rule animate-pulse rounded" />
              <div className="h-3.5 w-64 bg-rule animate-pulse rounded" />
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              <div className="h-3 w-12 bg-rule animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 列表视图骨架 - 使用 shimmer 闪烁效果 */
export function SkeletonCardList() {
  return (
    <div className="feed-skeleton-card">
      {/* 头部：头像 + 用户名 + 时间 */}
      <div className="feed-skeleton-header">
        <div className="feed-skeleton-line circle feed-skeleton-avatar" />
        <div>
          <div className="feed-skeleton-line round feed-skeleton-name" />
          <div className="feed-skeleton-line round feed-skeleton-time" />
        </div>
      </div>

      {/* 标题 */}
      <div className="feed-skeleton-line round feed-skeleton-title" />

      {/* 正文 */}
      <div className="feed-skeleton-line round feed-skeleton-body" />
      <div className="feed-skeleton-line round feed-skeleton-body short" />

      {/* 标签 */}
      <div className="feed-skeleton-tags">
        <div className="feed-skeleton-line pill feed-skeleton-tag" />
        <div className="feed-skeleton-line pill feed-skeleton-tag" />
      </div>

      {/* 底部：喜欢 / 评论 / 收藏 */}
      <div className="feed-skeleton-footer">
        <div className="feed-skeleton-line round feed-skeleton-stat" />
        <div className="feed-skeleton-line round feed-skeleton-stat" />
        <div className="feed-skeleton-line round feed-skeleton-stat" />
      </div>
    </div>
  );
}

/** 首页首屏骨架：鉴权和首页数据都还在准备时使用 */
export function SkeletonHome() {
  return (
    <div className="feed-skeleton" aria-label="正在加载首页内容" aria-busy="true">
      {[1, 2, 3].map((i) => <SkeletonCardList key={i} />)}
    </div>
  );
}

/** 首页右侧 feed 的统一骨架 */
export function SkeletonFeed() {
  return (
    <div className="feed-skeleton" aria-label="正在加载作品" aria-busy="true">
      {[1, 2, 3, 4, 5].map((i) => <SkeletonCardList key={i} />)}
    </div>
  );
}

/** 个人页头部骨架 */
export function SkeletonProfile() {
  return (
    <div className="bg-card rounded-[20px] p-6 mb-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-rule animate-pulse" />
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-6 w-32 bg-rule animate-pulse rounded" />
          <div className="h-4 w-48 bg-rule animate-pulse rounded" />
        </div>
        <div className="h-9 w-24 bg-rule animate-pulse rounded-lg" />
      </div>
    </div>
  );
}

/** 个人中心顶部资料区骨架 - 与创作中心 shimmer 风格一致 */
export function SkeletonProfileSection() {
  return (
    <section className="profile-section profile-section-skeleton" aria-label="正在加载个人资料" aria-busy="true">
      <div className="studio-skeleton-line profile-skeleton-avatar" />
      <div className="profile-skeleton-info">
        <div className="studio-skeleton-line profile-skeleton-name" />
        <div className="studio-skeleton-line profile-skeleton-bio" />
        <div className="profile-skeleton-stats">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="studio-skeleton-line profile-skeleton-stat" />)}
        </div>
      </div>
      <div className="studio-skeleton-line profile-skeleton-action" />
    </section>
  );
}

/** 系列详情页骨架 */
export function SkeletonSeriesDetail() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 bg-rule animate-pulse rounded" />
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-rule animate-pulse" />
          <div className="h-4 w-24 bg-rule animate-pulse rounded" />
        </div>
        <div className="h-4 w-full bg-rule animate-pulse rounded" />
        <div className="h-4 w-3/4 bg-rule animate-pulse rounded" />
        <div className="h-4 w-1/2 bg-rule animate-pulse rounded" />
        <div className="flex gap-2 mt-4">
          <div className="h-10 w-24 bg-rule animate-pulse rounded-lg" />
          <div className="h-10 w-28 bg-rule animate-pulse rounded-lg" />
        </div>
      </div>
      <div className="mt-8 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-rule animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** 单行文本骨架 */
export function SkeletonLine({ width = "100%", height = "1rem" }: { width?: string; height?: string }) {
  return <div className="bg-rule animate-pulse rounded" style={{ width, height }} />;
}

/** 创作中心骨架 - 匹配实际 studio 页面布局 */
export function SkeletonStudio() {
  return (
    <div className="studio-skeleton" aria-label="正在加载创作中心" aria-busy="true">
      {/* 页面头部 */}
      <div className="studio-skeleton-header">
        <div className="studio-skeleton-line studio-skeleton-title" />
        <div className="studio-skeleton-line studio-skeleton-subtitle" />
      </div>

      {/* 统计卡片 */}
      <div className="studio-skeleton-stats">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="studio-skeleton-stat-card">
            <div className="studio-skeleton-line studio-skeleton-stat-icon" />
            <div className="studio-skeleton-line studio-skeleton-stat-number" />
            <div className="studio-skeleton-line studio-skeleton-stat-label" />
          </div>
        ))}
      </div>

      {/* 工具栏 */}
      <div className="studio-skeleton-toolbar">
        <div className="studio-skeleton-tabs">
          <div className="studio-skeleton-line studio-skeleton-tab active" />
          <div className="studio-skeleton-line studio-skeleton-tab" />
          <div className="studio-skeleton-line studio-skeleton-tab" />
          <div className="studio-skeleton-line studio-skeleton-tab" />
        </div>
        <div className="studio-skeleton-line studio-skeleton-search" />
      </div>

      {/* 作品卡片网格 */}
      <div className="studio-skeleton-grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="studio-skeleton-work-card">
            <div className="studio-skeleton-work-meta">
              <div className="studio-skeleton-line studio-skeleton-work-type" />
              <div className="studio-skeleton-line studio-skeleton-work-status" />
            </div>
            <div className="studio-skeleton-line studio-skeleton-work-title" />
            <div className="studio-skeleton-work-stats">
              <div className="studio-skeleton-line studio-skeleton-work-stat" />
              <div className="studio-skeleton-line studio-skeleton-work-stat" />
              <div className="studio-skeleton-line studio-skeleton-work-stat" />
            </div>
            <div className="studio-skeleton-line studio-skeleton-work-date" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 搜索页面骨架 - 搜索结果区域 */
export function SkeletonSearchResults() {
  return (
    <div className="results-area">
      {/* 标签骨架 */}
      <div className="result-section">
        <div className="tags-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="tag-card skeleton">
              <div className="h-4 w-4 bg-rule animate-pulse rounded" />
              <div className="h-4 w-16 bg-rule animate-pulse rounded" />
              <div className="h-3 w-12 bg-rule animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
      {/* 用户骨架 */}
      <div className="result-section">
        <div className="user-cards-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="user-card skeleton">
              <div className="w-10 h-10 rounded-full bg-rule animate-pulse" />
              <div className="user-info">
                <div className="h-4 w-20 bg-rule animate-pulse rounded" />
              </div>
              <div className="user-actions">
                <div className="h-8 w-20 bg-rule animate-pulse rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 作品/正文骨架 */}
      <div className="result-section">
        <div className="work-list">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="work-item skeleton">
              <div className="w-10 h-10 rounded-lg bg-rule animate-pulse" />
              <div className="work-info" style={{ width: "100%" }}>
                <div className="h-5 w-48 bg-rule animate-pulse rounded mb-2" />
                <div className="flex items-center gap-2">
                  <div className="h-4 w-12 bg-rule animate-pulse rounded" />
                  <div className="h-3 w-3 rounded-full bg-rule animate-pulse" />
                  <div className="h-4 w-16 bg-rule animate-pulse rounded" />
                  <div className="h-3 w-3 rounded-full bg-rule animate-pulse" />
                  <div className="h-4 w-14 bg-rule animate-pulse rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 合集详情页骨架 */
export function SkeletonCollectionDetail() {
  return (
    <div className="collection-page-wrapper">
      <div className="collection-content-container">
        <section className="collection-hero">
          <div className="collection-hero-title-row">
            <div className="collection-title-block">
              <div className="h-8 w-48 bg-rule animate-pulse rounded" />
            </div>
            <div className="collection-hero-actions flex gap-2">
              <div className="h-9 w-24 bg-rule animate-pulse rounded-lg" />
              <div className="h-9 w-20 bg-rule animate-pulse rounded-lg" />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-4 w-full bg-rule animate-pulse rounded" />
            <div className="h-4 w-3/4 bg-rule animate-pulse rounded mt-1" />
          </div>
          <div className="collection-meta-row mt-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-rule animate-pulse" />
              <div className="h-4 w-24 bg-rule animate-pulse rounded" />
            </div>
            <div className="h-4 w-px bg-rule animate-pulse mx-2" />
            <div className="h-4 w-20 bg-rule animate-pulse rounded" />
            <div className="h-4 w-px bg-rule animate-pulse mx-2" />
            <div className="h-4 w-20 bg-rule animate-pulse rounded" />
          </div>
        </section>

        <div className="collection-works-head mt-8">
          <div className="h-5 w-32 bg-rule animate-pulse rounded" />
          <div className="flex gap-2 mt-4">
            <div className="h-8 w-16 bg-rule animate-pulse rounded-full" />
            <div className="h-8 w-16 bg-rule animate-pulse rounded-full" />
            <div className="h-8 w-16 bg-rule animate-pulse rounded-full" />
          </div>
        </div>

        <div className="collection-card-grid mt-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-[16px] bg-card border border-rule overflow-hidden flex flex-col">
              <div className="aspect-square bg-rule animate-pulse" />
              <div className="p-3 flex flex-col gap-2">
                <div className="h-4 w-3/4 bg-rule animate-pulse rounded" />
                <div className="flex gap-1">
                  <div className="h-4 w-12 bg-rule animate-pulse rounded-full" />
                  <div className="h-4 w-10 bg-rule animate-pulse rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
