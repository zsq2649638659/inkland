"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/browser";
import {
  emptyInterestPreferences,
  interestOptions,
  readInterestPreferences,
  saveInterestPreferences,
} from "@/lib/interestPreferences";
import styles from "./InterestPicker.module.css";

type PickerMode = "onboarding" | "settings";

export default function InterestPicker({ mode = "onboarding" }: { mode?: PickerMode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pickerMode: PickerMode = mode === "settings" || searchParams.get("mode") === "settings" ? "settings" : "onboarding";
  const { user, loading: authLoading } = useAuth();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;

    let active = true;
    void Promise.resolve().then(() => {
      const existing = readInterestPreferences(user);
      if (active) {
        setSelectedInterests(existing?.domains.filter((item) => interestOptions.includes(item)) || []);
      }
    });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, pathname, router, user]);

  function toggleInterest(value: string) {
    setSelectedInterests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
    setMessage("");
    setSaved(false);
  }

  async function finish(skipped = false) {
    if (!user || saving) return;

    setSaving(true);
    setMessage("");
    const preferences = skipped
      ? emptyInterestPreferences()
      : { domains: selectedInterests, original_works: [], dimensions: [] };
    const { error } = await saveInterestPreferences(supabase, preferences);
    setSaving(false);

    if (error) {
      setMessage("兴趣设置暂时保存失败，请稍后再试。");
      return;
    }

    if (skipped) setSelectedInterests([]);
    if (pickerMode === "settings") {
      setSaved(true);
      return;
    }

    router.replace("/");
  }

  if (authLoading) return <div className={styles.state}>正在确认登录状态…</div>;
  if (!user) return null;

  return (
    <section className={styles.card} aria-label="兴趣设置">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>INKLAND DISCOVERY</span>
          <h1>{pickerMode === "settings" ? "兴趣偏好" : "选择你的兴趣"}</h1>
          <p>
            {pickerMode === "settings"
              ? "选择你想看的内容，这些选择只用于兴趣发现，不会替换首页的关注流。"
              : "选择你感兴趣的内容，可以多选；之后也能在设置里修改。"}
          </p>
        </div>
      </div>

      <div className={styles.options} role="group" aria-label="选择你的兴趣">
        {interestOptions.map((item) => {
          const selected = selectedInterests.includes(item);
          return (
            <button
              aria-pressed={selected}
              className={`${styles.option} ${selected ? styles.selected : ""}`}
              key={item}
              onClick={() => toggleInterest(item)}
              type="button"
            >
              {item}
            </button>
          );
        })}
      </div>

      {message && <p className={styles.error} role="alert">{message}</p>}
      {saved && <p className={styles.success} role="status">兴趣偏好已保存。</p>}

      <div className={styles.actions}>
        <button className={styles.skip} disabled={saving} onClick={() => void finish(true)} type="button">
          {pickerMode === "settings" ? "清空偏好" : "跳过，先去逛逛"}
        </button>
        <div className={styles.actionGroup}>
          <button className={styles.primary} disabled={saving} onClick={() => void finish()} type="button">
            {saving ? "保存中…" : pickerMode === "settings" ? "保存偏好" : "进入首页"}
          </button>
        </div>
      </div>
    </section>
  );
}
