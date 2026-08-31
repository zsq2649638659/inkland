"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export interface UserProfile {
  nickname: string;
  avatar_url: string | null;
  bio?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  // 根据 user 拉取 profile（带异常保护）
  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("nickname, avatar_url, bio")
        .eq("id", userId)
        .single();
      return data
        ? { nickname: data.nickname, avatar_url: data.avatar_url, bio: data.bio }
        : null;
    } catch {
      return null;
    }
  };

  const readCachedProfile = (userId: string): UserProfile | null => {
    try {
      const raw = sessionStorage.getItem(`inkland-profile:${userId}`);
      if (!raw) return null;
      const value = JSON.parse(raw) as UserProfile;
      return typeof value.nickname === "string" ? value : null;
    } catch {
      return null;
    }
  };

  const saveCachedProfile = (userId: string, value: UserProfile | null) => {
    if (!value) return;
    try { sessionStorage.setItem(`inkland-profile:${userId}`, JSON.stringify(value)); } catch { /* ignore storage failures */ }
  };

  useEffect(() => {
    let active = true;
    let initialized = false;

    const hydrateSession = async (session: Session | null) => {
      const u = session?.user || null;
      // 如果同一个人（相同 user ID），不更新 user 对象引用，避免触发下游 useEffect
      if (u && userIdRef.current === u.id) {
        if (active) setLoading(false);
        return;
      }
      userIdRef.current = u?.id || null;
      setUser(u);

      if (!u) {
        if (active) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      // 先解除全站页面对“资料查询”的等待；昵称/头像在后台更新。
      // 这样刷新时页面数据请求可以和 profile 查询并行开始。
      const cachedProfile = readCachedProfile(u.id);
      if (cachedProfile) setProfile(cachedProfile);
      if (active) setLoading(false);

      const nextProfile = await fetchProfile(u.id);
      if (!active) return;
      setProfile(nextProfile);
      saveCachedProfile(u.id, nextProfile);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        // 初始化时 event 为 INITIAL_SESSION，跳过（由 getSession 处理）
        if (event === "INITIAL_SESSION") return;
        if (session) {
          void hydrateSession(session);
        } else {
          // SIGNED_OUT
          if (active) {
            setUser(null);
            setProfile(null);
            setLoading(false);
          }
        }
      }
    );

    // 只用 getSession 做初始化，避免双重调用
    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      void hydrateSession(result.data.session);
    });

    // 超时保护：3 秒后无论如何结束 loading
    const timeoutId = window.setTimeout(() => {
      if (active) {
        setLoading(false);
      }
    }, 3000);

    return () => {
      active = false;
      initialized = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
