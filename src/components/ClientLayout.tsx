"use client";

import { useEffect, useState } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { MobileDrawerProvider } from "@/components/MobileDrawerContext";
import Navbar from "@/components/Navbar";
import MobileDrawer from "@/components/MobileDrawer";
import { AppDialogProvider } from "@/components/AppDialogProvider";

function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`back-to-top${visible ? " show" : ""}`}
    >
      <i className="fa-solid fa-arrow-up" aria-hidden="true" />
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
