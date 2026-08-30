"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MODERATION_REASON_OPTIONS } from "@shared/moderationReasons";

type ModerationMode = "report" | "block";

interface ModerationReasonModalProps {
  open: boolean;
  mode: ModerationMode;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (reason: string, details?: string) => void;
}
const OTHER_REASON = "其他违规";

export default function ModerationReasonModal({ open, mode, submitting = false, onClose, onSubmit }: ModerationReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedReason("");
      setCustomReason("");
    }
  }, [open, mode]);

  if (!open) return null;

  return createPortal(
    (
    <div className="modal-overlay moderation-modal-overlay active" onClick={onClose}>
      <div className="modal moderation-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">{mode === "report" ? "举报原因" : "确认屏蔽"}</div>
        <div className="modal-body">
          {mode === "report" ? (
            <>
              <ul className="report-reason-list">
                {MODERATION_REASON_OPTIONS.map((reason) => (
                  <li
                    key={reason}
                    className={`report-reason-item${selectedReason === reason ? " selected" : ""}`}
                    onClick={() => setSelectedReason(reason)}
                  >
                    <span className="report-reason-radio" />
                    {reason}
                  </li>
                ))}
              </ul>
              {selectedReason === OTHER_REASON && (
                <textarea
                  className="moderation-custom-reason"
                  value={customReason}
                  onChange={(event) => setCustomReason(event.target.value)}
                  placeholder="请填写举报理由"
                  rows={3}
                  autoFocus
                />
              )}
            </>
          ) : (
            <p>确定要屏蔽该用户吗？屏蔽后，该用户将无法与您产生任何互动。</p>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-modal btn-modal-cancel" onClick={onClose}>取消</button>
          <button
            className={`btn-modal ${mode === "report" ? "btn-modal-primary" : "btn-modal-danger"}`}
            onClick={() => onSubmit(mode === "report" ? selectedReason : "", mode === "report" && selectedReason === OTHER_REASON ? customReason.trim() : undefined)}
            disabled={submitting || (mode === "report" && (!selectedReason || (selectedReason === OTHER_REASON && !customReason.trim())))}
          >
            {submitting ? "提交中..." : mode === "report" ? "提交举报" : "确认屏蔽"}
          </button>
        </div>
      </div>
    </div>
    ),
    document.body,
  );
}
