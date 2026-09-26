"use client";
import SiteIcon from "@/components/SiteIcon";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import HomeSidebar from "@/components/HomeSidebar";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/browser";
import { getPublicProfileBios } from "@/lib/profile-privacy";
import ProfileEditForm from "@/components/ProfileEditForm";
import AccountSettingsPanel from "@/components/AccountSettingsPanel";
import UserCard from "@/components/UserCard";
import ProfileFilterSelect from "@/components/ProfileFilterSelect";
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

type SettingsTab = "account" | "profile" | "password" | "blocked" | "notifications" | "privacy" | "about" | "contact";
export type SettingsSection = "privacy" | "profile" | "about" | "contact";

type InteractionPermission = "everyone" | "followers" | "off";

type PrivacyPreferences = {
  show_gender: boolean;
  show_profile_info: boolean;
  show_likes: boolean;
  show_bookmarks: boolean;
  show_follow_lists: boolean;
  allow_follows: boolean;
  comment_permission: InteractionPermission;
  reply_permission: InteractionPermission;
};

const defaultPrivacyPreferences: PrivacyPreferences = {
  show_gender: false,
  show_profile_info: true,
  show_likes: false,
  show_bookmarks: false,
  show_follow_lists: false,
  allow_follows: true,
  comment_permission: "everyone",
  reply_permission: "everyone",
};

const interactionPermissionOptions: Array<{ value: InteractionPermission; label: string }> = [
  { value: "everyone", label: "所有人" },
  { value: "followers", label: "仅关注者" },
  { value: "off", label: "关闭" },
];

const localSettingsPreviewUser = {
  id: "local-settings-preview",
  email: "preview@inkland.local",
  user_metadata: {},
} as unknown as User;

function parseSettingsTab(value: string | null): SettingsTab | null {
  return value === "account" || value === "profile" || value === "password" || value === "blocked" || value === "notifications" || value === "privacy" || value === "about" || value === "contact"
    ? value
    : null;
}

const profileSettingsTabKeys: SettingsTab[] = ["account", "profile", "password"];

const siteContactEmail = "inkland@163.com";
const feedbackMinimumLength = 2;
const feedbackMaximumLength = 5000;

type BlockedUserRow = { id: string; blocked_user_id: string; created_at: string };
type BlockedProfileRow = { id: string; nickname: string | null; avatar_url: string | null; show_profile_info: boolean };

function isTabForSection(tab: SettingsTab | null, section: SettingsSection): tab is SettingsTab {
  if (!tab) return false;
  if (section === "profile") return profileSettingsTabKeys.includes(tab);
  if (section === "privacy") return tab === "blocked" || tab === "notifications" || tab === "privacy";
  return tab === section;
}

function defaultTabForSection(section: SettingsSection): SettingsTab {
  if (section === "profile") return "account";
  if (section === "about") return "about";
  if (section === "contact") return "contact";
  return "blocked";
}

function SettingsPageTitle({ section }: { section: SettingsSection }) {
  const title = section === "privacy"
    ? "设置和隐私"
    : section === "profile"
      ? "个人资料"
      : section === "about"
        ? "关于我们"
        : "联系我们";
  return title ? <div className="page-header"><h1 className="page-title">{title}</h1></div> : null;
}

