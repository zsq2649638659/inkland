"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import {
  emptyInterestPreferences,
  interestDimensions,
  interestDomains,
  readInterestPreferences,
  saveInterestPreferences,
  visualInterestDimensions,
  visualInterestOptions,
} from "@/lib/interestPreferences";
import styles from "./InterestPicker.module.css";

type PickerMode = "onboarding" | "settings";

const fallbackWorks = ["原神", "崩坏：星穹铁道", "明日方舟", "咒术回战", "鬼灭之刃", "排球少年", "哈利·波特", "原创世界观"];

async function loadHotWorks(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("tags")
    .select("name, post_count")
    .eq("type", "fandom")
    .order("post_count", { ascending: false })
    .limit(24);
  const names = (data || [])
    .map((item) => (item as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  return names.length > 0 ? [...new Set(names)] : fallbackWorks;
}

export default function InterestPicker({ mode = "onboarding" }: { mode?: PickerMode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [domains, setDomains] = useState<string[]>([]);
  const [works, setWorks] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [workOptions, setWorkOptions] = useState<string[]>(fallbackWorks);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void Promise.resolve().then(() => {
      const existing = readInterestPreferences(user);
      if (active && existing) {
        setDomains(existing.domains);
        setWorks(existing.original_works);
        setDimensions(existing.dimensions);
      }
    });
    void loadHotWorks(supabase).then((nextWorks) => {
      if (active) {
        setWorkOptions(nextWorks);
      }
    }).catch(() => {
      // fallbackWorks is already visible when the tag request fails.
    });
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    if (!authLoading && !user) {
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, pathname, router, user]);

  const visualOnly = domains.length > 0 && domains.every((item) => item === "插画摄影");
  const currentValues = step === 1 ? domains : step === 2 ? works : dimensions;
  const currentOptions = step === 1
    ? interestDomains
    : step === 2
      ? visualOnly ? visualInterestOptions : workOptions
      : visualOnly ? visualInterestDimensions : interestDimensions;
  const questionTitle = step === 1
    ? "先选择你感兴趣的大领域"
    : step === 2
      ? visualOnly ? "选择你想看的视觉方向" : "选择适用的热门原作"
      : visualOnly ? "再选择你关心的视觉维度" : "再选择你关心的兴趣维度";
  const questionDescription = step === 1
    ? "可以多选，也可以暂时跳过。"
    : step === 2
      ? visualOnly
        ? "视觉兴趣不会要求填写原作或 CP，只选择你想看的方向。"
        : "只选择你愿意主动探索的原作，没有合适的可以跳过。"
      : visualOnly
        ? "这些选择只用于独立的兴趣发现入口。"
        : "可以多选，之后也能在设置里重新修改。";

  const toggle = (value: string) => {
    const next = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];
    if (step === 1) setDomains(next);
    else if (step === 2) setWorks(next);
    else setDimensions(next);
    setMessage("");
  };

  const finish = async (skipped = false) => {
    if (!user || saving) return;
    setSaving(true);
    setMessage("");
    const next = skipped ? emptyInterestPreferences() : { domains, original_works: works, dimensions };
    const { error } = await saveInterestPreferences(supabase, next);
    setSaving(false);
    if (error) {
      setMessage("兴趣设置暂时保存失败，请稍后再试。" );
      return;
    }
    if (mode === "settings") {
      setSaved(true);
      return;
    }
    const nextPath = params.get("next");
    router.replace(nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/discover");
  };

  if (authLoading) return <div className={styles.state}>正在确认登录状态…</div>;
  if (!user) return null;

  return (
    <section className={`${styles.card} ${mode === "settings" ? styles.settingsCard : ""}`} aria-label="兴趣设置">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>INKLAND DISCOVERY</span>
          <h1>{mode === "settings" ? "兴趣偏好" : "找到你的兴趣入口"}</h1>
          <p>{mode === "settings" ? "这些选择只用于兴趣发现，不会替换首页的关注流。" : "用三步告诉我们你想看什么。这个引导可以跳过，之后也能在设置里修改。"}</p>
        </div>
        <span className={styles.step}>第 {step} / 3 步</span>
      </div>

      <div className={styles.progress} aria-label={`当前为第 ${step} 步`}>
        <span style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      <div className={styles.question}>
        <h2>{questionTitle}</h2>
        <p>{questionDescription}</p>
      </div>

      <div className={styles.options} role="group" aria-label={questionTitle}>
        {currentOptions.map((item) => {
          const selected = currentValues.includes(item);
          return (
            <button
              type="button"
              key={item}
              className={`${styles.option} ${selected ? styles.selected : ""}`}
              aria-pressed={selected}
              onClick={() => toggle(item)}
            >
              <span className={styles.optionMarker} aria-hidden="true">{selected ? "✓" : ""}</span>
              {item}
            </button>
          );
        })}
      </div>

      {step === 2 && !visualOnly && (
        <p className={styles.loadingNote}>热门原作会随平台内容更新。</p>
      )}
      {message && <p className={styles.error} role="alert">{message}</p>}
      {saved && <p className={styles.success} role="status">已保存。之后可以继续从这里修改兴趣偏好。</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.skip} onClick={() => void finish(true)} disabled={saving}>
          {mode === "settings" ? "清空偏好" : "跳过，先去逛逛"}
        </button>
        <div className={styles.actionGroup}>
          {step > 1 && (
            <button type="button" className={styles.secondary} onClick={() => { setStep((value) => value - 1); setSaved(false); }} disabled={saving}>
              上一步
            </button>
          )}
          {step < 3 ? (
            <button type="button" className={styles.primary} onClick={() => { setStep((value) => value + 1); setSaved(false); }} disabled={saving}>
              下一步
            </button>
          ) : (
            <button type="button" className={styles.primary} onClick={() => void finish()} disabled={saving}>
              {saving ? "保存中…" : mode === "settings" ? "保存偏好" : "保存并开始发现"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
