"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HomeSidebar from "@/components/HomeSidebar";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/browser";

type SettingsTab = "password" | "blocked" | "notifications" | "about" | "contact";

const siteContactEmail = "inkland@163.com";

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("password");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackType, setFeedbackType] = useState("功能建议");
  const [feedbackTypeOpen, setFeedbackTypeOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const feedbackSelectRef = useRef<HTMLDivElement>(null);
  const [blockedUsers, setBlockedUsers] = useState<Array<{ id: string; blockedUserId: string; name: string; bio: string; color: string; textColor: string; initial: string }>>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const feedbackTypes = ["功能建议", "Bug 报告", "内容举报", "其他问题"];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (feedbackSelectRef.current && !feedbackSelectRef.current.contains(e.target as Node)) {
        setFeedbackTypeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "password", label: "修改密码" },
    { key: "blocked", label: "屏蔽管理" },
    { key: "notifications", label: "通知设置" },
    { key: "about", label: "关于我们" },
    { key: "contact", label: "联系我们" },
  ];

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
                    <i className="fa-solid fa-gear"></i>
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

  useEffect(() => {
    if (!user || activeTab !== "blocked") return;
    let active = true;
    setBlockedLoading(true);
    void (async () => {
      const { data: blocked } = await supabase
        .from("blocked_users")
        .select("id, blocked_user_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const ids = (blocked || []).map((row) => row.blocked_user_id as string);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, nickname, bio").in("id", ids)
        : { data: [] };
      if (!active) return;
      const profileMap = new Map((profiles || []).map((item) => [item.id, item]));
      setBlockedUsers((blocked || []).map((row) => {
        const blockedProfile = profileMap.get(row.blocked_user_id as string);
        const name = blockedProfile?.nickname || "已注销用户";
        return {
          id: row.id as string,
          blockedUserId: row.blocked_user_id as string,
          name,
          bio: `屏蔽于 ${new Date(row.created_at as string).toLocaleDateString("zh-CN")}`,
          color: "linear-gradient(135deg, #E8E4E0, #B8B0A8)",
          textColor: "#5C554E",
          initial: name.slice(0, 1),
        };
      }));
      setBlockedLoading(false);
    })();
    return () => { active = false; };
  }, [activeTab, supabase, user]);

  const unblockUser = async (blocked: { id: string }) => {
    const { error } = await supabase.from("blocked_users").delete().eq("id", blocked.id);
    if (!error) setBlockedUsers((items) => items.filter((item) => item.id !== blocked.id));
  };

  const handlePasswordChange = async () => {
    setPasswordMessage("");
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
      setPasswordMessage("请确认当前密码、新密码和确认密码填写正确；新密码至少 8 位。");
      return;
    }
    setPasswordSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email || "", password: currentPassword });
    if (verifyError) {
      setPasswordMessage("当前密码不正确，请检查后重试。");
      setPasswordSaving(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
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

  return (
    <div id="page-settings" className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />

        <div className="content-area">
          {/* Page Header */}
          <div className="page-header">
            <h1 className="page-title">我的设置</h1>
          </div>

          {/* Tab Bar */}
          <div className="tabs-wrapper">
            <div className="tabs-inner">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  className={`tab-btn${activeTab === t.key ? " active" : ""}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ---- Panel: 修改密码 ---- */}
          <form
            className="settings-panel"
            autoComplete="off"
            onSubmit={(event) => { event.preventDefault(); void handlePasswordChange(); }}
            style={{ display: activeTab === "password" ? "block" : "none" }}
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

            {passwordMessage && <p className="text-sm text-muted mb-4" role="status">{passwordMessage}</p>}
            <button type="submit" className="settings-btn-save" disabled={passwordSaving}>
              <i className="fa-solid fa-check" aria-hidden="true"></i> {passwordSaving ? "保存中…" : "保存修改"}
            </button>
          </form>

          {/* ---- Panel: 屏蔽管理 (user card grid, 2 columns) ---- */}
          <div className="settings-panel" style={{ display: activeTab === "blocked" ? "block" : "none" }}>
            <div className="user-cards-grid">
              {blockedLoading ? <p className="text-sm text-muted">正在加载…</p> : blockedUsers.map((u) => (
                <div className="user-card" key={u.id}>
                  <div className="user-avatar" style={{ background: u.color, color: u.textColor }}>{u.initial}</div>
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
                      <i className="fa-solid fa-user-shield"></i>
                    </div>
                  </div>
                </div>
                <h2 className="empty-title">还没有屏蔽任何用户</h2>
                <p className="empty-desc">查看和管理已屏蔽的用户，取消屏蔽后对方可再次与你互动。你屏蔽的用户会显示在这里。</p>
              </div>
            )}
          </div>

          {/* ---- Panel: 通知设置 (all toggles default ON) ---- */}
          <div className="settings-panel" style={{ display: activeTab === "notifications" ? "block" : "none" }}>
            <h2 className="settings-panel-title">通知设置</h2>
            <p className="settings-panel-desc">选择你希望接收的通知类型，保持对重要动态的关注。</p>

            <div className="settings-toggle-row">
              <div>
                <div className="settings-toggle-label">新作品通知</div>
                <div className="settings-toggle-desc">关注作者发布新作品时通知</div>
              </div>
              <label className="settings-toggle-switch" aria-label="新作品通知">
                <input type="checkbox" defaultChecked />
                <span className="settings-toggle-slider"></span>
              </label>
            </div>

            <div className="settings-toggle-row">
              <div>
                <div className="settings-toggle-label">评论通知</div>
                <div className="settings-toggle-desc">有人评论你的作品时通知</div>
              </div>
              <label className="settings-toggle-switch" aria-label="评论通知">
                <input type="checkbox" defaultChecked />
                <span className="settings-toggle-slider"></span>
              </label>
            </div>

            <div className="settings-toggle-row">
              <div>
                <div className="settings-toggle-label">点赞通知</div>
                <div className="settings-toggle-desc">有人点赞你的作品或评论时通知</div>
              </div>
              <label className="settings-toggle-switch" aria-label="点赞通知">
                <input type="checkbox" defaultChecked />
                <span className="settings-toggle-slider"></span>
              </label>
            </div>

            <div className="settings-toggle-row">
              <div>
                <div className="settings-toggle-label">系统通知</div>
                <div className="settings-toggle-desc">平台公告、活动信息和系统消息</div>
              </div>
              <label className="settings-toggle-switch" aria-label="系统通知">
                <input type="checkbox" defaultChecked />
                <span className="settings-toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* ---- Panel: 关于我们 ---- */}
          <div className="settings-panel" style={{ display: activeTab === "about" ? "block" : "none" }}>
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
          <div className="settings-panel" style={{ display: activeTab === "contact" ? "block" : "none" }}>
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
                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: feedbackTypeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                    <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
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
                          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
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

            {/* Success message */}
            {feedbackSuccess && (
              <div className="settings-feedback-notice settings-feedback-success" role="status">
                <span className="success-toast-icon">
                  <i className="fa-solid fa-circle-check"></i>
                </span>
                <span className="success-toast-text">{feedbackSuccess}</span>
              </div>
            )}

            {feedbackError && <div className="settings-feedback-notice settings-feedback-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedbackError}</div>}

            <button className="settings-btn-save" onClick={handleFeedbackSubmit} disabled={feedbackSubmitting}>
              <i className={`fa-solid ${feedbackSubmitting ? "fa-spinner fa-spin" : "fa-paper-plane"}`} aria-hidden="true"></i> {feedbackSubmitting ? "提交中…" : "提交反馈"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
