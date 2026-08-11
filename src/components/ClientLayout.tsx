"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { MobileDrawerProvider } from "@/components/MobileDrawerContext";
import Navbar from "@/components/Navbar";
import MobileDrawer from "@/components/MobileDrawer";
import { AppDialogProvider } from "@/components/AppDialogProvider";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppDialogProvider>
        <MobileDrawerProvider>
          <Navbar />
          <MobileDrawer />
          {children}
        </MobileDrawerProvider>
      </AppDialogProvider>
    </AuthProvider>
  );
}
