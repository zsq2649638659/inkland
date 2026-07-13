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
    <div className="rounded-xl bg-white border border-rule overflow-hidden flex flex-col aspect-square">
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

/** 列表视图骨架 */
export function SkeletonCardList() {
  return (
    <div className="rounded-xl bg-white border border-rule p-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-rule animate-pulse flex-shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-20 bg-rule animate-pulse rounded" />
            <div className="h-3 w-12 bg-rule animate-pulse rounded" />
          </div>
          <div className="h-5 w-3/4 bg-rule animate-pulse rounded" />
          <div className="h-4 w-full bg-rule animate-pulse rounded" />
          <div className="h-4 w-2/3 bg-rule animate-pulse rounded" />
          <div className="flex gap-2 mt-1">
            <div className="h-5 w-14 bg-rule animate-pulse rounded-full" />
            <div className="h-5 w-10 bg-rule animate-pulse rounded-full" />
          </div>
          <div className="flex gap-3 mt-1">
            <div className="h-4 w-10 bg-rule animate-pulse rounded" />
            <div className="h-4 w-10 bg-rule animate-pulse rounded" />
            <div className="h-4 w-10 bg-rule animate-pulse rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 个人页头部骨架 */
export function SkeletonProfile() {
  return (
    <div className="bg-white border border-rule rounded-xl p-6 mb-6">
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

/** 创作中心骨架 */
export function SkeletonStudio() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="h-8 w-40 bg-rule animate-pulse rounded" />
        <div className="h-10 w-28 bg-rule animate-pulse rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-xl bg-white border border-rule overflow-hidden">
            <div className="h-40 bg-rule animate-pulse" />
            <div className="p-4 flex flex-col gap-2">
              <div className="h-5 w-3/4 bg-rule animate-pulse rounded" />
              <div className="h-4 w-full bg-rule animate-pulse rounded" />
              <div className="h-4 w-2/3 bg-rule animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}