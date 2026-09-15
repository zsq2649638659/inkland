"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { getInputHistory, rememberInputHistory, type InputHistoryField } from "@/lib/inputHistory";

type InputHistoryPlacement = "above" | "below";

interface InputHistoryPopoverProps {
  entries: string[];
  label: string;
  placement: InputHistoryPlacement;
  popoverRef: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  onSelect: (value: string) => void;
}

function previewValue(value: string) {
  const preview = value.replace(/\s+/g, " ").trim();
  return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
}

export function InputHistoryPopover({ entries, label, placement, popoverRef, style, onSelect }: InputHistoryPopoverProps) {
  return (
    <div
      ref={popoverRef}
      className={`ink-input-history ink-input-history--${placement}`}
      style={style}
      role="listbox"
      aria-label={`${label}历史记录`}
    >
      <div className="ink-input-history__label">最近输入</div>
      <div className="ink-input-history__list">
        {entries.map((entry, index) => {
          const preview = previewValue(entry);
          return (
            <button
              type="button"
              className="ink-input-history__item"
              role="option"
              aria-label={`使用历史${label}：${preview}`}
              title={entry}
              key={`${entry}-${index}`}
              onPointerDown={(event) => {
                event.preventDefault();
                onSelect(entry);
              }}
              onClick={(event) => {
                // Pointer activation is handled above; detail 0 is keyboard activation.
                if (event.detail === 0) onSelect(entry);
              }}
            >
              <span className="ink-input-history__item-text">{preview}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function useInputHistory({
  field,
  value,
  disabled = false,
  readOnly = false,
  onSelect,
}: {
  field?: InputHistoryField;
  value: string;
  disabled?: boolean;
  readOnly?: boolean;
  onSelect: (value: string) => void;
}) {
  const controlRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<InputHistoryPlacement>("below");
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  const updatePlacement = useCallback(() => {
    const control = controlRef.current;
    const popover = popoverRef.current;
    if (!control || !popover) return;
    const controlRect = control.getBoundingClientRect();
    const popoverHeight = popover.getBoundingClientRect().height;
    const gap = 8;
    const spaceBelow = window.innerHeight - controlRect.bottom;
    const spaceAbove = controlRect.top;
    const nextPlacement = spaceBelow < popoverHeight + gap && spaceAbove > spaceBelow ? "above" : "below";
    const availableWidth = Math.max(0, window.innerWidth - 16);
    const width = Math.min(controlRect.width, availableWidth);
    const left = Math.max(8, Math.min(controlRect.left, window.innerWidth - width - 8));
    const top = nextPlacement === "above"
      ? Math.max(8, controlRect.top - popoverHeight - gap)
      : Math.min(Math.max(8, controlRect.bottom + gap), Math.max(8, window.innerHeight - popoverHeight - 8));
    setPlacement((current) => current === nextPlacement ? current : nextPlacement);
    setPosition({ top, left, width, visibility: "visible" });
  }, []);

  const handleFocus = useCallback(() => {
    if (!field || disabled || readOnly || value.trim()) return;
    const nextEntries = getInputHistory(field);
    setEntries(nextEntries);
    setPosition({ visibility: "hidden" });
    setOpen(nextEntries.length > 0);
  }, [disabled, field, readOnly, value]);

  const handleBlur = useCallback(() => {
    if (field && value.trim()) rememberInputHistory(field, value);
    window.setTimeout(() => {
      if (!controlRef.current?.contains(document.activeElement)) setOpen(false);
    }, 0);
  }, [field, value]);

  const handleSelect = useCallback((nextValue: string) => {
    onSelect(nextValue);
    setOpen(false);
    setPosition({ visibility: "hidden" });
  }, [onSelect]);

  useEffect(() => {
    if (!open) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const syncPlacement = () => updatePlacement();
    const frame = window.requestAnimationFrame(syncPlacement);
    window.addEventListener("resize", syncPlacement);
    window.addEventListener("scroll", syncPlacement, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncPlacement);
      window.removeEventListener("scroll", syncPlacement, true);
    };
  }, [entries.length, open, updatePlacement]);

  useEffect(() => {
    if (open && value.trim()) setOpen(false);
  }, [open, value]);

  return {
    controlRef,
    popoverRef,
    entries,
    open,
    placement,
    position,
    handleFocus,
    handleBlur,
    handleSelect,
  };
}
