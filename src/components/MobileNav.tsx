"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const navItems = [
    { href: "/", label: "首页", icon: "fa-house" },
    { href: "/discover", label: "发现", icon: "fa-compass" },
    { href: "/create", label: "发布", icon: "fa-circle-plus" },
    { href: "/notifications", label: "通知", icon: "fa-bell", style: "far" },
    { href: user ? "/profile" : "/login", label: user ? "我的" : "登录", icon: "fa-user", style: "far" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-rule z-50 lg:hidden">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center text-xs gap-0.5 no-underline ${
              pathname === item.href ? "text-accent" : "text-muted"
            }`}
          >
            <i
              className={`${item.style || "fa-solid"} fa-${item.icon} text-lg`}
            />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}