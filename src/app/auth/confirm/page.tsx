"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import SiteIcon from "@/components/SiteIcon";
import { createClient } from "@/lib/supabase/browser";

type ConfirmationFlow = "signup" | "email-change";
type ConfirmationState = "checking" | "success" | "pending" | "error";

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

function cleanConfirmationUrl(flow: ConfirmationFlow, result: ConfirmationState) {
  const cleanUrl = new URL("/auth/confirm", window.location.origin);
  cleanUrl.searchParams.set("flow", flow);
  window.history.replaceState(
    {
      ...(window.history.state || {}),
      inklandEmailConfirmation: { flow, result },
    },
    "",
    `${cleanUrl.pathname}${cleanUrl.search}`
  );
}

export default function AuthConfirmPage() {
  const [flow, setFlow] = useState<ConfirmationFlow>("signup");
  const [result, setResult] = useState<ConfirmationState>("checking");
  const [confirmedUser, setConfirmedUser] = useState<User | null>(null);

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
      } | undefined;
      const previousResult = storedConfirmation?.flow === currentFlow
        ? storedConfirmation.result
        : null;
      if (previousResult === "success" || previousResult === "pending" || previousResult === "error") {
        setResult(previousResult);
        if (previousResult !== "error") {
          const { data } = await supabase.auth.getUser();
          if (active) setConfirmedUser(data.user);
        }
        return;
      }

      if (query.has("error") || query.has("error_code") || hash.has("error")) {
        cleanConfirmationUrl(currentFlow, "error");
        if (active) setResult("error");
        return;
      }

      let confirmedUserResult: User | null = null;
      let authError: { message: string } | null = null;

      const code = query.get("code");
      const tokenHash = query.get("token_hash");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

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
        cleanConfirmationUrl(currentFlow, "error");
        if (active) setResult("error");
        return;
      }

      if (!confirmedUserResult) {
        const { data } = await supabase.auth.getUser();
        confirmedUserResult = data.user;
      }
      if (!confirmedUserResult) {
        cleanConfirmationUrl(currentFlow, "error");
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
      const url = new URL(window.location.href);
      const currentFlow = isConfirmationFlow(url.searchParams.get("flow"))
        ? url.searchParams.get("flow") as ConfirmationFlow
        : "signup";
      cleanConfirmationUrl(currentFlow, "error");
      setFlow(currentFlow);
      setResult("error");
    });

    return () => { active = false; };
  }, []);

  const continueHref = flow === "email-change"
    ? "/profile-settings?tab=profile"
    : confirmedUser ? "/" : "/login";
  const continueAfterConfirmation = () => {
    if (result === "checking") return;
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
    : isError
      ? "邮箱验证未完成"
      : flow === "email-change"
        ? isPending ? "本次邮箱验证已完成" : "绑定邮箱已更新"
        : "注册邮箱验证成功";
  const message = result === "checking"
    ? "请稍候，完成后会告诉你下一步。"
    : isError
      ? flow === "email-change"
        ? "验证链接无效或已过期。请回到编辑资料重新提交邮箱，再使用最新的验证邮件。"
        : "验证链接无效或已过期。请回到注册页面重新发起验证，再使用最新的验证邮件。"
      : flow === "email-change"
        ? isPending
          ? "为保护账号安全，若你还收到另一封确认邮件，也需要完成其中的验证；全部确认后新邮箱才会生效。"
          : "新邮箱已验证，并已成为当前账号的绑定邮箱。"
        : "账号已激活，可以进入 Inkland 继续使用。";
  const actionLabel = result === "checking"
    ? "正在验证…"
    : flow === "email-change"
      ? "返回编辑资料"
      : confirmedUser
        ? "进入 Inkland"
        : "返回登录";

  return (
    <main className="auth-confirm-page">
      <section className={`auth-confirm-card auth-confirm-card--${result}`} aria-live="polite" aria-busy={result === "checking"}>
        <div className="auth-confirm-mark" aria-hidden="true">
          {result === "checking" ? (
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
          onClick={continueAfterConfirmation}
        >
          {actionLabel}
        </button>
        {isError && flow === "signup" && (
          <a className="auth-confirm-secondary" href="/login?mode=register">重新注册</a>
        )}
      </section>
    </main>
  );
}
