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

  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (active) setLoading(true);
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
        if (active) setRecords(local);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [user]);

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
    <div className="min-h-screen bg-paper pb-20 lg:pb-0 history-page" id="page-history">
      <div className="main-container">
        <HomeSidebar />
        <main className="content-area">
          {records.length === 0 ? (
            <EmptyState
              icon="fa-clock-rotate-left"
              title="还没有阅读记录"
              description="打开一篇作品后，Inkland 会自动记录最近阅读的位置。"
              actionLabel="去发现作品"
              actionHref="/search"
            />
          ) : <HistoryCards records={records} />}
        </main>
      </div>
    </div>
  );
}
