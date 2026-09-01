"use client";

import { useEffect, useMemo, useState } from "react";
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
import { readInterestPreferences } from "@/lib/interestPreferences";

const copyrightOptions: Array<{ value: CopyrightLicense; label: string; description: string }> = [
  {
    value: "all-rights-reserved",
    label: "保留所有权利",
    description: "默认不授予站外转载、改编或商用许可。",
  },
  {
    value: "cc-by-nc-nd",
    label: "CC BY-NC-ND 4.0",
    description: "允许署名、非商业转载，但不得修改作品。",
  },
  {
    value: "cc-by-nc-sa",
    label: "CC BY-NC-SA 4.0",
    description: "允许署名、非商业改编，并以相同方式共享。",
  },
  {
    value: "cc-by-nc",
    label: "CC BY-NC 4.0",
    description: "允许署名、非商业使用和改编。",
  },
  {
    value: "cc-by-nd",
    label: "CC BY-ND 4.0",
    description: "允许署名和商业使用，但不得修改作品。",
  },
  {
    value: "cc-by-sa",
    label: "CC BY-SA 4.0",
    description: "允许署名、商业改编，并以相同方式共享。",
  },
  {
    value: "cc-by",
    label: "CC BY 4.0",
    description: "只要署名，即可进行再传播、改编和商用。",
  },
];

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

  if (!user) return null;

  const displayName = profile?.nickname || user.user_metadata?.username || user.email?.split("@")[0] || "用户";
  const avatarUrl = profile?.avatar_url || "";

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
          <p className="settings-panel-desc">查看账号信息，管理资料展示、版权和兴趣领域。</p>
        </div>
        <Link className="settings-btn-secondary" href="/settings?tab=profile">编辑资料</Link>
      </div>

      <section className="account-settings-section" aria-labelledby="account-basic-title">
        <h3 id="account-basic-title" className="account-settings-section-title">基本信息</h3>
        <div className="account-settings-profile">
          <div className="account-settings-avatar">
            {avatarUrl ? <Image src={avatarUrl} alt="当前头像" fill sizes="72px" unoptimized /> : <DefaultAvatar name={displayName} />}
          </div>
          <div className="account-settings-profile-copy">
            <div className="account-settings-profile-name">{displayName}</div>
            <div className="account-settings-profile-level">Lv.1 · Inkland 用户</div>
          </div>
        </div>
        <dl className="account-settings-list">
          <div className="account-settings-row">
            <dt>昵称</dt>
            <dd>{displayName}</dd>
          </div>
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
      </section>

      <section className="account-settings-section" aria-labelledby="account-copyright-title">
        <div className="account-settings-section-heading">
          <div>
            <h3 id="account-copyright-title" className="account-settings-section-title">版权设置</h3>
            <p className="account-settings-section-desc">记录你希望采用的版权倾向，发布作品时可以再次确认。</p>
          </div>
          <a className="account-settings-help-link" href="https://www.lofter.com/CreativeCommons" target="_blank" rel="noreferrer">查看版权说明</a>
        </div>
        <label className="settings-form-label" htmlFor="account-copyright-license">默认版权偏好</label>
        <select
          className="settings-form-select"
          id="account-copyright-license"
          value={copyrightLicense}
          onChange={(event) => { setCopyrightLicense(event.target.value as CopyrightLicense); setCopyrightMessage(""); }}
        >
          {copyrightOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <p className="account-settings-copyright-hint">
          {copyrightOptions.find((option) => option.value === copyrightLicense)?.description} 此设置不会自动改变已发布作品。
        </p>
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