function SettingsPageContent({ section }: { section: SettingsSection }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: authenticatedUser, loading: contextAuthLoading } = useAuth();
  const isLocalPreview = process.env.NODE_ENV === "development" && searchParams.get("preview") === "1";
  const user = isLocalPreview ? localSettingsPreviewUser : authenticatedUser;
  const authLoading = isLocalPreview ? false : contextAuthLoading;
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackType, setFeedbackType] = useState("功能建议");
  const [feedbackTypeOpen, setFeedbackTypeOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const feedbackSelectRef = useRef<HTMLDivElement>(null);
  const [blockedUsers, setBlockedUsers] = useState<Array<{ id: string; blockedUserId: string; name: string; avatarUrl: string | null; bio: string | null; showProfileInfo: boolean }>>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordMessageKind, setPasswordMessageKind] = useState<"success" | "error" | "">("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationMessageKind, setNotificationMessageKind] = useState<"success" | "error" | "">("");
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [privacyPreferences, setPrivacyPreferences] = useState<PrivacyPreferences>(defaultPrivacyPreferences);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyLoadError, setPrivacyLoadError] = useState(false);
  const [privacyLoadedUserId, setPrivacyLoadedUserId] = useState<string | null>(null);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [privacyMessageKind, setPrivacyMessageKind] = useState<"success" | "error" | "">("");

  const feedbackTypes = ["功能建议", "Bug 报告", "内容举报", "其他问题"];
  const feedbackCharacterCount = feedbackText.length;
  const trimmedFeedbackCharacterCount = Array.from(feedbackText.trim()).length;
  const feedbackCanSubmit = trimmedFeedbackCharacterCount >= feedbackMinimumLength
    && feedbackCharacterCount <= feedbackMaximumLength;
  const requestedTab = parseSettingsTab(searchParams.get("tab"));
  const activeTab = isTabForSection(requestedTab, section) ? requestedTab : defaultTabForSection(section);
  const privacyReady = Boolean(user && privacyLoadedUserId === user.id);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (feedbackSelectRef.current && !feedbackSelectRef.current.contains(event.target as Node)) {
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
    if (!user || section !== "privacy") return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setPrivacyLoading(true);
      setPrivacyLoadError(false);
      setPrivacyMessage("");
      setPrivacyMessageKind("");
      if (isLocalPreview) {
        setPrivacyPreferences(defaultPrivacyPreferences);
        setPrivacyLoadedUserId(user.id);
        setPrivacyLoading(false);
        return;
      }
      void (async () => {
        try {
          const result = await supabase
            .rpc("get_own_settings_privacy") as unknown as { data: Partial<PrivacyPreferences> | null; error: { message: string } | null };
          if (!active) return;
          if (result.error) {
            setPrivacyLoadError(true);
            setPrivacyMessageKind("error");
            setPrivacyMessage("隐私设置加载失败，请刷新页面重试。若问题持续，请联系支持。");
          } else {
            setPrivacyPreferences({
              show_gender: result.data?.show_gender ?? defaultPrivacyPreferences.show_gender,
              show_profile_info: result.data?.show_profile_info ?? defaultPrivacyPreferences.show_profile_info,
              show_likes: result.data?.show_likes ?? defaultPrivacyPreferences.show_likes,
              show_bookmarks: result.data?.show_bookmarks ?? defaultPrivacyPreferences.show_bookmarks,
              show_follow_lists: result.data?.show_follow_lists ?? defaultPrivacyPreferences.show_follow_lists,
              allow_follows: result.data?.allow_follows ?? defaultPrivacyPreferences.allow_follows,
              comment_permission: result.data?.comment_permission ?? defaultPrivacyPreferences.comment_permission,
              reply_permission: result.data?.reply_permission ?? defaultPrivacyPreferences.reply_permission,
            });
          }
          setPrivacyLoadedUserId(user.id);
        } catch {
          if (!active) return;
          setPrivacyLoadError(true);
          setPrivacyMessageKind("error");
          setPrivacyMessage("隐私设置加载失败，请刷新页面重试。若问题持续，请联系支持。");
          setPrivacyLoadedUserId(user.id);
        } finally {
          if (active) setPrivacyLoading(false);
        }
      })();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [isLocalPreview, section, supabase, user]);

  useEffect(() => {
    if (!user || section !== "privacy" || activeTab !== "blocked") return;
    let active = true;
    if (isLocalPreview) {
      const previewTimer = window.setTimeout(() => {
        if (!active) return;
        setBlockedUsers([
          { id: "preview-block-1", blockedUserId: "preview-user-1", name: "夜航星", avatarUrl: null, bio: "喜欢写作与阅读。", showProfileInfo: true },
          { id: "preview-block-2", blockedUserId: "preview-user-2", name: "山茶未眠", avatarUrl: null, bio: "在这里记录一些故事。", showProfileInfo: true },
        ]);
        setBlockedLoading(false);
      }, 0);
      return () => { active = false; window.clearTimeout(previewTimer); };
    }
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
        ? await supabase.from("profiles").select("id, nickname, avatar_url, show_profile_info").in("id", ids)
        : { data: [] };
      if (!active) return;
      const profileRows = (profiles || []) as BlockedProfileRow[];
      const bios = await getPublicProfileBios(supabase, profileRows.map((profile) => profile.id));
      if (!active) return;
      const profileMap = new Map(profileRows.map((item) => [item.id, item]));
      setBlockedUsers(blockedRows.map((row) => {
        const blockedProfile = profileMap.get(row.blocked_user_id);
        const name = blockedProfile?.nickname || "已注销用户";
        return {
          id: row.id,
          blockedUserId: row.blocked_user_id,
          name,
          avatarUrl: blockedProfile?.avatar_url || null,
          bio: blockedProfile ? bios.get(blockedProfile.id) || null : null,
          showProfileInfo: blockedProfile?.show_profile_info ?? true,
        };
      }));
      setBlockedLoading(false);
    })();
    return () => { active = false; };
  }, [activeTab, isLocalPreview, section, supabase, user]);

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
        { key: "privacy", label: "隐私设置" },
      ];

  const getTabHref = (tab: SettingsTab) => {
    const basePath = section === "profile" ? "/profile-settings" : "/settings";
    return `${basePath}?tab=${tab}${isLocalPreview ? "&preview=1" : ""}`;
  };

  if (authLoading) {
    return (
      <div id="page-settings" className="min-h-screen bg-paper pb-20 lg:pb-0">
        <div className="main-container">
          <HomeSidebar />
          <div className="content-area">
            <SettingsPageTitle section={section} />
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
            <SettingsPageTitle section={section} />
            <div className="feed-empty-state">
              <div className="feed-empty-illustration">
                <div className="feed-empty-tag-ring">
                  <div className="feed-empty-ring-outer"></div>
                  <div className="feed-empty-ring-inner">
                    <SiteIcon name="fa-gear" variant="solid" />
                  </div>
                </div>
              </div>
              <h2 className="feed-empty-title">{moreSettings ? "登录后查看此页面" : "登录后查看设置"}</h2>
              <p className="feed-empty-desc">{moreSettings ? "登录后即可查看页面内容。" : "登录后即可管理你的账户设置"}</p>
              <Link href="/login" className="feed-empty-action">登录</Link>
              <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleFeedbackSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = feedbackText.trim();
    const contentLength = content.length;
    const contentCharacterCount = Array.from(content).length;
    if (contentCharacterCount < feedbackMinimumLength) {
      setFeedbackError("请至少填写 2 个字符的反馈内容。");
      return;
    }
    if (contentLength > feedbackMaximumLength) {
      setFeedbackError("反馈内容不能超过 5000 个字符。");
      return;
    }
    setFeedbackError("");
    setFeedbackSuccess("");
    setFeedbackSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: feedbackType, content }),
      });
      const result = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
      if (!response.ok || !result?.success) {
        setFeedbackError(result?.error || "反馈暂时提交失败，请稍后再试。");
        return;
      }
      setFeedbackSuccess("反馈已成功提交，感谢你的建议！");
      setFeedbackText("");
    } catch {
      setFeedbackError("网络连接异常，反馈尚未提交。请检查网络后重试。");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleFeedbackTextChange = (value: string) => {
    let limitedValue = value.slice(0, feedbackMaximumLength);
    const lastCodeUnit = limitedValue.charCodeAt(limitedValue.length - 1);
    if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
      limitedValue = limitedValue.slice(0, -1);
    }
    setFeedbackText(limitedValue);
    setFeedbackError("");
    setFeedbackSuccess("");
  };

  const handlePasswordChange = async () => {
    setPasswordMessage("");
    setPasswordMessageKind("");
    const nextFieldErrors = {
      currentPassword: currentPassword ? "" : "请输入当前密码。",
      newPassword: !newPassword ? "请输入新密码。" : newPassword.length < 8 ? "新密码至少需要 8 位。" : "",
      confirmPassword: !confirmPassword ? "请再次输入新密码。" : newPassword !== confirmPassword ? "两次输入的新密码不一致。" : "",
    };
    setPasswordFieldErrors(nextFieldErrors);
    if (Object.values(nextFieldErrors).some(Boolean)) {
      return;
    }
    setPasswordSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email || "", password: currentPassword });
    if (verifyError) {
      setPasswordFieldErrors((current) => ({ ...current, currentPassword: "当前密码不正确，请检查后重试。" }));
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
      setPasswordFieldErrors({ currentPassword: "", newPassword: "", confirmPassword: "" });
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
    if (isLocalPreview) {
      setNotificationMessageKind("success");
      setNotificationMessage("本地预览已更新，没有写入账号。");
      setNotificationSaving(false);
      return;
    }
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

  const handlePrivacyPreferencesSave = async () => {
    if (!user || !privacyReady || privacyLoadError || privacySaving || privacyLoading) return;
    setPrivacySaving(true);
    setPrivacyMessage("");
    setPrivacyMessageKind("");
    if (isLocalPreview) {
      setPrivacyMessageKind("success");
      setPrivacyMessage("本地预览已更新，没有写入账号。");
      setPrivacySaving(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update(privacyPreferences)
      .eq("id", user.id);
    if (error) {
      setPrivacyMessageKind("error");
      setPrivacyMessage("隐私设置保存失败，请稍后重试。若问题持续，请联系支持。");
    } else {
      setPrivacyMessageKind("success");
      setPrivacyMessage("保存成功");
    }
    setPrivacySaving(false);
  };

  return (
    <div id="page-settings" className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />

        <div className="content-area">
          <SettingsPageTitle section={section} />
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
            <div className="profile-password-module">
              <div className="settings-form-group">
                <label htmlFor="settings-current-password" className="settings-form-label">当前密码</label>
                <input id="settings-current-password" name="settings-current-password" type="password" className={`settings-form-input${passwordFieldErrors.currentPassword ? " error" : ""}`} placeholder="请输入当前密码" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-invalid={Boolean(passwordFieldErrors.currentPassword)} aria-describedby={passwordFieldErrors.currentPassword ? "settings-current-password-error" : undefined} value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setPasswordFieldErrors((current) => ({ ...current, currentPassword: "" })); }} />
                {passwordFieldErrors.currentPassword && <span id="settings-current-password-error" className="settings-field-error" role="alert">{passwordFieldErrors.currentPassword}</span>}
              </div>

              <div className="settings-form-group">
                <label htmlFor="settings-new-password" className="settings-form-label">新密码</label>
                <input id="settings-new-password" name="settings-new-password" type="password" className={`settings-form-input${passwordFieldErrors.newPassword ? " error" : ""}`} placeholder="请输入新密码" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-invalid={Boolean(passwordFieldErrors.newPassword)} aria-describedby={passwordFieldErrors.newPassword ? "settings-new-password-error" : "settings-new-password-hint"} value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordFieldErrors((current) => ({ ...current, newPassword: "", confirmPassword: "" })); }} />
                {passwordFieldErrors.newPassword && <span id="settings-new-password-error" className="settings-field-error" role="alert">{passwordFieldErrors.newPassword}</span>}
                <span id="settings-new-password-hint" className="settings-form-hint">至少 8 位，包含大小写字母和数字</span>
              </div>

              <div className="settings-form-group">
                <label htmlFor="settings-confirm-password" className="settings-form-label">确认新密码</label>
                <input id="settings-confirm-password" name="settings-confirm-password" type="password" className={`settings-form-input${passwordFieldErrors.confirmPassword ? " error" : ""}`} placeholder="请再次输入新密码" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-invalid={Boolean(passwordFieldErrors.confirmPassword)} aria-describedby={passwordFieldErrors.confirmPassword ? "settings-confirm-password-error" : undefined} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordFieldErrors((current) => ({ ...current, confirmPassword: "" })); }} />
                {passwordFieldErrors.confirmPassword && <span id="settings-confirm-password-error" className="settings-field-error" role="alert">{passwordFieldErrors.confirmPassword}</span>}
              </div>
            </div>

            <div className="settings-form-actions">
              {passwordMessage && (
                <SettingsStatus kind={passwordMessageKind === "error" ? "error" : "success"} message={passwordMessage} />
              )}
              <button type="submit" className="settings-btn-save" disabled={passwordSaving}>
                {passwordSaving ? "保存中…" : "保存修改"}
              </button>
            </div>
          </form>

          {/* ---- Panel: 屏蔽管理 (user card grid, 2 columns) ---- */}
          <div className="settings-panel" style={{ display: !profileSettings && !moreSettings && activeTab === "blocked" ? "block" : "none" }}>
            <div className="user-cards-grid">
              {blockedLoading ? <p className="text-sm text-muted">正在加载…</p> : blockedUsers.map((u) => (
                <UserCard
                  key={u.id}
                  user={{ id: u.blockedUserId, nickname: u.name, avatar_url: u.avatarUrl, bio: u.bio, show_profile_info: u.showProfileInfo }}
                  currentUserId={user.id}
                  isFollowingTab={false}
                  variant="blocked"
                  blockedRecordId={u.id}
                  onUpdate={() => setBlockedUsers((items) => items.filter((item) => item.id !== u.id))}
                />
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
          <div className="settings-panel settings-surface-panel" style={{ display: !profileSettings && !moreSettings && activeTab === "notifications" ? "block" : "none" }}>
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

          {/* ---- Panel: 隐私设置 ---- */}
          <div className="settings-panel settings-surface-panel" style={{ display: !profileSettings && !moreSettings && activeTab === "privacy" ? "block" : "none" }}>
            <div aria-live="polite" aria-busy={privacyLoading}>
              {privacyLoading || !privacyReady ? (
                <p className="settings-toggle-desc" role="status">正在加载隐私设置…</p>
              ) : privacyLoadError ? (
                <SettingsStatus kind="error" message={privacyMessage} />
              ) : (
                <>
                  {([
                    ["show_gender", "显示性别", "在公开个人主页显示你在资料编辑中选择的性别；选择“保密”时不会显示。"],
                    ["show_profile_info", "显示个人简介", "控制公开个人主页中的简介展示。昵称和头像仍用于识别你的账号。"],
                    ["show_likes", "显示喜欢", "允许访客查看你点过喜欢的公开作品。"],
                    ["show_bookmarks", "显示收藏", "允许访客查看你收藏的公开作品。"],
                    ["show_follow_lists", "公开关注和粉丝列表", "允许其他人查看你的关注列表和粉丝列表。"],
                    ["allow_follows", "允许别人关注我", "关闭后，其他用户不能新关注你；现有关注关系不受影响。"],
                  ] as const).map(([key, label, description]) => (
                    <div className="settings-toggle-row" key={key}>
                      <div className="settings-toggle-copy">
                        <div className="settings-toggle-label">{label}</div>
                        <div className="settings-toggle-desc">{description}</div>
                      </div>
                      <label className="settings-toggle-switch" aria-label={label}>
                        <input
                          type="checkbox"
                          checked={privacyPreferences[key]}
                          onChange={(event) => setPrivacyPreferences((current) => ({ ...current, [key]: event.target.checked }))}
                        />
                        <span className="settings-toggle-slider"></span>
                      </label>
                    </div>
                  ))}
                  {([
                    ["comment_permission", "谁可以评论我的作品", "设置其他人能否在你的作品下发表评论。"],
                    ["reply_permission", "谁可以回复我的评论", "设置其他人能否回复你发布的评论。"],
                  ] as const).map(([key, label, description]) => (
                    <div className="settings-toggle-row settings-choice-row" key={key}>
                      <div className="settings-toggle-copy">
                        <div className="settings-toggle-label">{label}</div>
                        <div className="settings-toggle-desc">{description}</div>
                      </div>
                      <div className="settings-choice-select">
                        <ProfileFilterSelect
                          label={label}
                          value={privacyPreferences[key]}
                          options={interactionPermissionOptions}
                          id={`settings-privacy-${key}`}
                          onChange={(value) => setPrivacyPreferences((current) => ({ ...current, [key]: value as InteractionPermission }))}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="settings-form-actions settings-privacy-actions">
                    {privacyMessage && <SettingsStatus kind={privacyMessageKind === "error" ? "error" : "success"} message={privacyMessage} />}
                    <button type="button" className="settings-btn-save" onClick={() => void handlePrivacyPreferencesSave()} disabled={privacySaving}>
                      {privacySaving ? "保存中…" : "保存设置"}
                    </button>
                  </div>
                </>
              )}
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
              <span className="settings-about-label">数据合规</span>
              <span className="settings-about-value" style={{ fontWeight: 400, fontSize: "13px", color: "var(--color-text-muted)" }}>
                个人信息处理方式与用户权利说明见 <Link href="/privacy" style={{ color: "var(--color-primary)" }}>隐私政策</Link>。
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

            {/* Feedback form */}
            <h3 className="settings-subtitle">快速反馈</h3>
            <form className="settings-feedback-form" onSubmit={handleFeedbackSubmit} aria-busy={feedbackSubmitting}>
              <div className="settings-form-group">
                <label className="settings-form-label">反馈类型</label>
                <div className="settings-custom-select" ref={feedbackSelectRef} tabIndex={0} onClick={() => setFeedbackTypeOpen(!feedbackTypeOpen)}>
                  <span className="settings-custom-select-text">{feedbackType}</span>
                  <span className="settings-custom-select-arrow">
                    <SiteIcon name="fa-chevron-down" variant="solid" size={12} style={{ transform: feedbackTypeOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
                  </span>
                  {feedbackTypeOpen && (
                    <div className="settings-custom-select-dropdown">
                      {feedbackTypes.map((type) => (
                        <button
                          key={type}
                          type="button"
                          className={`settings-custom-select-option${feedbackType === type ? " active" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setFeedbackType(type);
                            setFeedbackTypeOpen(false);
                            setFeedbackError("");
                            setFeedbackSuccess("");
                          }}
                        >
                          <span>{type}</span>
                          {feedbackType === type && <SiteIcon name="fa-check" variant="solid" size={14} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="settings-form-group">
                <label className="settings-form-label" htmlFor="contact-feedback-content">反馈内容</label>
                {/* The API counts JavaScript string units too; keep the visible limit aligned and avoid splitting a surrogate pair. */}
                <textarea
                  id="contact-feedback-content"
                  className="settings-form-input settings-form-textarea"
                  rows={4}
                  required
                  minLength={feedbackMinimumLength}
                  maxLength={feedbackMaximumLength}
                  aria-describedby="contact-feedback-hint contact-feedback-count"
                  aria-invalid={feedbackCharacterCount > 0 && !feedbackCanSubmit}
                  disabled={feedbackSubmitting}
                  placeholder="请详细描述你的问题或建议..."
                  value={feedbackText}
                  onChange={(e) => handleFeedbackTextChange(e.target.value)}
                />
                <div className="settings-feedback-meta">
                  <span className="settings-form-hint" id="contact-feedback-hint">需填写 2–5000 个字符；emoji 按 2 个上限单位计。</span>
                  <span className="settings-feedback-count" id="contact-feedback-count">{feedbackCharacterCount} / {feedbackMaximumLength}</span>
                </div>
              </div>

              <div className="settings-form-actions settings-feedback-actions">
                {feedbackSuccess && <SettingsStatus kind="success" message={feedbackSuccess} />}
                {feedbackError && <SettingsStatus kind="error" message={feedbackError} />}
                <button className="settings-btn-save" type="submit" disabled={feedbackSubmitting || !feedbackCanSubmit}>
                  {feedbackSubmitting ? "提交中…" : "提交反馈"}
                </button>
              </div>
            </form>
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
