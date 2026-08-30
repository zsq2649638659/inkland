"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-browser";

const INKLAND_MARK = (
  <svg viewBox="0 0 1535 857" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true">
    <path d="M253 848C278.56 726.64 291.64 598.27 319.94 477.94C340.59 390.11 383.9 316.25 462.37 268.37C590.46 190.21 798.39 207.91 841.07 374.94C866.81 475.66 796.07 590.94 900.35 663.66C1008.05 738.76 1144.21 668.58 1231.02 597.02C1258.43 574.42 1284.44 529.68 1325.43 542.57L1338.05 549.95L1490.94 845.01L1310.99 847L1230.02 689.9C1174.48 744.13 1114.63 795.5 1042.33 826.33C869.05 900.22 671.92 843.47 691.05 625.05C697.88 547.05 757.52 410.78 644.51 379.48C557.04 355.26 495.68 418.68 475.63 497.62C446.93 610.64 440.1 734.58 410 847.99H253V848Z" fill="currentColor" />
    <path d="M1185 0L1099.01 487.99L1346 240H1535C1443.66 336.03 1351.46 442.56 1251.02 529.02C1161.29 606.26 958.981 728.81 930.891 530.97L1025 0.00999451H1185V0Z" fill="currentColor" />
    <path d="M301 60L158 848H0L137 60H301Z" fill="currentColor" />
  </svg>
);

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = createAdminClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (loginError) { setError("后台邮箱或密码错误。"); setLoading(false); return; }
    const { data: account, error: accountError } = await supabase
      .from("admin_accounts")
      .select("id, status")
      .eq("id", loginData.user.id)
      .maybeSingle();
    if (accountError || !account || account.status !== "active") {
      await supabase.auth.signOut();
      setError(account?.status === "disabled" ? "这个管理员账号已被禁用。" : "这个账号没有管理员权限。");
      setLoading(false);
      return;
    }
    router.replace("/admin"); router.refresh();
  };
  return <main className="admin-login-shell">
    <div className="admin-login-brand">
      <div>
        <div className="admin-login-mark">{INKLAND_MARK}</div>
        <h1>Inkland 内容治理后台</h1>
        <p>审核、举报、用户治理、反馈和规则管理共用一致的任务结构。</p>
      </div>
    </div>
    <form className="admin-login-card" onSubmit={handleSubmit}>
      <h1>管理员登录</h1>
      <p>使用已获授权的后台账号继续。</p>
      <label className="admin-login-field"><span>邮箱</span><input type="email" autoComplete="username" placeholder="admin@example.test" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label className="admin-login-field"><span>密码</span><span className="admin-login-password"><input type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" aria-pressed={showPassword} onClick={() => setShowPassword((open) => !open)}>{showPassword ? "隐藏" : "显示"}</button></span></label>
      {error && <div className="admin-alert admin-alert-error" role="alert">{error}</div>}
      <button className="admin-btn admin-btn-primary admin-login-submit" type="submit" disabled={loading}>{loading ? "登录中…" : "登录"}</button>
      <div className="admin-login-note">设计稿为脱敏演示数据，不连接真实账号；交互用于走查与评审。</div>
    </form>
  </main>;
}
