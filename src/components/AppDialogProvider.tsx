"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DialogVariant = "default" | "danger" | "success";

interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  variant?: DialogVariant;
  required?: boolean;
}

interface DialogState extends DialogOptions {
  kind: "alert" | "confirm" | "prompt";
  resolve: (value: boolean | string | null) => void;
}

interface ToastState {
  id: number;
  message: string;
  variant: DialogVariant;
}

interface AppDialogContextValue {
  alert: (options: DialogOptions) => Promise<void>;
  confirm: (options: DialogOptions) => Promise<boolean>;
  prompt: (options: DialogOptions) => Promise<string | null>;
  toast: (message: string, variant?: DialogVariant) => void;
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const openDialog = useCallback((options: DialogOptions, kind: DialogState["kind"]) => {
    return new Promise<boolean | string | null>((resolve) => {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      setPromptValue("");
      setDialog({ ...options, kind, resolve });
    });
  }, []);

  const closeDialog = useCallback((value: boolean | string | null) => {
    setDialog((current) => {
      current?.resolve(value);
      return null;
    });
    window.setTimeout(() => lastFocusedRef.current?.focus(), 0);
  }, []);

  const alert = useCallback(async (options: DialogOptions) => {
    await openDialog(options, "alert");
  }, [openDialog]);

  const confirm = useCallback(async (options: DialogOptions) => {
    return Boolean(await openDialog(options, "confirm"));
  }, [openDialog]);

  const prompt = useCallback(async (options: DialogOptions) => {
    const result = await openDialog(options, "prompt");
    return typeof result === "string" ? result : null;
  }, [openDialog]);

  const toast = useCallback((message: string, variant: DialogVariant = "success") => {
    setToastState({ id: Date.now(), message, variant });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      if (dialog.kind === "prompt") promptRef.current?.focus();
      else confirmButtonRef.current?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog(dialog.kind === "alert" ? true : null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dialog, closeDialog]);

  useEffect(() => {
    if (!toastState) return;
    const timer = window.setTimeout(() => setToastState(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastState]);

  const submit = () => {
    if (!dialog) return;
    if (dialog.kind === "prompt") {
      const value = promptValue.trim();
      if (dialog.required && !value) return;
      closeDialog(value || null);
      return;
    }
    closeDialog(true);
  };

  return (
    <AppDialogContext.Provider value={{ alert, confirm, prompt, toast }}>
      {children}
      {typeof document !== "undefined" && dialog && createPortal(
        <div className="app-dialog-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget && dialog.kind !== "alert") closeDialog(null);
        }}>
          <section
            className={`app-dialog app-dialog-${dialog.variant || "default"}`}
            role={dialog.kind === "alert" ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            aria-describedby="app-dialog-message"
          >
            <div className="app-dialog-icon" aria-hidden="true">
              <i className={`fa-solid ${dialog.variant === "danger" ? "fa-trash-can" : dialog.variant === "success" ? "fa-circle-check" : "fa-circle-info"}`} />
            </div>
            <h2 id="app-dialog-title">{dialog.title}</h2>
            <p id="app-dialog-message">{dialog.message}</p>
            {dialog.kind === "prompt" && (
              <textarea
                ref={promptRef}
                className="app-dialog-input"
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                placeholder={dialog.placeholder}
                rows={4}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
                }}
              />
            )}
            <div className="app-dialog-actions">
              {dialog.kind !== "alert" && (
                <button type="button" className="app-dialog-cancel" onClick={() => closeDialog(null)}>
                  {dialog.cancelLabel || "取消"}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                type="button"
                className="app-dialog-confirm"
                onClick={submit}
                disabled={dialog.kind === "prompt" && dialog.required && !promptValue.trim()}
              >
                {dialog.confirmLabel || (dialog.kind === "alert" ? "知道了" : "确认")}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
      {typeof document !== "undefined" && toastState && createPortal(
        <div key={toastState.id} className={`app-toast app-toast-${toastState.variant}`} role="status" aria-live="polite">
          <i className={`fa-solid ${toastState.variant === "danger" ? "fa-circle-exclamation" : "fa-circle-check"}`} aria-hidden="true" />
          <span>{toastState.message}</span>
        </div>,
        document.body
      )}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("useAppDialog must be used within AppDialogProvider");
  return context;
}
