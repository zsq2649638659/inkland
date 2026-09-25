"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import SiteIcon from "@/components/SiteIcon";
import { createClient } from "@/lib/supabase/browser";

type ConfirmationFlow = "signup" | "email-change";
type ConfirmationState = "checking" | "awaiting" | "success" | "pending" | "error";
type ConfirmationIssue = "link-used-or-expired" | "exchange-failed" | "verification-failed" | "unknown";
type PendingEmailConfirmation = {
  flow: ConfirmationFlow;
  tokenHash: string;
  type: EmailOtpType;
};

const pendingConfirmationStorageKey = "inkland:pending-email-confirmation";

const supportedOtpTypes = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isConfirmationFlow(value: string | null): value is ConfirmationFlow {
  return value === "signup" || value === "email-change";
}

function isExpiredAuthError(error: { code?: string; message?: string } | null) {
  return /otp_expired|expired|invalid/i.test(`${error?.code || ""} ${error?.message || ""}`);
}

function getAuthErrorCode(error: { code?: string; status?: number } | null) {
  return error?.code?.trim() || (error?.status ? `HTTP_${error.status}` : "VERIFY_FAILED");
}

function cleanConfirmationUrl(
  flow: ConfirmationFlow,
  result: ConfirmationState,
  issue?: ConfirmationIssue,
  errorCode?: string
) {
  const cleanUrl = new URL("/auth/confirm", window.location.origin);
  cleanUrl.searchParams.set("flow", flow);
  window.history.replaceState(
    {
      ...(window.history.state || {}),
      inklandEmailConfirmation: {
        flow,
        result,
        ...(issue ? { issue } : {}),
        ...(errorCode ? { errorCode } : {}),
      },
    },
    "",
    `${cleanUrl.pathname}${cleanUrl.search}`
  );
}

function readPendingConfirmation(): PendingEmailConfirmation | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(pendingConfirmationStorageKey) || "null") as Partial<PendingEmailConfirmation> | null;
    if (
      stored &&
      isConfirmationFlow(stored.flow ?? null) &&
      typeof stored.tokenHash === "string" &&
      stored.tokenHash.length > 0 &&
      typeof stored.type === "string" &&
      supportedOtpTypes.has(stored.type as EmailOtpType)
    ) {
      return stored as PendingEmailConfirmation;
    }
  } catch {
    // Confirmation remains usable when session storage is unavailable.
  }
  return null;
}

function clearPendingConfirmation() {
  try {
    window.sessionStorage.removeItem(pendingConfirmationStorageKey);
  } catch {
    // Ignore unavailable session storage.
  }
}

