"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async () => {
    if (!email.trim()) {
      setErrorMsg("请输入邮箱");
      return;
    }
    if (!password) {
      setErrorMsg("请输入密码");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMsg(error.message === "Invalid login credentials"
        ? "邮箱或密码错误"
        : error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  const handleRegister = async () => {
    if (!email.trim()) {
      setErrorMsg("请输入邮箱");
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg("密码至少6位");
      return;
    }
    if (!nickname.trim()) {
      setErrorMsg("请输入昵称");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: nickname.trim() },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      if (data.session) {
        // 邮箱确认已关闭，直接有 session，插入 profile
        await supabase.from("profiles").insert({
          id: data.user.id,
          nickname: nickname.trim(),
        });
        router.push("/");
        router.refresh();
      } else {
        // 需要邮箱确认
        setErrorMsg("注册成功！请检查邮箱并点击确认链接，然后返回登录。");
        setMode("login");
      }
    }
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") handleLogin();
    else handleRegister();
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="auth-card text-center">
        <div className="mb-6">
          <span className="text-2xl font-bold text-warm">
            <i className="fa-solid fa-feather-pointed text-accent mr-1.5" />
            墨者
          </span>
          <p className="text-sm text-muted mt-1">同人创作社区</p>
        </div>

        <div className="flex gap-6 mb-6 justify-center">
          <button
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => { setMode("login"); setErrorMsg(""); }}
          >
            登录
          </button>
          <button
            className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => { setMode("register"); setErrorMsg(""); }}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {mode === "register" && (
            <div>
              <label className="text-sm text-muted block mb-1">昵称</label>
              <input
                type="text"
                placeholder="给自己起个名字"
                className="input-field"
                maxLength={20}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-sm text-muted block mb-1">邮箱</label>
            <input
              type="email"
              placeholder="请输入邮箱"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-muted block mb-1">密码</label>
            <input
              type="password"
              placeholder={mode === "register" ? "至少6位密码" : "请输入密码"}
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <i className="fa-solid fa-circle-exclamation mr-1" />
              {errorMsg}
            </p>
          )}

          {mode === "register" && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" id="agree" defaultChecked />
              <label htmlFor="agree">
                已阅读并同意{" "}
                <a href="#" className="text-accent">用户协议</a> 和{" "}
                <a href="#" className="text-accent">隐私政策</a>
              </label>
            </div>
          )}

          <button
            type="submit"
            className="btn-accent block w-full text-center"
            disabled={loading}
          >
            {loading
              ? (mode === "login" ? "登录中..." : "注册中...")
              : (mode === "login" ? "登录" : "注册")}
          </button>

          <p className="text-xs text-muted text-center">
            {mode === "login" ? (
              <>
                还没有账号？{" "}
                <button
                  type="button"
                  className="text-accent bg-transparent border-none cursor-pointer"
                  onClick={() => { setMode("register"); setErrorMsg(""); }}
                >
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账号？{" "}
                <button
                  type="button"
                  className="text-accent bg-transparent border-none cursor-pointer"
                  onClick={() => { setMode("login"); setErrorMsg(""); }}
                >
                  去登录
                </button>
              </>
            )}
          </p>
        </form>

        <div className="text-center mt-4">
          <Link
            href="/"
            className="text-sm text-muted no-underline hover:text-accent"
          >
            <i className="fa-solid fa-arrow-left mr-1" />
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}