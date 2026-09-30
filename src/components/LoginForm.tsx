"use client";
import SiteIcon from "@/components/SiteIcon";
import type { InklandIconName } from "@/components/inkland/iconRegistry";
import Checkbox from "@/components/inkland/Checkbox";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { getPasswordPairErrors } from "@/lib/passwordValidation";

type Mode = "login" | "register";
type AuthView = Mode | "forgot-password" | "reset-password";
type StatusType = "error" | "success" | "info" | null;

const loginIllustrations = [
  { src: "/images/auth-login-01.png", alt: "Inkland 社区定位：让创作回到作品本身" },
  { src: "/images/auth-login-02.png", alt: "Inkland 批量作品搬家：支持多种文档批量导入" },
  { src: "/images/auth-login-03.png", alt: "Inkland 长篇阅读体验：阅读设置与章节续读" },
];

function AuthDecorPanel({ isRegister }: { isRegister: boolean }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (isRegister || isPaused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % loginIllustrations.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [isPaused, isRegister, reducedMotion]);

  useEffect(() => {
    if (isRegister) setActiveSlide(0);
  }, [isRegister]);

  return (
    <div className="auth-decor-panel" role="group" aria-label={isRegister ? "注册主题插画" : "Inkland 产品介绍"}>
      {isRegister ? (
        <Image
          src="/images/auth-register.png"
          alt="Inkland 注册页面主题插画"
          fill
          priority
          sizes="(max-width: 560px) 0px, (max-width: 700px) 32vw, (max-width: 900px) 36vw, 380px"
          className="auth-decor-image"
        />
      ) : (
        <>
          {loginIllustrations.map((illustration, index) => (
            <Image
              key={illustration.src}
              src={illustration.src}
              alt={activeSlide === index ? illustration.alt : ""}
              aria-hidden={activeSlide !== index}
              fill
              priority={index === 0}
              sizes="(max-width: 560px) 0px, (max-width: 700px) 32vw, (max-width: 900px) 36vw, 380px"
              className={`auth-decor-image${activeSlide === index ? " is-active" : ""}`}
            />
          ))}
          <div className="auth-carousel-controls" role="group" aria-label="登录页主题插画控制">
            <div className="auth-carousel-dots" role="group" aria-label="选择主题插画">
              {loginIllustrations.map((illustration, index) => (
                <button
                  key={illustration.src}
                  type="button"
                  className={`auth-carousel-dot${activeSlide === index ? " is-active" : ""}`}
                  aria-label={`显示第 ${index + 1} 张插画：${illustration.alt}`}
                  aria-current={activeSlide === index ? "true" : undefined}
                  onClick={() => setActiveSlide(index)}
                />
              ))}
            </div>
            {!reducedMotion && (
              <button
                type="button"
                className="auth-carousel-toggle"
                aria-label={isPaused ? "继续自动轮播" : "暂停自动轮播"}
                aria-pressed={isPaused}
                onClick={() => setIsPaused((paused) => !paused)}
              >
                {isPaused ? <span className="auth-carousel-play" aria-hidden="true" /> : <span className="auth-carousel-pause" aria-hidden="true" />}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const passwordRecoveryStorageKey = "inkland:password-recovery-confirmed";
const passwordRecoveryGrantPrefix = "inkland:password-recovery-grant:";
const passwordRecoveryGrantMaxAge = 60 * 60 * 1000;

function getRecoveryFlowId() {
  return new URLSearchParams(window.location.search).get("flow_id");
}

function readRecoveryGrant(flowId: string) {
  try {
    const key = `${passwordRecoveryGrantPrefix}${flowId}`;
    const grant = JSON.parse(window.localStorage.getItem(key) || "null") as {
      userId?: unknown;
      confirmedAt?: unknown;
    } | null;
    if (!grant || typeof grant.userId !== "string" || typeof grant.confirmedAt !== "number") return null;
    const age = Date.now() - grant.confirmedAt;
    if (age < 0 || age > passwordRecoveryGrantMaxAge) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { userId: grant.userId, confirmedAt: grant.confirmedAt };
  } catch {
    return null;
  }
}

function clearRecoveryGrant(flowId = getRecoveryFlowId()) {
  try {
    if (flowId) window.localStorage.removeItem(`${passwordRecoveryGrantPrefix}${flowId}`);
    window.sessionStorage.removeItem(passwordRecoveryStorageKey);
  } catch {
    // Ignore unavailable browser storage.
  }
}

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

async function waitForServerSession(attempts = 20): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.ok) return true;
    } catch {
      // The next attempt covers a transient network failure during login.
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }
  return false;
}

export function LoginForm({ initialMode = "login" }: { initialMode?: AuthView }) {
  const supabase = createClient();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<AuthView>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [status, setStatus] = useState<StatusMsg>({ type: null, message: "" });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [authTimeout, setAuthTimeout] = useState(false);
  const [authActionInProgress, setAuthActionInProgress] = useState(false);
  const [serverSessionReady, setServerSessionReady] = useState(false);
  const [postAuthPath, setPostAuthPath] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);

  const getNextPath = useCallback(() => {
    if (postAuthPath) return postAuthPath;
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }, [postAuthPath]);

  const getInterestOnboardingPath = useCallback(() => {
    const next = getNextPath();
    return `/onboarding/interests?next=${encodeURIComponent(next)}`;
  }, [getNextPath]);

  // 本地超时保护：如果 authLoading 超过 3 秒，强制显示表单
  useEffect(() => {
    const timer = window.setTimeout(() => setAuthTimeout(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // 已登录用户自动跳转（保留 next 参数）
  useEffect(() => {
    if (!authLoading && user && !authActionInProgress && serverSessionReady && mode !== "forgot-password" && mode !== "reset-password") {
      router.replace(getNextPath());
    }
  }, [user, authLoading, authActionInProgress, serverSessionReady, getNextPath, mode, router]);

  // 处理从其他页面进入登录页时已有客户端 session、但服务器 Cookie 尚未确认的窗口。
  useEffect(() => {
    if (authLoading || !user || authActionInProgress || serverSessionReady) return;
    let active = true;
    void waitForServerSession().then((ready) => {
      if (active) setServerSessionReady(ready);
    });
    return () => { active = false; };
  }, [user, authLoading, authActionInProgress, serverSessionReady]);

  useEffect(() => {
    const queryMode = new URLSearchParams(window.location.search).get("mode");
    const frame = window.requestAnimationFrame(() => {
      setMode(
        queryMode === "forgot-password" || queryMode === "reset-password"
          ? queryMode
          : queryMode === "register"
            ? "register"
            : initialMode
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    const frame = window.requestAnimationFrame(() => {
      if (reason === "password-changed") {
        setStatus({ type: "success", message: "密码已修改，请使用新密码登录。" });
      } else if (reason === "password-reset") {
        setStatus({ type: "success", message: "密码重设成功，请使用新密码登录。" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (mode !== "reset-password") return;
    let active = true;
    const verifyRecoverySession = async () => {
      const flowId = getRecoveryFlowId();
      let confirmedForThisTab = false;
      try {
        confirmedForThisTab = window.sessionStorage.getItem(passwordRecoveryStorageKey) === "1";
      } catch {
        // Recovery still requires an active Supabase session below.
      }
      const { data, error } = await supabase.auth.getUser();
      const grant = flowId ? readRecoveryGrant(flowId) : null;
      const ready = !error && Boolean(data.user) && (flowId
        ? grant?.userId === data.user!.id
        : confirmedForThisTab);
      if (!ready && !flowId) {
        try { window.sessionStorage.removeItem(passwordRecoveryStorageKey); } catch { /* ignore unavailable storage */ }
      }
      if (active) {
        setRecoveryReady(ready);
        if (!ready) {
          const mismatch = flowId && data.user && grant && grant.userId !== data.user.id;
          setStatus({
            type: "error",
            message: mismatch
              ? "当前浏览器已切换到另一个邮箱账号。请先完成一个账号的密码重置，再处理另一个邮箱。"
              : "重置链接无效或已过期，请重新申请密码重置邮件。",
          });
        }
      }
    };
    void verifyRecoverySession().catch(() => {
      if (!active) return;
      setRecoveryReady(false);
      setStatus({ type: "error", message: "暂时无法确认重置链接，请重新打开邮件，或重新申请重置邮件。" });
    });
    return () => { active = false; };
  }, [mode, supabase]);

  const clearStatus = () => setStatus({ type: null, message: "" });

  const getConfirmationRedirectUrl = () =>
    new URL("/auth/confirm?flow=signup", window.location.origin).toString();

  const getPasswordRecoveryRedirectUrl = (flowId: string) => {
    const redirectUrl = new URL("/auth/confirm?flow=recovery", window.location.origin);
    redirectUrl.searchParams.set("flow_id", flowId);
    return redirectUrl.toString();
  };

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
    setServerSessionReady(false);
    setCanResendConfirmation(false);
    clearStatus();

    let error: { message: string } | null = null;
    let signedInUserId: string | null = null;
    try {
      const result = await withTimeout<Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>>(supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      }));
      ({ error } = result);
      signedInUserId = result.data.user?.id || null;
    } catch (requestError) {
      setStatus({ type: "error", message: requestError instanceof Error && requestError.message === "REQUEST_TIMEOUT" ? "连接服务器超时，请检查网络或稍后重试" : "登录请求失败，请稍后重试" });
      setLoading(false);
      setAuthActionInProgress(false);
      return;
    }

    if (error) {
      const needsEmailConfirmation = error.message === "Email not confirmed";
      setStatus({
        type: "error",
        message:
          error.message === "Invalid login credentials"
            ? "邮箱或密码错误，请检查后重试"
            : needsEmailConfirmation
              ? "邮箱尚未验证，可以重新发送验证邮件后再登录"
              : error.message.includes("email") || error.message.includes("Email")
                ? "邮箱格式不正确，请检查后重试"
                : "登录失败，请稍后重试",
      });
      setCanResendConfirmation(needsEmailConfirmation);
      setLoading(false);
      setAuthActionInProgress(false);
      return;
    }

    // 不在这里抢先导航：等待 AuthProvider 收到 SIGNED_IN 并更新 user 后，
    // 上面的 effect 再跳转，避免首次登录时被保护路由当成未登录。
    const serverReady = await withTimeout(waitForServerSession(), 5000).catch(() => false);
    if (!serverReady) {
      setStatus({ type: "error", message: "登录已完成，但页面同步较慢，请稍后重试" });
      setLoading(false);
      setAuthActionInProgress(false);
      return;
    }
    try {
      const pending = JSON.parse(window.localStorage.getItem("inkland:pending-interest-onboarding") || "null") as { userId?: string; next?: string } | null;
      if (pending?.userId && pending.userId === signedInUserId) {
        setPostAuthPath(`/onboarding/interests?next=${encodeURIComponent(pending.next || "/")}`);
        window.localStorage.removeItem("inkland:pending-interest-onboarding");
      }
    } catch {
      // 登录不应因本地存储不可用而失败。
    }
    setServerSessionReady(true);
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
    setCanResendConfirmation(false);
    clearStatus();

    let data: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"];
    let error: Awaited<ReturnType<typeof supabase.auth.signUp>>["error"];
    try {
      const result = await withTimeout<Awaited<ReturnType<typeof supabase.auth.signUp>>>(supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: nickname.trim() },
          emailRedirectTo: getConfirmationRedirectUrl(),
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
      const existingSignup = error.message === "User already registered";
      setStatus({
        type: existingSignup ? "info" : "error",
        message:
          existingSignup
            ? "这个邮箱已有注册记录。若你还没完成验证，可以重发验证邮件；如已验证，请直接登录。"
            : error.message === "Password should be at least 6 characters"
              ? "密码至少需要 6 位字符"
              : error.message.includes("email") || error.message.includes("Email")
                ? "邮箱格式不正确，请检查后重试"
                : "注册失败，请稍后重试",
      });
      setCanResendConfirmation(existingSignup);
      setLoading(false);
      setAuthActionInProgress(false);
      return;
    }

    if (data.user) {
      // 检查 identities：如果为空数组，说明该邮箱已注册
      if (data.user.identities && data.user.identities.length === 0) {
        setStatus({
          type: "info",
          message: "这个邮箱已有注册记录。若你还没完成验证，可以重发验证邮件；如已验证，请直接登录。",
        });
        setCanResendConfirmation(true);
        setLoading(false);
        setAuthActionInProgress(false);
        return;
      }

      if (data.session) {
        // 邮箱确认已关闭，直接有 session
        await supabase.from("profiles").insert({
          id: data.user.id,
          nickname: nickname.trim(),
        });
        setPostAuthPath(getInterestOnboardingPath());
        // 与登录保持一致，等 AuthProvider 完成 user 更新后再导航。
      } else {
        // 需要邮箱确认
        try {
          window.localStorage.setItem("inkland:pending-interest-onboarding", JSON.stringify({ userId: data.user.id, next: getNextPath() }));
        } catch {
          // 邮箱确认流程不应因本地存储不可用而失败。
        }
        setStatus({
          type: "success",
          message: "注册成功！我们已向你的邮箱发送了一封验证邮件，请点击邮件中的链接完成验证后再登录。",
        });
        setMode("login");
        setPassword("");
      }
    }
    setAuthActionInProgress(false);
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setStatus({ type: "error", message: "请输入注册时使用的邮箱地址。" });
      return;
    }

    setLoading(true);
    clearStatus();
    const flowId = window.crypto.randomUUID();
    try {
      const { error } = await withTimeout<Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>>(
        supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: getPasswordRecoveryRedirectUrl(flowId),
        })
      );
      setStatus(error
        ? { type: "error", message: "重置邮件暂时发送失败，请稍后重试。" }
        : { type: "success", message: "如果该邮箱已注册，我们会发送密码重置邮件。请检查收件箱和垃圾邮件。" });
    } catch (requestError) {
      setStatus({
        type: "error",
        message: requestError instanceof Error && requestError.message === "REQUEST_TIMEOUT"
          ? "连接服务器超时，请检查网络后重试。"
          : "重置邮件暂时发送失败，请稍后重试。",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!recoveryReady) {
      setStatus({ type: "error", message: "重置链接无效或已过期，请重新申请密码重置邮件。" });
      return;
    }
    const errors = getPasswordPairErrors(password, confirmPassword);
    if (errors.newPassword || errors.confirmPassword) {
      setStatus({ type: "error", message: errors.newPassword || errors.confirmPassword });
      return;
    }

    setLoading(true);
    clearStatus();
    try {
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !data.user) {
        setRecoveryReady(false);
        setStatus({ type: "error", message: "重置链接已失效，请重新申请密码重置邮件。" });
        return;
      }

      const { error } = await withTimeout<Awaited<ReturnType<typeof supabase.auth.updateUser>>>(
        supabase.auth.updateUser({ password })
      );
      if (error) {
        setStatus({ type: "error", message: "密码重设失败，请稍后重试。" });
        return;
      }

      clearRecoveryGrant();
      await supabase.auth.signOut();
      setPassword("");
      setConfirmPassword("");
      setRecoveryReady(false);
      setMode("login");
      router.replace("/login?reason=password-reset");
    } catch (requestError) {
      setStatus({
        type: "error",
        message: requestError instanceof Error && requestError.message === "REQUEST_TIMEOUT"
          ? "连接服务器超时，请稍后重试。"
          : "密码重设失败，请稍后重试。",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setStatus({ type: "error", message: "请先填写注册邮箱" });
      setCanResendConfirmation(true);
      return;
    }

    setResendLoading(true);
    try {
      const { error } = await withTimeout<Awaited<ReturnType<typeof supabase.auth.resend>>>(
        supabase.auth.resend({
          type: "signup",
          email: normalizedEmail,
          options: { emailRedirectTo: getConfirmationRedirectUrl() },
        })
      );

      if (error) {
        const normalizedMessage = error.message.toLowerCase();
        const alreadyConfirmed = normalizedMessage.includes("already confirmed")
          || normalizedMessage.includes("already been confirmed");
        const rateLimited = normalizedMessage.includes("rate limit")
          || normalizedMessage.includes("too many")
          || normalizedMessage.includes("security purposes");
        setStatus({
          type: "error",
          message: alreadyConfirmed
            ? "这个邮箱已完成验证，请切换到登录。"
            : rateLimited
              ? "验证邮件发送得太频繁，请稍后再试。"
              : "验证邮件暂时发送失败，请稍后重试。",
        });
        setCanResendConfirmation(!alreadyConfirmed);
        return;
      }

      setStatus({
        type: "success",
        message: "如果这个邮箱尚未验证，新的验证邮件会发送至该邮箱。请检查收件箱和垃圾邮件；如已验证，请直接登录。",
      });
      setCanResendConfirmation(true);
    } catch (requestError) {
      setStatus({
        type: "error",
        message: requestError instanceof Error && requestError.message === "REQUEST_TIMEOUT"
          ? "连接服务器超时，请检查网络后重试。"
          : "验证邮件发送失败，请稍后重试。",
      });
      setCanResendConfirmation(true);
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") void handleLogin();
    else if (mode === "register") void handleRegister();
    else if (mode === "forgot-password") void handleForgotPassword();
    else void handleResetPassword();
  };

  const switchMode = (newMode: Mode) => {
    if (mode === "reset-password") clearRecoveryGrant();
    setMode(newMode);
    setCanResendConfirmation(false);
    setConfirmPassword("");
    setRecoveryReady(false);
    clearStatus();
  };

  const openForgotPassword = () => {
    setMode("forgot-password");
    setCanResendConfirmation(false);
    setConfirmPassword("");
    clearStatus();
  };

  const openLoginFromRecovery = () => {
    if (mode === "reset-password") clearRecoveryGrant();
    setMode("login");
    setPassword("");
    setConfirmPassword("");
    setRecoveryReady(false);
    clearStatus();
    router.replace("/login");
  };

  const statusIcon: Record<Exclude<StatusType, null>, InklandIconName> = {
    error: "fa-circle-exclamation",
    success: "fa-circle-check",
    info: "fa-circle-exclamation",
  };

  const statusClass = {
    error: "auth-status-error",
    success: "auth-status-success",
    info: "auth-status-info",
  };

  const isAccountForm = mode === "login" || mode === "register";
  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isForgotPassword = mode === "forgot-password";
  const isResetPassword = mode === "reset-password";

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
                {isLogin
                  ? "欢迎回来"
                  : isRegister
                    ? "加入 inkland"
                    : isForgotPassword
                      ? "找回密码"
                      : "设置新密码"}
              </div>
              <div className="auth-form-subtitle">
                {isLogin
                  ? "登录你的账号，继续创作之旅"
                  : isRegister
                    ? "创建一个账号，开始你的同人创作之旅"
                    : isForgotPassword
                      ? "输入注册邮箱，我们会发送密码重置链接"
                      : "请设置至少 8 位的新密码并再次确认"}
              </div>
            </div>
          </div>

          {/* Status message reserves space and expands when the resend action appears. */}
          <div className={`auth-status-wrapper${canResendConfirmation ? " auth-status-wrapper--resend" : ""}`}>
            <div className={`auth-status ${status.type ? statusClass[status.type] : "auth-status-hidden"}`}>
              <SiteIcon name={status.type ? statusIcon[status.type] : "fa-circle-exclamation"} variant="solid" />
              <span>{status.message || "\u00A0"}</span>
              {canResendConfirmation && (
                <button
                  type="button"
                  className="auth-status-action"
                  onClick={handleResendConfirmation}
                  disabled={resendLoading}
                >
                  {resendLoading ? "发送中…" : "重发验证邮件"}
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          {isAccountForm && (
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab-v2 ${isLogin ? "active" : ""}`}
                onClick={() => switchMode("login")}
              >
                登录
              </button>
              <button
                type="button"
                className={`auth-tab-v2 ${isRegister ? "active" : ""}`}
                onClick={() => switchMode("register")}
              >
                注册
              </button>
            </div>
          )}

          {/* Form */}
          {(!isResetPassword || recoveryReady) ? (
          <form onSubmit={handleSubmit}>
            {/* Nickname (register only) */}
            {isRegister && (
              <div className="auth-field">
                <label className="auth-field-label">昵称</label>
                <div className="auth-input-wrapper">
                  <SiteIcon name="fa-user" variant="solid" className="auth-input-icon" />
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
            {!isResetPassword && (
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="auth-email">邮箱</label>
              <div className="auth-input-wrapper">
                <SiteIcon name="fa-envelope" variant="solid" className="auth-input-icon" />
                <input
                  id="auth-email"
                  type="email"
                  className="auth-input"
                  placeholder="请输入邮箱地址"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCanResendConfirmation(false);
                    clearStatus();
                  }}
                />
              </div>
            </div>
            )}

            {/* Password */}
            {!isForgotPassword && (
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="auth-password">{isResetPassword ? "新密码" : "密码"}</label>
              <div className="auth-input-wrapper">
                <SiteIcon name="fa-lock" variant="solid" className="auth-input-icon" />
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder={isRegister ? "至少 6 位密码" : isResetPassword ? "至少 8 位新密码" : "请输入密码"}
                  autoComplete={isResetPassword || isRegister ? "new-password" : "current-password"}
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
                  <SiteIcon name={showPassword ? "fa-eye-slash" : "fa-eye"} variant="solid" />
                </button>
              </div>
            </div>
            )}

            {isResetPassword && (
              <div className="auth-field">
                <label className="auth-field-label" htmlFor="auth-confirm-password">确认新密码</label>
                <div className="auth-input-wrapper">
                  <SiteIcon name="fa-lock" variant="solid" className="auth-input-icon" />
                  <input
                    id="auth-confirm-password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input"
                    placeholder="请再次输入新密码"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); clearStatus(); }}
                  />
                </div>
              </div>
            )}

            {isLogin && (
              <div className="auth-forgot-row">
                <button type="button" onClick={openForgotPassword}>忘记密码？</button>
              </div>
            )}

            {/* Terms checkbox (register only) */}
            {isRegister && (
              <div className="auth-checkbox-row">
                <Checkbox
                  id="agreeTerms"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                >
                  已阅读并同意{" "}
                  <Link href="/terms">用户协议</Link>{" "}
                  和{" "}
                  <Link href="/privacy">隐私政策</Link>
                </Checkbox>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || (isResetPassword && !recoveryReady)}
            >
              {loading ? (
                <>
                  <span className="auth-spinner" />
                  {isLogin ? "登录中..." : isRegister ? "注册中..." : isForgotPassword ? "发送中..." : "保存中..."}
                </>
              ) : isLogin ? (
                "登录"
              ) : isRegister ? (
                "注册"
              ) : isForgotPassword ? (
                "发送重置邮件"
              ) : (
                "保存新密码"
              )}
            </button>
          </form>
          ) : (
            <div className="auth-recovery-pending" role="status" aria-live="polite">
              {status.type === "error" ? (
                <>
                  <p>{status.message}</p>
                  <button type="button" className="auth-recovery-link" onClick={openForgotPassword}>重新申请重置邮件</button>
                </>
              ) : (
                <><span className="auth-spinner" /> 正在确认重置链接…</>
              )}
            </div>
          )}

          {/* Footer link */}
          <div className="auth-footer-link">
            {isLogin ? (
              <>
                还没有账号？{" "}
                <button type="button" onClick={() => switchMode("register")}>
                  立即注册
                </button>
              </>
            ) : isRegister ? (
              <>
                已有账号？{" "}
                <button type="button" onClick={() => switchMode("login")}>
                  去登录
                </button>
              </>
            ) : (
              <button type="button" onClick={openLoginFromRecovery}>返回登录</button>
            )}
          </div>
        </div>

        {/* ===== Right Panel — Decorative ===== */}
        <AuthDecorPanel isRegister={isRegister} />
      </div>
    </div>
      )}
    </>
  );
}
