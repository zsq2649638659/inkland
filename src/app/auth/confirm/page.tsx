"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import SiteIcon from "@/components/SiteIcon";
import { createClient } from "@/lib/supabase/browser";

type ConfirmationFlow = "signup" | "email-change";
type ConfirmationState = "checking" | "awaiting" | "success" | "pending" | "error";
type ConfirmationIssue = "link-used-or-expired" | "exchange-failed" | "unknown";
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

function cleanConfirmationUrl(
  flow: ConfirmationFlow,
  result: ConfirmationState,
  issue?: ConfirmationIssue
) {
  const cleanUrl = new URL("/auth/confirm", window.location.origin);
  cleanUrl.searchParams.set("flow", flow);
  window.history.replaceState(
    {
      ...(window.history.state || {}),
      inklandEmailConfirmation: { flow, result, ...(issue ? { issue } : {}) },
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
      } | undefined;
      const previousResult = storedConfirmation?.flow === currentFlow
        ? storedConfirmation.result
        : null;
      if (previousResult === "awaiting") {
        const pending = readPendingConfirmation();
        if (pending?.flow === currentFlow) {
          setPendingConfirmation(pending);
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
        if (previousResult === "error") setConfirmationIssue(storedConfirmation?.issue ?? "unknown");
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
        const issue = looksExpired ? "link-used-or-expired" : "unknown";
        setConfirmationIssue(issue);
        cleanConfirmationUrl(currentFlow, "error", issue);
        if (active) setResult("error");
        return;
      }

      let confirmedUserResult: User | null = null;
      let authError: { message: string } | null = null;

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
        const issue = code ? "exchange-failed" : "link-used-or-expired";
        setConfirmationIssue(issue);
        cleanConfirmationUrl(currentFlow, "error", issue);
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
        cleanConfirmationUrl(currentFlow, "error", issue);
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
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: pendingConfirmation.tokenHash,
        type: pendingConfirmation.type,
      });
      if (error || !data.user) {
        clearPendingConfirmation();
        setPendingConfirmation(null);
        setConfirmationIssue("link-used-or-expired");
        cleanConfirmationUrl(pendingConfirmation.flow, "error", "link-used-or-expired");
        setFlow(pendingConfirmation.flow);
        setResult("error");
        return;
      }

      clearPendingConfirmation();
      setPendingConfirmation(null);
      const confirmationResult: ConfirmationState = pendingConfirmation.flow === "email-change"
        && Boolean(data.user.new_email)
        ? "pending"
        : "success";
      cleanConfirmationUrl(pendingConfirmation.flow, confirmationResult);
      setFlow(pendingConfirmation.flow);
      setConfirmedUser(data.user);
      setResult(confirmationResult);
    } catch {
      clearPendingConfirmation();
      setPendingConfirmation(null);
      setConfirmationIssue("unknown");
      cleanConfirmationUrl(pendingConfirmation.flow, "error", "unknown");
      setFlow(pendingConfirmation.flow);
      setResult("error");
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
        ? isPending ? "本次邮箱验证已完成" : "绑定邮箱已更新"
        : "注册邮箱验证成功";
  const message = result === "checking"
    ? "请稍候，完成后会告诉你下一步。"
    : result === "awaiting"
      ? "为防止邮件安全扫描提前使用验证链接，请点击下方按钮完成邮箱验证。"
    : isError
      ? confirmationIssue === "exchange-failed" && flow === "signup"
        ? "邮箱链接已通过验证，但当前浏览器未能完成登录。请返回登录页，用注册时设置的密码继续。"
        : confirmationIssue === "link-used-or-expired" && flow === "signup"
          ? "验证链接可能已被邮件安全扫描提前访问，或已经过期。请先返回登录尝试；如果提示邮箱尚未验证，再重新发起验证并使用最新邮件。"
          : flow === "email-change"
            ? "验证链接无效或已过期。请回到编辑资料重新提交邮箱，再使用最新的验证邮件。"
            : "验证链接无效或已过期。请先返回登录尝试；如果提示邮箱尚未验证，再重新发起验证并使用最新邮件。"
      : flow === "email-change"
        ? isPending
          ? "为保护账号安全，若你还收到另一封确认邮件，也需要完成其中的验证；全部确认后新邮箱才会生效。"
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