export default function AuthConfirmPage() {
  const [flow, setFlow] = useState<ConfirmationFlow>("signup");
  const [result, setResult] = useState<ConfirmationState>("checking");
  const [confirmedUser, setConfirmedUser] = useState<User | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingEmailConfirmation | null>(null);
  const [confirmationIssue, setConfirmationIssue] = useState<ConfirmationIssue>("unknown");
  const [confirmationErrorCode, setConfirmationErrorCode] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const confirmEmail = async () => {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const type = query.get("type") as EmailOtpType | null;
      const flowFromUrl = query.get("flow");
      const currentFlow: ConfirmationFlow = isConfirmationFlow(flowFromUrl)
        ? flowFromUrl
        : type === "email_change"
          ? "email-change"
          : "signup";
      setFlow(currentFlow);

      const storedConfirmation = window.history.state?.inklandEmailConfirmation as {
        flow?: string;
        result?: string;
        issue?: ConfirmationIssue;
        errorCode?: string;
      } | undefined;
      const previousResult = storedConfirmation?.flow === currentFlow
        ? storedConfirmation.result
        : null;
      if (previousResult === "awaiting") {
        const pending = readPendingConfirmation();
        if (pending?.flow === currentFlow) {
          setPendingConfirmation(pending);
          setConfirmationErrorCode(storedConfirmation?.errorCode ?? "");
          setResult("awaiting");
        } else {
          cleanConfirmationUrl(currentFlow, "error", "unknown");
          setConfirmationIssue("unknown");
          setResult("error");
        }
        return;
      }
      if (previousResult === "success" || previousResult === "pending" || previousResult === "error") {
        setResult(previousResult);
        if (previousResult === "error") {
          setConfirmationIssue(storedConfirmation?.issue ?? "unknown");
          setConfirmationErrorCode(storedConfirmation?.errorCode ?? "");
        }
        if (previousResult !== "error") {
          const { data } = await supabase.auth.getUser();
          if (active) setConfirmedUser(data.user);
        }
        return;
      }

      if (query.has("error") || query.has("error_code") || hash.has("error")) {
        const errorCode = query.get("error_code") || "";
        const errorDescription = query.get("error_description") || "";
        const looksExpired = /otp_expired|expired|invalid/i.test(`${errorCode} ${errorDescription}`);
        const issue = looksExpired
          ? "link-used-or-expired"
          : errorCode || errorDescription
            ? "verification-failed"
            : "unknown";
        setConfirmationIssue(issue);
        setConfirmationErrorCode(errorCode || (errorDescription ? "SUPABASE_REDIRECT_ERROR" : ""));
        cleanConfirmationUrl(currentFlow, "error", issue, errorCode || undefined);
        if (active) setResult("error");
        return;
      }

      let confirmedUserResult: User | null = null;
      let authError: { message: string; code?: string; status?: number } | null = null;

      const code = query.get("code");
      const tokenHash = query.get("token_hash");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const manualConfirmation = query.get("manual") === "1";

      if (manualConfirmation && tokenHash && type && supportedOtpTypes.has(type)) {
        const pending = { flow: currentFlow, tokenHash, type } satisfies PendingEmailConfirmation;
        try {
          window.sessionStorage.setItem(pendingConfirmationStorageKey, JSON.stringify(pending));
        } catch {
          // Keep the token in component state when session storage is unavailable.
        }
        setPendingConfirmation(pending);
        cleanConfirmationUrl(currentFlow, "awaiting");
        if (active) setResult("awaiting");
        return;
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        authError = error;
        confirmedUserResult = data.user;
      } else if (tokenHash && type && supportedOtpTypes.has(type)) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        authError = error;
        confirmedUserResult = data.user;
      } else if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authError = error;
        confirmedUserResult = data.user;
      } else {
        cleanConfirmationUrl(currentFlow, "error");
        if (active) setResult("error");
        return;
      }

      if (authError) {
        const issue = code
          ? "exchange-failed"
          : isExpiredAuthError(authError)
            ? "link-used-or-expired"
            : "verification-failed";
        const errorCode = getAuthErrorCode(authError);
        setConfirmationIssue(issue);
        setConfirmationErrorCode(errorCode);
        cleanConfirmationUrl(currentFlow, "error", issue, errorCode);
        if (active) setResult("error");
        return;
      }

      if (!confirmedUserResult) {
        const { data } = await supabase.auth.getUser();
        confirmedUserResult = data.user;
      }
      if (!confirmedUserResult) {
        const issue = code ? "exchange-failed" : "unknown";
        setConfirmationIssue(issue);
        setConfirmationErrorCode("MISSING_USER");
        cleanConfirmationUrl(currentFlow, "error", issue, "MISSING_USER");
        if (active) setResult("error");
        return;
      }

      const confirmationResult: ConfirmationState = currentFlow === "email-change"
        && Boolean(confirmedUserResult?.new_email)
        ? "pending"
        : "success";
      cleanConfirmationUrl(currentFlow, confirmationResult);
      if (active) {
        setConfirmedUser(confirmedUserResult);
        setResult(confirmationResult);
      }
    };

    void confirmEmail().catch(() => {
      if (!active) return;
      clearPendingConfirmation();
      setConfirmationIssue("unknown");
      const url = new URL(window.location.href);
      const currentFlow = isConfirmationFlow(url.searchParams.get("flow"))
        ? url.searchParams.get("flow") as ConfirmationFlow
        : "signup";
      cleanConfirmationUrl(currentFlow, "error", "unknown");
      setFlow(currentFlow);
      setResult("error");
    });

    return () => { active = false; };
  }, []);

  const completeManualConfirmation = async () => {
    if (!pendingConfirmation || result !== "awaiting") return;
    setResult("checking");
    setConfirmationErrorCode("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: pendingConfirmation.tokenHash,
        type: pendingConfirmation.type,
      });
      if (error) {
        clearPendingConfirmation();
        setPendingConfirmation(null);
        const issue = isExpiredAuthError(error)
          ? "link-used-or-expired"
          : "verification-failed";
        const errorCode = getAuthErrorCode(error);
        setConfirmationIssue(issue);
        setConfirmationErrorCode(errorCode);
        cleanConfirmationUrl(pendingConfirmation.flow, "error", issue, errorCode);
        setFlow(pendingConfirmation.flow);
        setResult("error");
        return;
      }

      clearPendingConfirmation();
      setPendingConfirmation(null);
      if (!data.user && pendingConfirmation.flow === "email-change") {
        // Supabase returns a successful no-user response after the first of two secure email confirmations.
        cleanConfirmationUrl(pendingConfirmation.flow, "pending");
        setFlow(pendingConfirmation.flow);
        setResult("pending");
        return;
      }
      if (!data.user) {
        const errorCode = "MISSING_USER";
        setConfirmationIssue("verification-failed");
        setConfirmationErrorCode(errorCode);
        cleanConfirmationUrl(pendingConfirmation.flow, "error", "verification-failed", errorCode);
        setFlow(pendingConfirmation.flow);
        setResult("error");
        return;
      }

      const confirmationResult: ConfirmationState = pendingConfirmation.flow === "email-change"
        && Boolean(data.user.new_email)
        ? "pending"
        : "success";
      cleanConfirmationUrl(pendingConfirmation.flow, confirmationResult);
      setFlow(pendingConfirmation.flow);
      setConfirmedUser(data.user);
      setResult(confirmationResult);
    } catch {
      setConfirmationIssue("verification-failed");
      setConfirmationErrorCode("NETWORK_OR_CLIENT_ERROR");
      cleanConfirmationUrl(pendingConfirmation.flow, "awaiting", undefined, "NETWORK_OR_CLIENT_ERROR");
      setFlow(pendingConfirmation.flow);
      setResult("awaiting");
    }
  };

  const continueHref = flow === "email-change"
    ? "/profile-settings?tab=profile"
    : confirmedUser ? "/" : "/login";
  const continueAfterConfirmation = () => {
    if (result === "checking" || result === "awaiting") return;
    if (flow === "signup" && confirmedUser) {
      try {
        const pending = JSON.parse(window.localStorage.getItem("inkland:pending-interest-onboarding") || "null") as {
          userId?: string;
          next?: string;
        } | null;
        if (pending?.userId === confirmedUser.id) {
          const next = pending.next && pending.next.startsWith("/") && !pending.next.startsWith("//")
            ? pending.next
            : "/";
          window.localStorage.removeItem("inkland:pending-interest-onboarding");
          window.location.assign(`/onboarding/interests?next=${encodeURIComponent(next)}`);
          return;
        }
      } catch {
        // Confirmation should remain usable when local storage is unavailable.
      }
    }
    window.location.assign(continueHref);
  };
  const isError = result === "error";
  const isPending = result === "pending";
  const title = result === "checking"
    ? "正在确认邮箱"
    : result === "awaiting"
      ? "请确认邮箱"
    : isError
      ? "邮箱验证未完成"
      : flow === "email-change"
        ? isPending ? "此邮箱已确认，还需确认另一邮箱" : "绑定邮箱已更新"
        : "注册邮箱验证成功";
  const message = result === "checking"
    ? "请稍候，完成后会告诉你下一步。"
    : result === "awaiting"
      ? confirmationErrorCode
        ? `刚才的验证请求未能完成（${confirmationErrorCode}）。请检查网络后重试。`
        : "为防止邮件安全扫描提前使用验证链接，请点击下方按钮完成邮箱验证。"
    : isError
      ? confirmationIssue === "exchange-failed" && flow === "signup"
          ? "邮箱链接已通过验证，但当前浏览器未能完成登录。请返回登录页，用注册时设置的密码继续。"
        : confirmationIssue === "link-used-or-expired" && flow === "signup"
          ? "验证链接可能已被邮件安全扫描提前访问，或已经过期。请先返回登录尝试；如果提示邮箱尚未验证，再重新发起验证并使用最新邮件。"
          : flow === "email-change"
            ? confirmationIssue === "link-used-or-expired"
              ? "这个验证链接已被使用、失效或过期。请回到编辑资料点击“重新发送验证邮件”，并只使用最新收到的邮件。"
              : confirmationIssue === "verification-failed"
                ? `验证服务未完成这次邮箱更换${confirmationErrorCode ? `（错误代码：${confirmationErrorCode}）` : ""}。请把错误代码告诉我们，再重新发送最新验证邮件。`
              : "邮箱验证暂未完成。请回到编辑资料重新提交邮箱，再使用最新的验证邮件。"
            : "验证链接无效或已过期。请先返回登录尝试；如果提示邮箱尚未验证，再重新发起验证并使用最新邮件。"
      : flow === "email-change"
        ? isPending
          ? "这封邮件的验证已通过。请在另一邮箱（通常是原绑定邮箱）中完成另一封确认邮件；两边确认后，新邮箱才会生效。"
          : "新邮箱已验证，并已成为当前账号的绑定邮箱。"
        : "账号已激活，可以进入 Inkland 继续使用。";
  const actionLabel = result === "checking"
    ? "正在验证…"
    : result === "awaiting"
      ? "确认邮箱"
    : flow === "email-change"
      ? "返回编辑资料"
      : confirmedUser
        ? "进入 Inkland"
        : "返回登录";

  return (
    <main className="auth-confirm-page">
      <section className={`auth-confirm-card auth-confirm-card--${result}`} aria-live="polite" aria-busy={result === "checking"}>
        <div className="auth-confirm-mark" aria-hidden="true">
          {result === "checking" || result === "awaiting" ? (
            <SiteIcon name="fa-envelope" variant="solid" />
          ) : (
            <SiteIcon name={isError ? "fa-circle-exclamation" : "fa-circle-check"} variant="solid" />
          )}
        </div>
        <h1>{title}</h1>
        <p>{message}</p>
        <button
          type="button"
          className="auth-confirm-action"
          disabled={result === "checking"}
          onClick={result === "awaiting" ? completeManualConfirmation : continueAfterConfirmation}
        >
          {actionLabel}
        </button>
      </section>
    </main>
  );
}
