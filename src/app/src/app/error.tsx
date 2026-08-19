"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("页面渲染失败", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 text-center bg-paper">
      <div className="max-w-md">
        <p className="text-sm text-muted mb-3">INKLAND</p>
        <h1>页面暂时出了点问题</h1>
        <p className="text-muted mb-6">请稍后重试。如果问题持续存在，欢迎联系我们。</p>
        <button type="button" className="btn-accent px-5 py-3 rounded-full" onClick={() => reset()}>重新加载</button>
      </div>
    </main>
  );
}
