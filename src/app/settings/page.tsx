"use client";
import SiteIcon from "@/components/SiteIcon";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import HomeSidebar from "@/components/HomeSidebar";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/browser";
import DefaultAvatar from "@/components/DefaultAvatar";
import ProfileEditForm from "@/components/ProfileEditForm";
import AccountSettingsPanel from "@/components/AccountSettingsPanel";
import SettingsStatus from "@/components/SettingsStatus";
import {
  defaultNotificationPreferences,
  notificationPreferenceLabels,
  notificationPreferenceTypes,
  readNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferenceType,
  type NotificationPreferences,
} from "@/lib/notificationPreferences";

type SettingsTab = "account" | "profile" | "password" | "blocked" | "notifications" | "about" | "contact";
export type SettingsSection = "privacy" | "profile" | "about" | "contact";

function parseSettingsTab(value: string | null): SettingsTab | null {
  return value === "account" || value === "profile" || value === "password" || value === "blocked" || value === "notifications" || value === "about" || value === "contact"
    ? value
    : null;
}

const profileSettingsTabKeys: SettingsTab[] = ["account", "profile", "password"];

const siteContactEmail = "inkland@163.com";

type BlockedUserRow = { id: string; blocked_user_id: string; created_at: string };
type BlockedProfileRow = { id: string; nickname: string | null; bio: string | null };

function isTabForSection(tab: SettingsTab | null, section: SettingsSection): tab is SettingsTab {
  if (!tab) return false;
  if (section === "profile") return profileSettingsTabKeys.includes(tab);
  if (section === "privacy") return tab === "blocked" || tab === "notifications";
  return tab === section;
}

function defaultTabForSection(section: SettingsSection): SettingsTab {
  if (section === "profile") return "account";
  if (section === "about") return "about";
  if (section === "contact") return "contact";
  return "blocked";
}

