"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { MobileDrawerProvider } from "@/components/MobileDrawerContext";
import Navbar from "@/components/Navbar";
import MobileDrawer from "@/components/MobileDrawer";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <MobileDrawerProvider>
        <Navbar />
        <MobileDrawer />
        {children}
      </MobileDrawerProvider>
    </AuthProvider>
  );
}