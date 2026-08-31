"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export interface UserProfile {
  nickname: string;
  avatar_url: string | null;
  bio?: string | null;
  external_link?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  // 根据 user 拉取 profile（带异常保护）
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("nickname, avatar_url, bio, external_link")
        .eq("id", userId)
        .single();
      return data
        ? { nickname: data.nickname, avatar_url: data.avatar_url, bio: data.bio, external_link: data.external_link }
        : null;
    } catch {
      return null;
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) {
      setProfile(null);
      return;
    }
    setProfile(await fetchProfile(userId));
  }, [fetchProfile]);

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
    // getSession() 与 onAuthStateChange() 可能交错返回。用版本号保证较早的
    // “无 session” 结果不会覆盖随后已经建立的登录状态。
    let authStateVersion = 0;

    const hydrateSession = async (session: Session | null, version: number) => {
      if (!active || version !== authStateVersion) return;
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
      if (!active || version !== authStateVersion) return;
      setProfile(nextProfile);
      saveCachedProfile(u.id, nextProfile);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        // INITIAL_SESSION 也作为有效的初始化结果处理；不能只依赖 getSession，
        // 否则首次登录时两个异步结果可能互相覆盖。
        const version = ++authStateVersion;
        void hydrateSession(session, version);
      }
    );

    // 作为 INITIAL_SESSION 的兼容兜底；若期间已经收到任何 auth 事件，
    // 则丢弃这个可能已经过时的 getSession 结果。
    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      if (!active || authStateVersion !== 0) return;
      const version = ++authStateVersion;
      void hydrateSession(result.data.session, version);
    }).catch(() => {
      if (!active || authStateVersion !== 0) return;
      authStateVersion += 1;
      userIdRef.current = null;
      setUser(null);
      setProfile(null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
