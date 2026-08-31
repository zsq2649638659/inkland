"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";

type Mode = "login" | "register";
type StatusType = "error" | "success" | "info" | null;

interface StatusMsg {
  type: StatusType;
  message: string;
}

function withTimeout<T>(promise: PromiseLike<T>, milliseconds = 15000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), milliseconds);
    }),
  ]) as Promise<T>;
}

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMsg>({ type: null, message: "" });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [authTimeout, setAuthTimeout] = useState(false);
  const [authActionInProgress, setAuthActionInProgress] = useState(false);

  const getNextPath = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  };

  // 本地超时保护：如果 authLoading 超过 3 秒，强制显示表单
  useEffect(() => {
    const timer = window.setTimeout(() => setAuthTimeout(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // 已登录用户自动跳转（保留 next 参数）
  useEffect(() => {
    if (!authLoading && user && !authActionInProgress) {
      router.replace(getNextPath());
    }
  }, [user, authLoading, authActionInProgress, router]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "register") setMode("register");
  }, []);

  const clearStatus = () => setStatus({ type: null, message: "" });

  const handleLogin = async () => {
    if (!email.trim()) {
      setStatus({ type: "error", message: "请输入邮箱地址" });
      return;
    }
    if (!password) {
      setStatus({ type: "error", message: "请输入密码" });
      return;
    }

    setLoading(true);
    setAuthActionInProgress(true);
    clearStatus();

    let error: { message: string } | null = null;
    try {
      const result = await withTimeout<Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>>(supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      }));
      ({ error } = result);
    } catch (requestError) {
      setStatus({ type: "error", message: requestError instanceof Error && requestError.message === "REQUEST_TIMEOUT" ? "连接服务器超时，请检查网络或稍后重试" : "登录请求失败，请稍后重试" });
      setLoading(false);
      setAuthActionInProgress(false);
      return;
    }

    if (error) {
      setStatus({
        type: "error",
        message:
          error.message === "Invalid login credentials"
            ? "邮箱或密码错误，请检查后重试"
            : error.message === "Email not confirmed"
              ? "邮箱尚未验证，请先检查邮箱并点击确认链接"
              : error.message.includes("email") || error.message.includes("Email")
                ? "邮箱格式不正确，请检查后重试"
                : "登录失败，请稍后重试",
      });
      setLoading(false);
      setAuthActionInProgress(false);
      return;
    }

    // 不在这里抢先导航：等待 AuthProvider 收到 SIGNED_IN 并更新 user 后，
    // 上面的 effect 再跳转，避免首次登录时被保护路由当成未登录。
    setLoading(false);
    setAuthActionInProgress(false);
  };

  const handleRegister = async () => {
    if (!nickname.trim()) {
      setStatus({ type: "error", message: "请输入昵称" });
      return;
    }
    if (!email.trim()) {
      setStatus({ type: "error", message: "请输入邮箱地址" });
      return;
    }
    if (!password || password.length < 6) {
      setStatus({ type: "error", message: "密码至少需要 6 位字符" });
      return;
    }
    if (!agreeTerms) {
      setStatus({ type: "error", message: "请先阅读并同意用户协议和隐私政策" });
      return;
    }

    setLoading(true);
    setAuthActionInProgress(true);
    clearStatus();

    let data: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"];
    let error: Awaited<ReturnType<typeof supabase.auth.signUp>>["error"];
    try {
      const result = await withTimeout<Awaited<ReturnType<typeof supabase.auth.signUp>>>(supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: nickname.trim() },
        },
      }));
      ({ data, error } = result);
    } catch (requestError) {
      setStatus({ type: "error", message: requestError instanceof Error && requestError.message === "REQUEST_TIMEOUT" ? "连接服务器超时，请检查网络或稍后重试" : "注册请求失败，请稍后重试" });
      setLoading(false);
      setAuthActionInProgress(false);
      return;
    }

    if (error) {
      setStatus({
        type: "error",
        message:
          error.message === "User already registered"
            ? "该邮箱已被注册，请直接登录或使用其他邮箱"
            : error.message === "Password should be at least 6 characters"
              ? "密码至少需要 6 位字符"
              : error.message.includes("email") || error.message.includes("Email")
                ? "邮箱格式不正确，请检查后重试"
                : "注册失败，请稍后重试",
      });
      setLoading(false);
      setAuthActionInProgress(false);
      return;
    }

    if (data.user) {
      // 检查 identities：如果为空数组，说明该邮箱已注册
      if (data.user.identities && data.user.identities.length === 0) {
        setStatus({
          type: "error",
          message: "该邮箱已被注册，请直接登录或使用其他邮箱",
        });
        setLoading(false);
        return;
      }

      if (data.session) {
        // 邮箱确认已关闭，直接有 session
        await supabase.from("profiles").insert({
          id: data.user.id,
          nickname: nickname.trim(),
        });
        // 与登录保持一致，等 AuthProvider 完成 user 更新后再导航。
        setAuthActionInProgress(false);
      } else {
        // 需要邮箱确认
        setStatus({
          type: "success",
          message: "注册成功！我们已向你的邮箱发送了一封验证邮件，请点击邮件中的链接完成验证后再登录。",
        });
        setMode("login");
        setPassword("");
        setAuthActionInProgress(false);
      }
    }
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") handleLogin();
    else handleRegister();
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    clearStatus();
  };

  const statusIcon = {
    error: "fa-circle-exclamation",
    success: "fa-circle-check",
    info: "fa-circle-info",
  };

  const statusClass = {
    error: "auth-status-error",
    success: "auth-status-success",
    info: "auth-status-info",
  };

  return (
    <>
      {authLoading && !authTimeout ? (
        <div className="auth-page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="auth-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : (
      <div className="auth-page">
        <div className="auth-card-v2">
        {/* ===== Left Panel — Form ===== */}
        <div className="auth-form-panel">
          {/* Header */}
          <div className="auth-form-header">
            <div className="auth-logo">
              <span className="auth-logo-icon" />
            </div>
            <div className="auth-form-heading">
              <div className="auth-form-title">
                {mode === "login" ? "欢迎回来" : "加入 inkland"}
              </div>
              <div className="auth-form-subtitle">
                {mode === "login"
                  ? "登录你的账号，继续创作之旅"
                  : "创建一个账号，开始你的同人创作之旅"}
              </div>
            </div>
          </div>

          {/* Status message — fixed height container, always renders to prevent layout shift */}
          <div className="auth-status-wrapper">
            <div className={`auth-status ${status.type ? statusClass[status.type] : "auth-status-hidden"}`}>
              <i className={`fa-solid ${status.type ? statusIcon[status.type] : "fa-circle-info"}`} />
              <span>{status.message || "\u00A0"}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="auth-tabs">
            <button
              className={`auth-tab-v2 ${mode === "login" ? "active" : ""}`}
              onClick={() => switchMode("login")}
            >
              登录
            </button>
            <button
              className={`auth-tab-v2 ${mode === "register" ? "active" : ""}`}
              onClick={() => switchMode("register")}
            >
              注册
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Nickname (register only) */}
            {mode === "register" && (
              <div className="auth-field">
                <label className="auth-field-label">昵称</label>
                <div className="auth-input-wrapper">
                  <i className="fa-solid fa-user auth-input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="给自己起个名字"
                    maxLength={20}
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      clearStatus();
                    }}
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div className="auth-field">
              <label className="auth-field-label">邮箱</label>
              <div className="auth-input-wrapper">
                <i className="fa-solid fa-envelope auth-input-icon" />
                <input
                  type="email"
                  className="auth-input"
                  placeholder="请输入邮箱地址"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearStatus();
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="auth-field">
              <label className="auth-field-label">密码</label>
              <div className="auth-input-wrapper">
                <i className="fa-solid fa-lock auth-input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder={mode === "register" ? "至少 6 位密码" : "请输入密码"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearStatus();
                  }}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
                </button>
              </div>
            </div>

            {/* Terms checkbox (register only) */}
            {mode === "register" && (
              <div className="auth-checkbox-row">
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                />
                <label htmlFor="agreeTerms">
                  已阅读并同意{" "}
                  <Link href="/terms">用户协议</Link>{" "}
                  和{" "}
                  <Link href="/privacy">隐私政策</Link>
                </label>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="auth-spinner" />
                  {mode === "login" ? "登录中..." : "注册中..."}
                </>
              ) : mode === "login" ? (
                "登录"
              ) : (
                "注册"
              )}
            </button>
          </form>

          {/* Footer link */}
          <div className="auth-footer-link">
            {mode === "login" ? (
              <>
                还没有账号？{" "}
                <button type="button" onClick={() => switchMode("register")}>
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账号？{" "}
                <button type="button" onClick={() => switchMode("login")}>
                  去登录
                </button>
              </>
            )}
          </div>
        </div>

        {/* ===== Right Panel — Decorative ===== */}
        <div className="auth-decor-panel">
          {/* Decorative illustration */}
          <div className="auth-decor-illustration">
            <div className="auth-decor-ring auth-decor-ring-1" />
            <div className="auth-decor-ring auth-decor-ring-2" />
            <div className="auth-decor-ring auth-decor-ring-3" />
            <div className="auth-decor-center">
              <i className={`fa-solid ${mode === "login" ? "fa-feather-pointed" : "fa-sparkles"}`} />
            </div>
          </div>

          <div className="auth-decor-quote">
            {mode === "login"
              ? "每一个故事都值得被看见"
              : "用文字创造属于你的世界"}
          </div>
          <div className="auth-decor-sub">
            {mode === "login"
              ? "inkland — 干净、无广告的同人创作社区"
              : "加入 inkland，与创作者们一起分享热爱"}
          </div>
        </div>
      </div>
    </div>
      )}
    </>
  );
}
