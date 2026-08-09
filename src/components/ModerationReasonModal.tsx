"use client";

import { useEffect, useMemo, useState } from "react";

type ModerationMode = "report" | "block";

interface ModerationReasonModalProps {
  open: boolean;
  mode: ModerationMode;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

const REPORT_REASONS = ["垃圾广告", "色情低俗内容", "人身攻击与辱骂", "违法违规内容", "引战与恶意引战", "其他"];
const BLOCK_REASONS = ["频繁打扰", "广告或垃圾信息", "人身攻击与辱骂", "不想看到对方的内容", "其他"];

export default function ModerationReasonModal({ open, mode, submitting = false, onClose, onSubmit }: ModerationReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const reasons = mode === "report" ? REPORT_REASONS : BLOCK_REASONS;

  useEffect(() => {
    if (open) {
      setSelectedReason("");
      setCustomReason("");
    }
  }, [open, mode]);

  const finalReason = useMemo(
    () => selectedReason === "其他" ? customReason.trim() : selectedReason,
    [customReason, selectedReason],
  );

  if (!open) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal moderation-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">{mode === "report" ? "举报原因" : "屏蔽原因"}</div>
        <div className="modal-body">
          <ul className="report-reason-list">
            {reasons.map((reason) => (
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
          {selectedReason === "其他" && (
            <textarea
              className="moderation-custom-reason"
              value={customReason}
              onChange={(event) => setCustomReason(event.target.value)}
              placeholder={mode === "report" ? "请填写举报原因" : "请填写屏蔽原因"}
              rows={3}
              autoFocus
            />
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-modal btn-modal-cancel" onClick={onClose}>取消</button>
          <button
            className={`btn-modal ${mode === "report" ? "btn-modal-primary" : "btn-modal-danger"}`}
            onClick={() => onSubmit(finalReason)}
            disabled={submitting || !finalReason}
          >
            {submitting ? "提交中..." : mode === "report" ? "提交举报" : "确认屏蔽"}
          </button>
        </div>
      </div>
    </div>
  );
}
