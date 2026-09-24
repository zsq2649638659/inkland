"use client";
import SiteIcon from "@/components/SiteIcon";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import DefaultAvatar from "@/components/DefaultAvatar";
import SettingsStatus from "@/components/SettingsStatus";
import { createClient } from "@/lib/supabase/browser";
import {
  defaultAccountPreferences,
  genderLabels,
  readAccountPreferences,
  saveAccountPreferences,
  type AccountPreferences,
  type CopyrightLicense,
} from "@/lib/accountPreferences";
import { copyrightPolicyMap, copyrightPolicyOptions } from "@/lib/copyrightPolicy";
import { readInterestPreferences } from "@/lib/interestPreferences";
import { getOrCreateClientCache, invalidateClientCache } from "@/lib/client-cache";

type AccountActivity = {
  publishedDays: number;
  readingDays: number;
  engagementDays: number;
};

type SidebarStats = {
  following: number | null;
  followers: number | null;
  works: number | null;
};

const emptySidebarStats: SidebarStats = { following: null, followers: null, works: null };
const fallbackActivity: AccountActivity = {
  publishedDays: 0,
  readingDays: 0,
  engagementDays: 0,
};

const levelBands = [
  { number: 1, start: 0, end: 100 },
  { number: 2, start: 100, end: 500 },
  { number: 3, start: 500, end: 2500 },
  { number: 4, start: 2500, end: 10000 },
  { number: 5, start: 10000, end: 20000 },
  { number: 6, start: 20000, end: 100000 },
] as const;

function deriveExperience(activity: AccountActivity) {
  // 目前数据库还没有经验流水表，先按现有可核实记录折算历史经验：
  // 发布、阅读、收藏/关注都按活跃日计分，同一天的多次行为只计一次；当前登录计 2 经验。
  const activityExperience = activity.publishedDays * 10 + activity.readingDays * 2 + activity.engagementDays * 2;
  const total = Math.max(2, activityExperience + 2);
  const band = levelBands.find(({ end }) => total < end) || levelBands[levelBands.length - 1];
  const current = Math.min(Math.max(0, total - band.start), band.end - band.start);
  return { total, current, next: band.end - band.start, number: band.number, start: band.start, end: band.end };
}

function calendarDay(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}

function countActivityDays(values: Array<string | null | undefined>) {
  return new Set(values.map(calendarDay).filter((value): value is string => Boolean(value))).size;
}

const coinBalance = 0;
const dailyRewardTasks = [
  ["每日登录", "+1"],
  ["每日阅读一篇作品", "+1"],
  ["每日收藏一篇作品", "+1"],
] as const;

function formatBirthDate(value: string | null) {
  if (!value) return "未设置";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "未设置" : date.toLocaleDateString("zh-CN");
}