function SettingsPageContent({ section }: { section: SettingsSection }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackType, setFeedbackType] = useState("功能建议");
  const [feedbackTypeOpen, setFeedbackTypeOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const feedbackSelectRef = useRef<HTMLDivElement>(null);
  const [blockedUsers, setBlockedUsers] = useState<Array<{ id: string; blockedUserId: string; name: string; bio: string }>>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordMessageKind, setPasswordMessageKind] = useState<"success" | "error" | "">("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationMessageKind, setNotificationMessageKind] = useState<"success" | "error" | "">("");
  const [notificationSaving, setNotificationSaving] = useState(false);

  const feedbackTypes = ["功能建议", "Bug 报告", "内容举报", "其他问题"];
  const requestedTab = parseSettingsTab(searchParams.get("tab"));
  const activeTab = isTabForSection(requestedTab, section) ? requestedTab : defaultTabForSection(section);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (feedbackSelectRef.current && !feedbackSelectRef.current.contains(e.target as Node)) {
        setFeedbackTypeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => setNotificationPreferences(readNotificationPreferences(user)), 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!user || section !== "privacy" || activeTab !== "blocked") return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setBlockedLoading(true);
    });
    void (async () => {
      const { data: blocked } = await supabase
        .from("blocked_users")
        .select("id, blocked_user_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const blockedRows = (blocked || []) as BlockedUserRow[];
      const ids = blockedRows.map((row) => row.blocked_user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, nickname, bio").in("id", ids)
        : { data: [] };
      if (!active) return;
      const profileRows = (profiles || []) as BlockedProfileRow[];
      const profileMap = new Map(profileRows.map((item) => [item.id, item]));
      setBlockedUsers(blockedRows.map((row) => {
        const blockedProfile = profileMap.get(row.blocked_user_id);
        const name = blockedProfile?.nickname || "已注销用户";
        return {
          id: row.id,
          blockedUserId: row.blocked_user_id,
          name,
          bio: `屏蔽于 ${new Date(row.created_at).toLocaleDateString("zh-CN")}`,
        };
      }));
      setBlockedLoading(false);
    })();
    return () => { active = false; };
  }, [activeTab, section, supabase, user]);

  const profileSettings = section === "profile";
  const moreSettings = section === "about" || section === "contact";
  const tabs: { key: SettingsTab; label: string }[] = profileSettings
    ? [
      { key: "account", label: "账号设置" },
      { key: "profile", label: "编辑资料" },
      { key: "password", label: "修改密码" },
    ]
    : moreSettings
      ? []
      : [
        { key: "blocked", label: "屏蔽管理" },
        { key: "notifications", label: "通知设置" },
      ];

  const getTabHref = (tab: SettingsTab) => {
    const basePath = section === "profile" ? "/profile-settings" : "/settings";
    return `${basePath}?tab=${tab}`;
  };

  if (authLoading) {
    return (
      <div id="page-settings" className="min-h-screen bg-paper pb-20 lg:pb-0">
        <div className="main-container">
          <HomeSidebar />
          <div className="content-area">
            <div className="feed-empty-state" role="status" aria-busy="true">
              <span className="auth-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
              <p className="feed-empty-desc">正在确认登录状态…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 未登录状态
  if (!user) {
    return (
      <div id="page-settings" className="min-h-screen bg-paper pb-20 lg:pb-0">
        <div className="main-container">
          <HomeSidebar />
          <div className="content-area">
            <div className="feed-empty-state">
              <div className="feed-empty-illustration">
                <div className="feed-empty-tag-ring">
                  <div className="feed-empty-ring-outer"></div>
                  <div className="feed-empty-ring-inner">
                    <SiteIcon name="fa-gear" variant="solid" />
                  </div>
                </div>
              </div>
              <h2 className="feed-empty-title">登录后查看设置</h2>
              <p className="feed-empty-desc">登录后即可管理你的账户设置</p>
              <Link href="/login" className="feed-empty-action">登录</Link>
              <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleFeedbackSubmit = async () => {
    if (feedbackText.trim().length < 2) {
      setFeedbackError("请至少填写 2 个字的反馈内容");
      return;
    }
    setFeedbackError("");
    setFeedbackSuccess("");
    setFeedbackSubmitting(true);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: feedbackType, content: feedbackText }),
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setFeedbackError(result?.error || "反馈暂时提交失败，请稍后再试");
      setFeedbackSubmitting(false);
      return;
    }
    setFeedbackSuccess("反馈已收到并保存到平台后台，感谢你的建议！");
    setFeedbackText("");
    setFeedbackSubmitting(false);
    setTimeout(() => setFeedbackSuccess(""), 3000);
  };

    const unblockUser = async (blocked: { id: string }) => {
    const { error } = await supabase.from("blocked_users").delete().eq("id", blocked.id);
    if (!error) setBlockedUsers((items) => items.filter((item) => item.id !== blocked.id));
  };

  const handlePasswordChange = async () => {
    setPasswordMessage("");
    setPasswordMessageKind("");
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
      setPasswordMessageKind("error");
      setPasswordMessage("请确认当前密码、新密码和确认密码填写正确；新密码至少 8 位。");
      return;
    }
    setPasswordSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email || "", password: currentPassword });
    if (verifyError) {
      setPasswordMessageKind("error");
      setPasswordMessage("当前密码不正确，请检查后重试。");
      setPasswordSaving(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordMessageKind(error ? "error" : "success");
    setPasswordMessage(error ? "密码修改失败，请稍后重试。" : "密码已修改。请使用新密码登录。");
    if (!error) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await supabase.auth.signOut();
      router.replace("/login?reason=password-changed");
    }
    setPasswordSaving(false);
  };

  const handleNotificationPreferencesSave = async () => {
    if (!user) return;
    setNotificationSaving(true);
    setNotificationMessage("");
    setNotificationMessageKind("");
    const { error } = await saveNotificationPreferences(supabase, notificationPreferences);
    if (error) {
      setNotificationMessageKind("error");
      setNotificationMessage("通知设置保存失败，请稍后重试。");
    } else {
      setNotificationMessageKind("success");
      setNotificationMessage("保存成功");
    }
    setNotificationSaving(false);
  };

  return (
    <div id="page-settings" className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />

        <div className="content-area">
          {/* Tab Bar */}
          {tabs.length > 0 && (
            <div className="tabs-wrapper">
              <div className="tabs-inner">
                {tabs.map((t) => (
                  <Link
                    key={t.key}
                    href={getTabHref(t.key)}
                    scroll={false}
                    className={`tab-btn${activeTab === t.key ? " active" : ""}`}
                  >
                    {t.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ---- Panel: 账号设置 ---- */}
          <div style={{ display: profileSettings && activeTab === "account" ? "block" : "none" }}>
            <AccountSettingsPanel />
          </div>

          {/* ---- Panel: 编辑资料 ---- */}
          <section className="settings-panel" style={{ display: profileSettings && activeTab === "profile" ? "block" : "none" }}>
            <h2 className="settings-panel-title">编辑资料</h2>
            <p className="settings-panel-desc">修改你在 Inkland 展示的头像、昵称和个人简介。</p>
            <div id="page-profile-edit" className="profile-edit-content">
              <ProfileEditForm />
            </div>
          </section>

          {/* ---- Panel: 修改密码 ---- */}
          <form
            className="settings-panel"
            autoComplete="off"
            onSubmit={(event) => { event.preventDefault(); void handlePasswordChange(); }}
            style={{ display: profileSettings && activeTab === "password" ? "block" : "none" }}
          >
            <h2 className="settings-panel-title">修改密码</h2>
            <p className="settings-panel-desc">请设置一个强密码，建议包含大小写字母、数字和特殊字符。</p>

            <div className="settings-form-group">
              <label htmlFor="settings-current-password" className="settings-form-label">当前密码</label>
              <input id="settings-current-password" name="settings-current-password" type="password" className="settings-form-input" placeholder="请输入当前密码" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>

            <div className="settings-form-group">
              <label htmlFor="settings-new-password" className="settings-form-label">新密码</label>
              <input id="settings-new-password" name="settings-new-password" type="password" className="settings-form-input" placeholder="请输入新密码" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <span className="settings-form-hint">至少 8 位，包含大小写字母和数字</span>
            </div>

            <div className="settings-form-group">
              <label htmlFor="settings-confirm-password" className="settings-form-label">确认新密码</label>
              <input id="settings-confirm-password" name="settings-confirm-password" type="password" className="settings-form-input" placeholder="请再次输入新密码" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>

            <div className="settings-form-actions">
              {passwordMessage && (
                <SettingsStatus kind={passwordMessageKind === "error" ? "error" : "success"} message={passwordMessage} />
              )}
              <button type="submit" className="settings-btn-save" disabled={passwordSaving}>
                <SiteIcon name="fa-check" variant="solid" aria-hidden="true" /> {passwordSaving ? "保存中…" : "保存修改"}
              </button>
            </div>
          </form>

          {/* ---- Panel: 屏蔽管理 (user card grid, 2 columns) ---- */}
          <div className="settings-panel" style={{ display: !profileSettings && !moreSettings && activeTab === "blocked" ? "block" : "none" }}>
            <div className="user-cards-grid">
              {blockedLoading ? <p className="text-sm text-muted">正在加载…</p> : blockedUsers.map((u) => (
                <div className="user-card" key={u.id}>
                  <div className="user-avatar"><DefaultAvatar name={u.name} /></div>
                  <div className="user-info">
                    <div className="user-name">{u.name}</div>
                    <div className="user-bio">{u.bio}</div>
                  </div>
                  <button className="btn-unblock" onClick={() => void unblockUser(u)}>取消屏蔽</button>
                </div>
              ))}
            </div>
            {!blockedLoading && blockedUsers.length === 0 && (
              <div className="empty-state settings-blocked-empty" role="status">
                <div className="empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <SiteIcon name="fa-user-shield" variant="solid" />
                    </div>
                  </div>
                </div>
                <h2 className="empty-title">还没有屏蔽任何用户</h2>
                <p className="empty-desc">查看和管理已屏蔽的用户，取消屏蔽后对方可再次与你互动。你屏蔽的用户会显示在这里。</p>
              </div>
            )}
          </div>

          {/* ---- Panel: 通知设置 ---- */}
          <div className="settings-panel" style={{ display: !profileSettings && !moreSettings && activeTab === "notifications" ? "block" : "none" }}>
            <h2 className="settings-panel-title">通知设置</h2>
            <p className="settings-panel-desc">只显示你希望接收的站内消息；设置会同步到当前账号。</p>

            {notificationPreferenceTypes.map((type: NotificationPreferenceType) => {
              const option = notificationPreferenceLabels[type];
              return (
                <div className="settings-toggle-row" key={type}>
                  <div>
                    <div className="settings-toggle-label">{option.label}</div>
                    <div className="settings-toggle-desc">{option.description}</div>
                  </div>
                  <label className="settings-toggle-switch" aria-label={option.label}>
                    <input
                      type="checkbox"
                      checked={notificationPreferences[type]}
                      onChange={(event) => setNotificationPreferences((current) => ({ ...current, [type]: event.target.checked }))}
                    />
                    <span className="settings-toggle-slider"></span>
                  </label>
                </div>
              );
            })}

            <div className="settings-form-actions settings-notification-actions">
              {notificationMessage && (
                <SettingsStatus kind={notificationMessageKind === "error" ? "error" : "success"} message={notificationMessage} />
              )}
              <button type="button" className="settings-btn-save" onClick={() => void handleNotificationPreferencesSave()} disabled={notificationSaving}>
                {notificationSaving ? "保存中…" : "保存设置"}
              </button>
            </div>
          </div>

          {/* ---- Panel: 关于我们 ---- */}
          <div className="settings-panel" style={{ display: moreSettings && activeTab === "about" ? "block" : "none" }}>
            {/* Logo + description — left-right layout */}
            <div className="settings-about-header">
              <div className="settings-about-logo-icon" />
              <div className="settings-about-text">
                <p className="settings-about-desc">
                  Inkland 是一个面向同人创作者的社区平台，致力于为创作者提供自由、开放、高质量的创作与交流空间。在这里，你可以发布作品、发现同好、参与活动，与志同道合的创作者一起成长。
                </p>
              </div>
            </div>

            <div className="settings-about-row">
              <span className="settings-about-label">版本号</span>
              <span className="settings-about-value">v0.0.1</span>
            </div>
            <div className="settings-about-row">
              <span className="settings-about-label">技术栈</span>
              <span className="settings-about-value">Next.js + React + Supabase</span>
            </div>
            <div className="settings-about-row">
              <span className="settings-about-label">开源许可</span>
              <span className="settings-about-value" style={{ fontWeight: 400, fontSize: "13px", color: "var(--color-text-muted)" }}>
                前端框架基于 Next.js（MIT License），UI 组件参考 Radix UI（MIT License），图标使用 FontAwesome 6（CC BY 4.0 / SIL OFL 1.1）。
              </span>
            </div>
            <div className="settings-about-row">
              <span className="settings-about-label">数据合规</span>
              <span className="settings-about-value" style={{ fontWeight: 400, fontSize: "13px", color: "var(--color-text-muted)" }}>
                数据处理、存储地域和用户权利说明将在正式上线前根据实际部署情况补充并审核。
              </span>
            </div>
            <div className="settings-about-row">
              <span className="settings-about-label">联系邮箱</span>
              <span className="settings-about-value" style={{ fontSize: "12px", color: "var(--color-primary)" }}>
                <a href={`mailto:${siteContactEmail}`} aria-label={`发送邮件至 ${siteContactEmail}`}>
                  {siteContactEmail}
                </a>
              </span>
            </div>
            <div className="settings-about-row">
              <span className="settings-about-label">服务条款</span>
              <span className="settings-about-value">
                <Link href="/terms" style={{ color: "var(--color-primary)" }}>查看详情</Link>
              </span>
            </div>
            <div className="settings-about-row">
              <span className="settings-about-label">隐私政策</span>
              <span className="settings-about-value">
                <Link href="/privacy" style={{ color: "var(--color-primary)" }}>查看详情</Link>
              </span>
            </div>
          </div>

          {/* ---- Panel: 联系我们 ---- */}
          <div className="settings-panel" style={{ display: moreSettings && activeTab === "contact" ? "block" : "none" }}>
            <h2 className="settings-panel-title">联系我们</h2>
            <p className="settings-panel-desc">有任何问题或建议？欢迎通过反馈表联系我们，也可以直接发送邮件。</p>

            {/* Multiple emails */}
            <div className="settings-contact-emails">
              <div className="settings-contact-row">
                <span className="settings-contact-label">客服邮箱</span>
                <a className="settings-contact-value" href={`mailto:${siteContactEmail}`}>{siteContactEmail}</a>
              </div>
              <div className="settings-contact-row">
                <span className="settings-contact-label">商务合作</span>
                <a className="settings-contact-value" href={`mailto:${siteContactEmail}`}>{siteContactEmail}</a>
              </div>
              <div className="settings-contact-row">
                <span className="settings-contact-label">反馈邮箱</span>
                <a className="settings-contact-value" href={`mailto:${siteContactEmail}`}>{siteContactEmail}</a>
              </div>
            </div>

            {/* Feedback form — custom styled select */}
            <h3 className="settings-subtitle">快速反馈</h3>
            <div className="settings-form-group">
              <label className="settings-form-label">反馈类型</label>
              <div className="settings-custom-select" ref={feedbackSelectRef} tabIndex={0} onClick={() => setFeedbackTypeOpen(!feedbackTypeOpen)}>
                <span className="settings-custom-select-text">{feedbackType}</span>
                <span className="settings-custom-select-arrow">
                  <SiteIcon name="fa-chevron-down" variant="solid" size={12} style={{ transform: feedbackTypeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                </span>
                {feedbackTypeOpen && (
                  <div className="settings-custom-select-dropdown">
                    {feedbackTypes.map((type) => (
                      <button
                        key={type}
                        className={`settings-custom-select-option${feedbackType === type ? " active" : ""}`}
                        onClick={(e) => { e.stopPropagation(); setFeedbackType(type); setFeedbackTypeOpen(false); }}
                      >
                        <span>{type}</span>
                        {feedbackType === type && (
                          <SiteIcon name="fa-check" variant="solid" size={14} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="settings-form-group">
              <label className="settings-form-label">反馈内容</label>
              <textarea
                className="settings-form-input settings-form-textarea"
                rows={4}
                placeholder="请详细描述你的问题或建议..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
              ></textarea>
            </div>

            <div className="settings-form-actions settings-feedback-actions">
              <button className="settings-btn-save" onClick={handleFeedbackSubmit} disabled={feedbackSubmitting}>
                <SiteIcon name={feedbackSubmitting ? "fa-spinner" : "fa-paper-plane"} variant="solid" className={feedbackSubmitting ? "animate-spin" : undefined} aria-hidden="true" /> {feedbackSubmitting ? "提交中…" : "提交反馈"}
              </button>
              {feedbackSuccess && (
                <SettingsStatus kind="success" message={feedbackSuccess} />
              )}

              {feedbackError && (
                <SettingsStatus kind="error" message={feedbackError} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsSectionPage({ section }: { section: SettingsSection }) {
  return (
    <Suspense fallback={<div className="feed-empty-state" role="status">正在加载设置…</div>}>
      <SettingsPageContent section={section} />
    </Suspense>
  );
}

export default function SettingsPage() {
  return <SettingsSectionPage section="privacy" />;
}
