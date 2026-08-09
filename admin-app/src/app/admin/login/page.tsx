"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-browser";

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = createAdminClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (loginError) { setError("后台账号或密码错误，或该账号尚未开通管理员权限。"); setLoading(false); return; }
    router.replace("/admin"); router.refresh();
  };
  return <main className="admin-login-shell"><form className="admin-login-card" onSubmit={handleSubmit}>
    <p className="admin-kicker">INKLAND OPERATIONS</p><h1>管理员登录</h1><p>这是独立的后台入口，不使用前台用户账号。</p>
    <label>后台邮箱<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>后台密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {error && <div className="admin-alert admin-alert-error" role="alert">{error}</div>}
    <button className="admin-btn admin-btn-primary admin-login-submit" type="submit" disabled={loading}>{loading ? "登录中…" : "登录后台"}</button>
  </form></main>;
}
