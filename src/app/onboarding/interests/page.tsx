import { Suspense } from "react";
import InterestPicker from "@/components/InterestPicker";

function InterestOnboarding() {
  return (
    <main className="min-h-screen bg-paper">
      <Suspense fallback={<div className="feed-empty-state" role="status">正在加载兴趣引导…</div>}>
        <InterestPicker />
      </Suspense>
    </main>
  );
}

export default InterestOnboarding;
