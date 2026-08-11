"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DialogOptions { title:string; message:string; confirmLabel?:string; cancelLabel?:string; variant?:"default"|"danger"; }
interface DialogState extends DialogOptions { kind:"alert"|"confirm"; resolve:(value:boolean)=>void; }
interface AdminDialogValue {
  alert:(options:DialogOptions)=>Promise<void>;
  confirm:(options:DialogOptions)=>Promise<boolean>;
}

const AdminDialogContext = createContext<AdminDialogValue | null>(null);

export function AdminDialogProvider({ children }:{ children:React.ReactNode }) {
  const [dialog,setDialog] = useState<DialogState | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((options:DialogOptions,kind:DialogState["kind"]) => new Promise<boolean>((resolve) => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setDialog({ ...options,kind,resolve });
  }),[]);
  const close = useCallback((value:boolean) => {
    setDialog((current) => { current?.resolve(value); return null; });
    window.setTimeout(() => previousFocus.current?.focus(),0);
  },[]);
  const alert = useCallback(async (options:DialogOptions) => { await open(options,"alert"); },[open]);
  const confirm = useCallback((options:DialogOptions) => open(options,"confirm"),[open]);

  useEffect(() => {
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => confirmRef.current?.focus(),0);
    const onKeyDown = (event:KeyboardEvent) => { if (event.key === "Escape") close(false); };
    document.addEventListener("keydown",onKeyDown);
    return () => { document.body.style.overflow = overflow; window.clearTimeout(timer); document.removeEventListener("keydown",onKeyDown); };
  },[dialog,close]);

  return <AdminDialogContext.Provider value={{ alert,confirm }}>
    {children}
    {typeof document !== "undefined" && dialog && createPortal(
      <div className="admin-dialog-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && dialog.kind === "confirm") close(false); }}>
        <section className={`admin-dialog admin-dialog-${dialog.variant || "default"}`} role={dialog.kind === "alert" ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="admin-dialog-title" aria-describedby="admin-dialog-message">
          <span className="admin-dialog-icon" aria-hidden="true">{dialog.variant === "danger" ? "!" : "i"}</span>
          <h2 id="admin-dialog-title">{dialog.title}</h2>
          <p id="admin-dialog-message">{dialog.message}</p>
          <div className="admin-dialog-actions">
            {dialog.kind === "confirm" && <button type="button" className="admin-dialog-cancel" onClick={() => close(false)}>{dialog.cancelLabel || "取消"}</button>}
            <button ref={confirmRef} type="button" className="admin-dialog-confirm" onClick={() => close(true)}>{dialog.confirmLabel || (dialog.kind === "alert" ? "知道了" : "确认")}</button>
          </div>
        </section>
      </div>,document.body
    )}
  </AdminDialogContext.Provider>;
}

export function useAdminDialog() {
  const context = useContext(AdminDialogContext);
  if (!context) throw new Error("useAdminDialog must be used within AdminDialogProvider");
  return context;
}
