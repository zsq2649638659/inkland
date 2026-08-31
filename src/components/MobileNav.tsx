"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { formatNotificationCount } from "@/lib/notifications";
import { getOrCreateClientCache, readClientCache } from "@/lib/client-cache";

export default function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const cached = readClientCache<number>(`notification-count:${user.id}`, 30_000, true);
    if (cached !== undefined) setNotificationCount(cached);
    const fetchCount = () => {
      void getOrCreateClientCache(`notification-count:${user.id}`, async () => {
        const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false)
        return count || 0;
      }, { ttlMs: 30_000, persist: true }).then((count) => setNotificationCount(count));
    };
    if (cached === undefined) fetchCount();
    const timer = window.setInterval(fetchCount, 30_000);
    return () => window.clearInterval(timer);
  }, [user, supabase]);

  const navItems = [
    { href: "/", label: "首页", icon: "fa-house" },
    { href: "/discover", label: "发现", icon: "fa-compass" },
    { href: "/create", label: "发布", icon: "fa-circle-plus" },
    { href: "/notifications", label: "通知", icon: "fa-bell", style: "far", badge: notificationCount },
    { href: user ? "/profile" : "/login", label: user ? "我的" : "登录", icon: "fa-user", style: "far" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-rule z-50 lg:hidden">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center text-xs gap-0.5 no-underline relative ${
              pathname === item.href ? "text-accent" : "text-muted"
            }`}
          >
            <div className="relative">
              <i
                className={`${item.style || "fa-solid"} ${item.icon} text-lg`}
              />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-primary text-white text-[10px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 leading-none">
                  {formatNotificationCount(item.badge)}
                </span>
              )}
            </div>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
