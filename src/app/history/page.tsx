"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/browser";
import { loadReadingHistory, type ReadingHistoryRecord } from "@/lib/readingHistory";
import styles from "./history.module.css";

type HistoryFilter = "all" | "single" | "image" | "serial";

const filters: Array<[HistoryFilter, string]> = [
  ["all", "全部"],
  ["single", "单篇"],
  ["image", "图片"],
  ["serial", "长篇连载"],
];

function historyKind(record: ReadingHistoryRecord): HistoryFilter {
  const type = record.post?.post_type;
  if (type === "serial") return "serial";
  if (["illustration", "comic", "cosplay", "art"].includes(type || "")) return "image";
  return "single";
}

function formatLastRead(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近阅读";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function positionLabel(record: ReadingHistoryRecord) {
  if (record.position_label) return record.position_label;
  if (record.post?.post_type === "serial" && (record.chapter_number || record.post.chapter_number)) {
    return `第${record.chapter_number || record.post.chapter_number}章`;
  }
  return `已读 ${Math.round(record.progress_ratio * 100)}%`;
}

function HistoryCards({ records }: { records: ReadingHistoryRecord[] }) {
  if (records.length === 0) {
    return <div className={styles.filterEmpty}>还没有这类阅读记录。打开一篇作品后，Inkland 会自动记录最近阅读位置。</div>;
  }

  return (
    <div className={styles.list}>
      {records.map((record) => {
        const post = record.post;
        const title = post?.title || "已删除或暂不可见的作品";
        return (
          <article className={styles.card} key={record.id || record.post_id}>
            <div className={styles.copy}>
              <strong className={styles.title}>{title}</strong>
              <div className={styles.meta}>
                {post?.series_name && <span>{post.series_name}</span>}
                <span>{positionLabel(record)}</span>
                <span>最后阅读于 {formatLastRead(record.last_read_at)}</span>
              </div>
            </div>
            {post ? (
              <Link className={styles.action} href={`/read/${record.post_id}`}>
                继续阅读 <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span className={styles.unavailable}>记录暂不可用</span>
            )}
          </article>
        );
      })}
    </div>
  );
}

export default function HistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<ReadingHistoryRecord[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    void loadReadingHistory(supabase, user.id).then(({ records: next }) => {
      if (!active) return;
      setRecords(next.filter((record) => record.post_id));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [supabase, user]);

  if (authLoading || (user && loading)) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="main-container">
          <HomeSidebar />
          <main className="content-area">
            <div className="settings-panel" role="status" aria-busy="true">正在加载阅读历史…</div>
          </main>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-paper pb-20 lg:pb-0">
        <div className="main-container">
          <HomeSidebar />
          <main className="content-area">
            <EmptyState
              icon="fa-clock-rotate-left"
              title="登录后保存阅读历史"
              description="登录后，Inkland 会记录你最近阅读的作品和位置。"
              actionLabel="登录"
              actionHref="/login?next=%2Fhistory"
            />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-paper pb-20 lg:pb-0 ${styles.page}`} id="page-history">
      <div className="main-container">
        <HomeSidebar />
        <main className="content-area">
          <div className="page-header">
            <h1 className="page-title">阅读历史</h1>
            <p className="page-subtitle">记录你最近读过的作品和位置，随时继续阅读。</p>
          </div>

          <div className="type-filters-row" role="tablist" aria-label="阅读历史分类">
            <div className="type-filters">
              {filters.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`type-filter-pill${filter === key ? " active" : ""}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filters.map(([key]) => {
            const visible = records.filter((record) => key === "all" || historyKind(record) === key);
            return (
              <div
                key={key}
                className={`tab-content${filter === key ? " active" : ""}`}
                role="tabpanel"
                aria-hidden={filter !== key}
              >
                {records.length === 0 && key === "all" ? (
                  <EmptyState
                    icon="fa-clock-rotate-left"
                    title="还没有阅读记录"
                    description="打开一篇作品后，Inkland 会自动记录最近阅读的位置。"
                    actionLabel="去发现作品"
                    actionHref="/search"
                  />
                ) : (
                  <HistoryCards records={visible} />
                )}
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}
