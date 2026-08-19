"use client";

import { createPortal } from "react-dom";

export default function CenteredToast({ message }: { message: string }) {
  if (!message || typeof document === "undefined") return null;
  return createPortal(<div className="toast show">{message}</div>, document.body);
}
