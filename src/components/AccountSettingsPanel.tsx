"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import DefaultAvatar from "@/components/DefaultAvatar";
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

const level = {
  current: 0,
  next: 100,
  number: 1,
};

const experienceRules = [
  ["每日登录", "+5 经验"],
  ["阅读作品", "+5 经验 / 日"],
  ["收藏或关注作品", "+5 经验 / 日"],
  ["发布通过审核的作品", "+20 经验 / 日"],
] as const;

const coinBalance = 0;
const coinWays = ["完成每日任务（每日有上限）", "参与 Inkland 社区活动"];
const coinUses = ["给喜欢的作品表达支持", "参与平台后续开放的社区活动"];

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
  const [copyrightLicense, setCopyrightLicense] = useState<CopyrightLicense>(defaultAccountPreferences.copyright_license);
  const [savingCopyright, setSavingCopyright] = useState(false);
  const [copyrightMessage, setCopyrightMessage] = useState("");
  const [copyrightOpen, setCopyrightOpen] = useState(false);
  const [coinInfoOpen, setCoinInfoOpen] = useState(false);
  const copyrightSelectRef = useRef<HTMLDivElement>(null);
  const coinInfoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const currentUser = data.user || user;
      if (!active) return;
      const nextPreferences = readAccountPreferences(currentUser);
      const nextInterests = readInterestPreferences(currentUser)?.domains || [];
      setAccountPreferences(nextPreferences);
      setCopyrightLicense(nextPreferences.copyright_license);
      setInterests(nextInterests);
    })();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    const closeCopyrightSelect = (event: MouseEvent) => {
      if (!copyrightSelectRef.current?.contains(event.target as Node)) setCopyrightOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCopyrightOpen(false);
        setCoinInfoOpen(false);
      }
    };
    const closeCoinInfo = (event: MouseEvent) => {
      if (!coinInfoRef.current?.contains(event.target as Node)) setCoinInfoOpen(false);
    };
    document.addEventListener("mousedown", closeCopyrightSelect);
    document.addEventListener("mousedown", closeCoinInfo);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeCopyrightSelect);
      document.removeEventListener("mousedown", closeCoinInfo);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  if (!user) return null;

  const displayName = profile?.nickname || user.user_metadata?.username || user.email?.split("@")[0] || "用户";
  const avatarUrl = profile?.avatar_url || "";
  const selectedCopyright = copyrightPolicyMap[copyrightLicense] || copyrightPolicyOptions[0];
  const levelProgress = Math.min(100, Math.round((level.current / level.next) * 100));

  async function saveCopyright() {
    if (savingCopyright) return;
    setSavingCopyright(true);
    setCopyrightMessage("");
    const { error } = await saveAccountPreferences(supabase, {
      gender: accountPreferences.gender,
      birth_date: accountPreferences.birth_date,
      copyright_license: copyrightLicense,
    });
    setSavingCopyright(false);
    if (error) {
      setCopyrightMessage("版权设置保存失败，请稍后再试。");
      return;
    }
    setAccountPreferences((current) => ({ ...current, copyright_license: copyrightLicense }));
    setCopyrightMessage("版权设置已保存。");
  }

  return (
    <section className="settings-panel account-settings-panel" aria-labelledby="account-settings-title">
      <div className="account-settings-heading">
        <div>
          <h2 id="account-settings-title" className="settings-panel-title">账号设置</h2>
        </div>
      </div>

      <section className="account-settings-section" aria-labelledby="account-basic-title">
        <h3 id="account-basic-title" className="account-settings-section-title">基本信息</h3>
        <div className="account-settings-profile-row">
          <div className="account-settings-profile">
            <div className="account-settings-avatar">
              {avatarUrl ? <Image src={avatarUrl} alt="当前头像" fill sizes="72px" unoptimized /> : <DefaultAvatar name={displayName} />}
            </div>
            <div className="account-settings-profile-copy">
              <div className="account-settings-profile-name">{displayName}</div>
              <div className="account-settings-level-line">
                <div
                  className="account-settings-level-progress"
                  role="progressbar"
                  tabIndex={0}
                  aria-label={`等级 LV.${level.number}，经验值 ${level.current} / ${level.next}`}
                  aria-valuemin={0}
                  aria-valuemax={level.next}
                  aria-valuenow={level.current}
                >
                  <span style={{ width: `${levelProgress}%` }} />
                  <strong>LV.{level.number}</strong>
                  <div className="account-settings-tooltip account-settings-experience-tooltip" role="tooltip">
                    <strong>经验值获取方式</strong>
                    <ul>
                      {experienceRules.map(([label, value]) => <li key={label}><span>{label}</span><b>{value}</b></li>)}
                    </ul>
                  </div>
                </div>
                <span className="account-settings-experience-value">{level.current}/{level.next}</span>
              </div>
            </div>
          </div>
          <div className="account-settings-profile-actions">
            <div className="account-settings-coin" ref={coinInfoRef}>
              <button
                type="button"
                className="account-settings-coin-trigger"
                aria-label={`墨滴 ${coinBalance}，查看获取方式和用途`}
                aria-expanded={coinInfoOpen}
                onClick={() => setCoinInfoOpen((current) => !current)}
              >
                <span className="account-settings-coin-logo" aria-hidden="true"><i className="fa-solid fa-droplet" /></span>
                <strong>{coinBalance}</strong>
                <span>墨滴</span>
              </button>
              <div className={`account-settings-tooltip account-settings-coin-tooltip${coinInfoOpen ? " open" : ""}`} role="tooltip">
                <strong>墨滴</strong>
                <div><b>获取方式</b><span>{coinWays.join("、")}</span></div>
                <div><b>可以做什么</b><span>{coinUses.join("，")}</span></div>
                <small>不可转赠、出售或兑换现金</small>
              </div>
            </div>
            <Link className="settings-btn-secondary" href="/settings?tab=profile">编辑资料</Link>
          </div>
        </div>
        <div className="account-settings-profile-fields">
          <dl className="account-settings-list">
            <div className="account-settings-row">
              <dt>用户 ID</dt>
              <dd className="account-settings-id">{user.id}</dd>
            </div>
            <div className="account-settings-row account-settings-row-stacked">
              <dt>账号简介</dt>
              <dd>{profile?.bio || "未设置"}</dd>
            </div>
            <div className="account-settings-row">
              <dt>性别</dt>
              <dd>{genderLabels[accountPreferences.gender]}</dd>
            </div>
            <div className="account-settings-row">
              <dt>出生日期</dt>
              <dd>{formatBirthDate(accountPreferences.birth_date)}</dd>
            </div>
            <div className="account-settings-row">
              <dt>绑定邮箱</dt>
              <dd>{user.email || "未绑定"}</dd>
            </div>
          </dl>
        </div>
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
            <i className={`fa-solid fa-chevron-down${copyrightOpen ? " up" : ""}`} aria-hidden="true" />
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
                  onClick={() => { setCopyrightLicense(option.value); setCopyrightOpen(false); setCopyrightMessage(""); }}
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
        {copyrightMessage && <p className="account-settings-message" role="status">{copyrightMessage}</p>}
        <button className="settings-btn-save" disabled={savingCopyright} onClick={() => void saveCopyright()} type="button">
          {savingCopyright ? "保存中…" : "保存版权设置"}
        </button>
      </section>

      <section className="account-settings-section" aria-labelledby="account-interest-title">
        <div className="account-settings-section-heading">
          <div>
            <h3 id="account-interest-title" className="account-settings-section-title">兴趣领域</h3>
            <p className="account-settings-section-desc">根据你的选择展示兴趣发现内容，不会替换首页关注流。</p>
          </div>
          <Link className="account-settings-help-link" href="/onboarding/interests?mode=settings">修改兴趣</Link>
        </div>
        {interests.length > 0 ? (
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
