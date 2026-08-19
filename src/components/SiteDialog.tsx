"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

export type SiteDialogState = { title: string; message: string; mode?: "alert" | "confirm" | "prompt"; placeholder?: string } | null;

export function useSiteDialog() {
  const [dialog, setDialog] = useState<SiteDialogState>(null);
  const [resolver, setResolver] = useState<((value: string | boolean | null) => void) | null>(null);
  const open = (next: NonNullable<SiteDialogState>) => new Promise<string | boolean | null>((resolve) => { setDialog(next); setResolver(() => resolve); });
  const alertDialog = (message: string, title = "提示") => open({ title, message, mode: "alert" });
  const confirmDialog = (message: string, title = "请确认") => open({ title, message, mode: "confirm" });
  const promptDialog = (message: string, title = "请输入") => open({ title, message, mode: "prompt" });
  const close = (value: string | boolean | null) => { resolver?.(value); setResolver(null); setDialog(null); };
  return { dialog, close, alertDialog, confirmDialog, promptDialog };
}

export default function SiteDialog({ state, onClose }: { state: SiteDialogState; onClose: (value: string | boolean | null) => void }) {
  if (!state || typeof document === "undefined") return null;
  return <SiteDialogContent state={state} onClose={onClose} />;
}

function SiteDialogContent({ state, onClose }: { state: NonNullable<SiteDialogState>; onClose: (value: string | boolean | null) => void }) {
  const [value, setValue] = useState("");
  return createPortal(<div className="modal-overlay active site-dialog-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(state.mode === "alert" ? true : null); }}>
    <div className="modal site-dialog" role="dialog" aria-modal="true" aria-labelledby="site-dialog-title">
      <h2 className="modal-title" id="site-dialog-title">{state.title}</h2>
      <p className="site-dialog-message">{state.message}</p>
      {state.mode === "prompt" && <textarea className="site-dialog-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder={state.placeholder || "请填写内容"} rows={3} autoFocus />}
      <div className="modal-actions">
        {state.mode !== "alert" && <button type="button" className="btn-modal btn-modal-cancel" onClick={() => onClose(null)}>取消</button>}
        <button type="button" className="btn-modal btn-modal-primary" disabled={state.mode === "prompt" && !value.trim()} onClick={() => onClose(state.mode === "prompt" ? value.trim() : true)}>确认</button>
      </div>
    </div>
  </div>, document.body);
}