export default function AccountSettingsPanel() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile } = useAuth();
  const [accountPreferences, setAccountPreferences] = useState<AccountPreferences>(defaultAccountPreferences);
  const [interests, setInterests] = useState<string[]>([]);
  const [preferencesLoad, setPreferencesLoad] = useState<{ userId: string; error: boolean } | null>(null);
  const [copyrightLicense, setCopyrightLicense] = useState<CopyrightLicense>(defaultAccountPreferences.copyright_license);
  const [savingCopyright, setSavingCopyright] = useState(false);
  const [copyrightMessage, setCopyrightMessage] = useState("");
  const [copyrightMessageKind, setCopyrightMessageKind] = useState<"success" | "error" | "">("");
  const [copyrightOpen, setCopyrightOpen] = useState(false);
  const copyrightMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activityResult, setActivityResult] = useState<{ userId: string; activity: AccountActivity } | null>(null);
  const [sidebarStatsResult, setSidebarStatsResult] = useState<{ userId: string; stats: SidebarStats } | null>(null);
  const copyrightSelectRef = useRef<HTMLDivElement>(null);
  const activity = user && activityResult?.userId === user.id ? activityResult.activity : null;
  const sidebarStats = user && sidebarStatsResult?.userId === user.id ? sidebarStatsResult.stats : emptySidebarStats;
  const preferencesLoading = Boolean(user && preferencesLoad?.userId !== user.id);
  const preferencesError = Boolean(user && preferencesLoad?.userId === user.id && preferencesLoad.error);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const currentUser = data.user || user;
        if (!active) return;
        const nextPreferences = readAccountPreferences(currentUser);
        const nextInterests = readInterestPreferences(currentUser)?.domains || [];
        setAccountPreferences(nextPreferences);
        setCopyrightLicense(nextPreferences.copyright_license);
        setInterests(nextInterests);
        setPreferencesLoad({ userId: user.id, error: false });
      } catch {
        if (active) setPreferencesLoad({ userId: user.id, error: true });
      }
    })();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadStats = async () => {
      try {
        const stats = await getOrCreateClientCache<SidebarStats>(`sidebar-stats:${user.id}`, async () => {
          const [{ count: followingCount }, { count: followersCount }, { data: publishedPosts }, { data: series }] = await Promise.all([
            supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
            supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", user.id),
            supabase.from("posts").select("id, review_status").eq("user_id", user.id).eq("status", "published").neq("post_type", "serial").neq("review_status", "rejected"),
            supabase.from("series").select("name").eq("user_id", user.id),
          ]);
          const seriesCount = new Set(((series || []) as Array<{ name?: string | null }>).map((item) => item.name).filter(Boolean)).size;
          return {
            following: followingCount || 0,
            followers: followersCount || 0,
            works: (publishedPosts || []).length + seriesCount,
          };
        }, { ttlMs: 30_000, persist: true });
        if (active) setSidebarStatsResult({ userId: user.id, stats });
      } catch {
        if (active) setSidebarStatsResult({ userId: user.id, stats: emptySidebarStats });
      }
    };
    void loadStats();
    const handleStatsChanged = () => {
      invalidateClientCache(`sidebar-stats:${user.id}`);
      void loadStats();
    };
    window.addEventListener("inkland:stats-changed", handleStatsChanged);
    return () => {
      active = false;
      window.removeEventListener("inkland:stats-changed", handleStatsChanged);
    };
  }, [supabase, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const [{ data: publishedPosts }, { data: followingRows }, { data: bookmarkRows }, { data: readingRows }] = await Promise.all([
        supabase
          .from("posts")
          .select("created_at, published_at, review_status")
          .eq("user_id", user.id)
          .eq("status", "published"),
        supabase.from("follows").select("created_at").eq("follower_id", user.id),
        supabase.from("bookmarks").select("created_at").eq("user_id", user.id),
        supabase.from("reading_history").select("last_read_at").eq("user_id", user.id),
      ]);
      if (!active) return;
      const publishRows = (publishedPosts || []) as Array<{ created_at?: string | null; published_at?: string | null; review_status?: string | null }>;
      const followingDates = ((followingRows || []) as Array<{ created_at?: string | null }>).map((row) => row.created_at);
      const bookmarkDates = ((bookmarkRows || []) as Array<{ created_at?: string | null }>).map((row) => row.created_at);
      const readingDates = ((readingRows || []) as Array<{ last_read_at?: string | null }>).map((row) => row.last_read_at);
      setActivityResult({
        userId: user.id,
        activity: {
          publishedDays: countActivityDays(publishRows
            .filter((row) => row.review_status !== "rejected")
            .map((row) => row.published_at || row.created_at)),
          readingDays: countActivityDays(readingDates),
          engagementDays: countActivityDays([...followingDates, ...bookmarkDates]),
        },
      });
    })();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    const closeCopyrightSelect = (event: MouseEvent) => {
      if (!copyrightSelectRef.current?.contains(event.target as Node)) setCopyrightOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCopyrightOpen(false);
    };
    document.addEventListener("mousedown", closeCopyrightSelect);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeCopyrightSelect);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => () => {
    if (copyrightMessageTimerRef.current) clearTimeout(copyrightMessageTimerRef.current);
  }, []);

  if (!user) return null;

  const displayName = profile?.nickname || user.user_metadata?.username || user.email?.split("@")[0] || "用户";
  const displayBio = profile?.bio || "";
  const avatarUrl = profile?.avatar_url || "";
  const selectedCopyright = copyrightPolicyMap[copyrightLicense] || copyrightPolicyOptions[0];
  const experience = deriveExperience(activity || fallbackActivity);
  const experienceProgress = activity ? Math.min(100, Math.round((experience.current / Math.max(1, experience.next)) * 100)) : 0;

  function clearCopyrightMessageTimer() {
    if (copyrightMessageTimerRef.current) {
      clearTimeout(copyrightMessageTimerRef.current);
      copyrightMessageTimerRef.current = null;
    }
  }

  function scheduleCopyrightMessageDismissal() {
    clearCopyrightMessageTimer();
    copyrightMessageTimerRef.current = setTimeout(() => {
      setCopyrightMessage("");
      setCopyrightMessageKind("");
      copyrightMessageTimerRef.current = null;
    }, 3000);
  }

  async function saveCopyright() {
    if (savingCopyright) return;
    setSavingCopyright(true);
    clearCopyrightMessageTimer();
    setCopyrightMessage("");
    setCopyrightMessageKind("");
    const { error } = await saveAccountPreferences(supabase, {
      gender: accountPreferences.gender,
      birth_date: accountPreferences.birth_date,
      copyright_license: copyrightLicense,
    });
    setSavingCopyright(false);
    if (error) {
      setCopyrightMessageKind("error");
      setCopyrightMessage("版权设置保存失败，请稍后再试。");
      scheduleCopyrightMessageDismissal();
      return;
    }
    setAccountPreferences((current) => ({ ...current, copyright_license: copyrightLicense }));
    setCopyrightMessageKind("success");
    setCopyrightMessage("版权设置已保存。");
    scheduleCopyrightMessageDismissal();
  }

  return (
    <section className="settings-panel account-settings-panel" aria-label="账号设置">
      <section className="account-settings-section account-settings-basic" aria-label="基本信息">
        <div className="account-settings-profile-layout">
          <div className="account-settings-avatar">
            {avatarUrl ? <Image src={avatarUrl} alt="当前头像" fill sizes="88px" unoptimized /> : <DefaultAvatar name={displayName} />}
          </div>

          <div className="account-settings-profile-copy">
            <div className="account-settings-profile-name">{displayName}</div>
            <div className="account-settings-profile-bio">{displayBio || "未设置"}</div>
          </div>

          <div className="sidebar-user-stats account-settings-profile-stats" aria-label="关注、粉丝和作品数量">
            <Link href="/relationships" className="sidebar-stat sidebar-stat-link" aria-label="查看我的关注">
              <div className="sidebar-stat-value">{sidebarStats.following ?? "—"}</div>
              <div className="sidebar-stat-label">关注</div>
            </Link>
            <Link href="/relationships/followers" className="sidebar-stat sidebar-stat-link" aria-label="查看我的粉丝">
              <div className="sidebar-stat-value">{sidebarStats.followers ?? "—"}</div>
              <div className="sidebar-stat-label">粉丝</div>
            </Link>
            <Link href="/profile" className="sidebar-stat sidebar-stat-link" aria-label="查看我的作品">
              <div className="sidebar-stat-value">{sidebarStats.works ?? "—"}</div>
              <div className="sidebar-stat-label">作品</div>
            </Link>
          </div>
        </div>

        <hr className="account-settings-divider" />

        <div className="account-settings-profile-metrics" aria-label="墨滴与等级">
          <div className="account-settings-profile-metric" role="group" aria-label={`墨滴 ${coinBalance}`}>
            <span className="account-settings-coin-logo" aria-hidden="true"><SiteIcon name="fa-droplet" variant="solid" /></span>
            <span className="account-settings-profile-metric-copy"><span>墨滴</span><strong>{coinBalance}</strong></span>
          </div>
          <div className="account-settings-profile-metric" role="group" aria-label={`等级 ${activity ? `LV.${experience.number}` : "汇总中"}`}>
            <span className="account-settings-level-logo" aria-hidden="true"><Image src="/icons/level.svg" alt="" width={15} height={15} unoptimized /></span>
            <span className="account-settings-profile-metric-copy"><span>等级</span><strong>{activity ? `LV.${experience.number}` : "汇总中"}</strong></span>
          </div>
        </div>

        <section className="account-settings-experience" aria-label="个人经验进度">
          <div className="account-settings-experience-heading">
            <strong>经验进度</strong>
            <span>{activity ? `${experience.current}/${experience.next}` : "—/—"}</span>
          </div>
          <div className="account-settings-experience-track-row">
            <div
              className={`account-settings-level-progress${experienceProgress > 0 ? " has-progress" : ""}`}
              role="progressbar"
              aria-label="当前等级经验进度"
              aria-valuemin={0}
              aria-valuemax={experience.next}
              aria-valuenow={activity ? experience.current : 0}
            >
              <span style={{ width: `${experienceProgress}%` }} />
            </div>
          </div>
        </section>

        <section className="account-settings-rule-group account-settings-coin-rule-group" aria-labelledby="account-coin-rules-title">
          <h4 className="account-settings-rule-title" id="account-coin-rules-title">墨滴如何获得</h4>
          <ul className="account-settings-coin-task-list">
            {dailyRewardTasks.map(([label, reward]) => <li key={label}><b>{reward}</b><span>{label}</span></li>)}
          </ul>
        </section>

        <section className="account-settings-rule-group account-settings-experience-rule-group" aria-labelledby="account-experience-rules-title">
          <h4 className="account-settings-rule-title" id="account-experience-rules-title">经验如何获得</h4>
          <ul className="account-settings-experience-rule-list">
            {dailyRewardTasks.map(([label, reward]) => <li key={label}><b>{reward}</b><span>{label}</span></li>)}
          </ul>
        </section>

        <hr className="account-settings-divider account-settings-details-divider" />

        <dl className="account-settings-list">
          <div className="account-settings-row account-settings-row-id">
            <dt>ID</dt>
            <dd className="account-settings-id">{user.id}</dd>
          </div>
          <div className="account-settings-row account-settings-row-email">
            <dt>邮箱</dt>
            <dd>{user.email || "未绑定"}</dd>
          </div>
          <div className="account-settings-row account-settings-row-gender">
            <dt>性别</dt>
            <dd>{genderLabels[accountPreferences.gender]}</dd>
          </div>
          <div className="account-settings-row account-settings-row-birth">
            <dt>出生日期</dt>
            <dd>{formatBirthDate(accountPreferences.birth_date)}</dd>
          </div>
        </dl>
      </section>

      <section className="account-settings-section" aria-labelledby="account-copyright-title">
        <div className="account-settings-section-heading">
          <div>
            <h3 id="account-copyright-title" className="account-settings-section-title">版权设置</h3>
          </div>
          <Link className="account-settings-help-link" href="/copyright">查看版权说明</Link>
        </div>
        <div className={`account-copyright-select${copyrightOpen ? " open" : ""}`} ref={copyrightSelectRef}>
          <button
            type="button"
            id="account-copyright-license"
            className="account-copyright-trigger"
            aria-haspopup="listbox"
            aria-expanded={copyrightOpen}
            onClick={() => setCopyrightOpen((current) => !current)}
          >
            <span>{selectedCopyright.label}</span>
            <SiteIcon name="fa-chevron-down" variant="solid" className={copyrightOpen ? "up" : undefined} aria-hidden="true" />
          </button>
          {copyrightOpen && (
            <div className="account-copyright-dropdown" role="listbox" aria-label="选择版权偏好">
              {copyrightPolicyOptions.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={copyrightLicense === option.value}
                  className={`account-copyright-option${copyrightLicense === option.value ? " active" : ""}`}
                  key={option.value}
                  onClick={() => {
                    setCopyrightLicense(option.value);
                    setCopyrightOpen(false);
                    clearCopyrightMessageTimer();
                    setCopyrightMessage("");
                    setCopyrightMessageKind("");
                  }}
                >
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="account-settings-copyright-actions">
          <button className="settings-btn-save" disabled={savingCopyright} onClick={() => void saveCopyright()} type="button">
            {savingCopyright ? "保存中…" : "保存版权设置"}
          </button>
          {copyrightMessage && (
            <SettingsStatus kind={copyrightMessageKind === "error" ? "error" : "success"} message={copyrightMessage} />
          )}
        </div>
      </section>

      <section className="account-settings-section" aria-labelledby="account-interest-title">
        <div className="account-settings-section-heading">
          <div>
            <h3 id="account-interest-title" className="account-settings-section-title">兴趣领域</h3>
          </div>
          <Link className="account-settings-help-link" href="/onboarding/interests?mode=settings">修改兴趣</Link>
        </div>
        {preferencesLoading ? (
          <div className="account-settings-interest-loading" role="status" aria-busy="true">
            <span className="account-settings-skeleton-line" />
            <span>正在加载兴趣领域…</span>
          </div>
        ) : preferencesError ? (
          <p className="account-settings-empty" role="status">兴趣领域暂时无法加载，请稍后刷新。</p>
        ) : interests.length > 0 ? (
          <div className="account-settings-tags">
            {interests.map((interest) => <span className="card-tag" key={interest}>{interest}</span>)}
          </div>
        ) : (
          <p className="account-settings-empty">暂未选择兴趣领域</p>
        )}
      </section>
    </section>
  );
}
