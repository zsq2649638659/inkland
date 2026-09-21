"use client";
import SiteIcon from "@/components/SiteIcon";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/components/AuthProvider";
import { MobileDrawerProvider } from "@/components/MobileDrawerContext";
import Navbar from "@/components/Navbar";
import MobileDrawer from "@/components/MobileDrawer";
import { AppDialogProvider } from "@/components/AppDialogProvider";

function BackToTop() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => {
      const threshold = Math.min(600, Math.max(160, Math.round(window.innerHeight * 0.75)));
      setVisible(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (pathname.startsWith("/read/")) return null;

  return (
    <button
      type="button"
      aria-label="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`floating-btn floating-backtop back-to-top${visible ? " show" : ""}`}
    >
      <SiteIcon name="fa-detail-back-to-top" size={22} aria-hidden="true" />
    </button>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppDialogProvider>
        <MobileDrawerProvider>
          <Navbar />
          <MobileDrawer />
          {children}
          <BackToTop />
        </MobileDrawerProvider>
      </AppDialogProvider>
    </AuthProvider>
  );
}
