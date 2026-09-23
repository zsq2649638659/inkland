"use client";

import { useEffect, useState } from "react";
import HomeSidebar from "@/components/HomeSidebar";
import EmptyState from "@/components/EmptyState";
import HistoryWorkCard from "@/components/HistoryWorkCard";
import { useAuth } from "@/components/AuthProvider";
import {
  getLocalReadingHistory,
  mergeReadingHistoryRecords,
  type ReadingHistoryRecord,
} from "@/lib/readingHistory";

function HistoryCards({ records }: { records: ReadingHistoryRecord[] }) {
  if (records.length === 0) {
    return <div className="history-card-empty">还没有阅读记录。打开一篇作品后，Inkland 会自动记录最近阅读位置。</div>;
  }

  return (
    <>
      <div className="history-card-device history-card-device--pc card-device-grid" data-card-variant="search-work">
        <div className="card-device-frame card-device card-device--pc">
          <div className="card-device__cards">
            {records.map((record) => <HistoryWorkCard key={record.id || record.post_id} record={record} mode="pc" />)}
          </div>
        </div>
      </div>
      <div className="history-card-device history-card-device--mobile card-device-grid" data-card-variant="search-work">
        <div className="card-device-frame card-device card-device--mobile card-device--profile-square card-device--search-work-mobile">
          <div className="card-device__cards">
            {records.map((record) => <HistoryWorkCard key={record.id || record.post_id} record={record} mode="mobile" />)}
          </div>
        </div>
      </div>
    </>
  );
}

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<ReadingHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setSyncError(false);
      }
    });
    const local = getLocalReadingHistory(user.id);
    void fetch("/api/reading-history", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postIds: local.map((record) => record.post_id) }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`reading-history-${response.status}`);
        return response.json() as Promise<{ records?: ReadingHistoryRecord[] }>;
      })
      .then(({ records: remote = [] }) => {
        if (!active) return;
        const next = mergeReadingHistoryRecords(remote, local);
        setRecords(next.filter((record) => record.post_id));
      })
      .catch(() => {
        if (active) {
          setRecords(local);
          setSyncError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [user, retryCount]);

  if (authLoading || (user && loading && (retryCount === 0 || records.length === 0))) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="main-container">
          <HomeSidebar />
          <main className="content-area">
            <div className="page-header">
              <h1 className="page-title">阅读历史</h1>
            </div>
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
            <div className="page-header">
              <h1 className="page-title">阅读历史</h1>
            </div>
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
    <div className="min-h-screen bg-paper pb-20 lg:pb-0 history-page" id="page-history">
      <div className="main-container">
        <HomeSidebar />
        <main className="content-area">
          <div className="page-header">
            <h1 className="page-title">阅读历史</h1>
          </div>
          {loading && records.length > 0 ? (
            <div className="history-sync-notice" role="status" aria-live="polite">
              <p>正在同步阅读历史…</p>
            </div>
          ) : syncError ? (
            <div className="history-sync-notice" role="alert">
              <p>
                无法同步远程阅读历史。{records.length > 0
                  ? "当前显示的是设备上的本地记录。"
                  : "暂时无法确认是否有新的阅读记录。"}
              </p>
              <button
                className="history-sync-retry"
                type="button"
                onClick={() => {
                  setLoading(true);
                  setSyncError(false);
                  setRetryCount((count) => count + 1);
                }}
                disabled={loading}
              >
                重试同步
              </button>
            </div>
          ) : null}
          {records.length === 0 ? (
            syncError ? null : (
              <EmptyState
                icon="fa-clock-rotate-left"
                title="还没有阅读记录"
                description="打开一篇作品后，Inkland 会自动记录最近阅读的位置。"
                actionLabel="去发现作品"
                actionHref="/search"
              />
            )
          ) : <HistoryCards records={records} />}
        </main>
      </div>
    </div>
  );
}
