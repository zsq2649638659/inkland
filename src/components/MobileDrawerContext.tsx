"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface MobileDrawerCtx {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const Ctx = createContext<MobileDrawerCtx>({
  open: false,
  openDrawer: () => {},
  closeDrawer: () => {},
});

export function MobileDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  return <Ctx.Provider value={{ open, openDrawer, closeDrawer }}>{children}</Ctx.Provider>;
}

export function useMobileDrawer() {
  return useContext(Ctx);
}