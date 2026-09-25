"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export interface UserProfile {
  nickname: string;
  avatar_url: string | null;
  bio?: string | null;
  external_link?: string | null;
  is_test_account?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  profileLoading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const profileLoadedUserRef = useRef<string | null>(null);

  // 根据 user 拉取 profile（带异常保护）
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const [{ data }, { data: bioRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("nickname, avatar_url, external_link, is_test_account")
          .eq("id", userId)
          .single(),
        supabase.rpc("get_public_profile_bios", { p_user_ids: [userId] }),
      ]);
      const bioRow = Array.isArray(bioRows)
        ? bioRows.find((entry: { profile_id: string; bio: unknown }) => entry.profile_id === userId)
        : null;
      return data
        ? { nickname: data.nickname, avatar_url: data.avatar_url, bio: typeof bioRow?.bio === "string" ? bioRow.bio : null, external_link: data.external_link, is_test_account: data.is_test_account === true }
        : null;
    } catch {
      return null;
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      profileLoadedUserRef.current = null;
      return;
    }
    const wasProfileReady = profileLoadedUserRef.current === userId;
    if (!wasProfileReady) setProfileLoading(true);
    const nextProfile = await fetchProfile(userId);
    setProfile(nextProfile);
    profileLoadedUserRef.current = userId;
    if (!wasProfileReady) setProfileLoading(false);
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
      // 如果同一个人（相同 user ID），只同步最新对象，不重复拉取 profile。
      if (u && userIdRef.current === u.id) {
        // USER_UPDATED 会携带最新的用户元数据（例如性别、出生日期、兴趣偏好）。
        // 保留同一账号的会话状态，同时同步这份新对象，避免设置页继续显示旧值。
        setUser(u);
        if (active) setLoading(false);
        if (profileLoadedUserRef.current !== u.id) {
          if (active) setProfileLoading(true);
          const nextProfile = await fetchProfile(u.id);
          if (!active || version !== authStateVersion) return;
          setProfile(nextProfile);
          saveCachedProfile(u.id, nextProfile);
          profileLoadedUserRef.current = u.id;
          setProfileLoading(false);
        } else if (active) {
          setProfileLoading(false);
        }
        return;
      }
      userIdRef.current = u?.id || null;
      setUser(u);
      profileLoadedUserRef.current = null;

      if (!u) {
        if (active) {
          setProfile(null);
          setLoading(false);
          setProfileLoading(false);
          profileLoadedUserRef.current = null;
        }
        return;
      }

      // 缓存可供页面先行显示，但需要等当前账号的实时资料查询完成后，
      // 编辑表单才把该资料作为可编辑的初始值。
      const cachedProfile = readCachedProfile(u.id);
      setProfile(cachedProfile);
      if (active) setProfileLoading(true);
      if (active) setLoading(false);

      const nextProfile = await fetchProfile(u.id);
      if (!active || version !== authStateVersion) return;
      setProfile(nextProfile);
      saveCachedProfile(u.id, nextProfile);
      profileLoadedUserRef.current = u.id;
      setProfileLoading(false);
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
      setProfileLoading(false);
      profileLoadedUserRef.current = null;
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    profileLoadedUserRef.current = null;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, profileLoading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
