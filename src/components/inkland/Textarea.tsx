"use client";

import {
  forwardRef,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ForwardedRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { InputHistoryPopover, useInputHistory } from "./InputHistoryPopover";
import type { InputHistoryField } from "@/lib/inputHistory";

export type InklandTextareaStatus = "default" | "success" | "warning" | "error";
export type InklandTextareaHeight = "fixed" | "autosize" | "minmax";
export type InklandTextareaAutosize = boolean | { minRows?: number; maxRows?: number };

export interface InklandTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  success?: ReactNode;
  warning?: ReactNode;
  status?: InklandTextareaStatus;
  height?: InklandTextareaHeight;
  autosize?: InklandTextareaAutosize;
  fieldClassName?: string;
  showLimitNumber?: boolean;
  historyKey?: InputHistoryField;
  historyLabel?: string;
  onHistorySelect?: (value: string) => void;
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function measureLength(value: string) {
  return Array.from(value).length;
}

const Textarea = forwardRef<HTMLTextAreaElement, InklandTextareaProps>(function Textarea(
  {
    label,
    hint,
    error,
    success,
    warning,
    status = error ? "error" : success ? "success" : warning ? "warning" : "default",
    height,
    autosize = false,
    fieldClassName,
    showLimitNumber,
    maxLength,
    historyKey,
    historyLabel = "输入内容",
    onHistorySelect,
    value,
    defaultValue,
    id: providedId,
    className,
    autoComplete: providedAutoComplete,
    disabled,
    readOnly,
    onChange,
    onFocus: providedOnFocus,
    onBlur: providedOnBlur,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId || `ink-textarea-${generatedId}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialValue = defaultValue == null ? "" : String(defaultValue);
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const currentValue = value == null ? uncontrolledValue : String(value);
  const shouldShowLimitNumber = showLimitNumber ?? (typeof maxLength === "number" && maxLength >= 0);
  const feedback = error || warning || success;
  const hintId = hint ? `${id}-hint` : undefined;
  const feedbackId = feedback ? `${id}-feedback` : undefined;
  const counterId = shouldShowLimitNumber && typeof maxLength === "number" && maxLength >= 0 ? `${id}-counter` : undefined;
  const describedBy = [ariaDescribedBy, hintId, feedbackId, counterId].filter(Boolean).join(" ") || undefined;
  const isAutosize = Boolean(autosize) || height === "autosize" || height === "minmax";
  const fieldClasses = ["ink-field", `ink-field--${status}`, fieldClassName].filter(Boolean).join(" ");
  const textareaClasses = [
    "ink-textarea",
    height ? `ink-textarea--height-${height}` : "",
    counterId ? "ink-textarea--with-counter" : "",
    isAutosize ? "ink-textarea--autosize" : "",
    className || "",
  ].filter(Boolean).join(" ");
  const inputHistory = useInputHistory({
    field: historyKey,
    value: currentValue,
    disabled,
    readOnly,
    onSelect: (nextValue) => onHistorySelect?.(nextValue),
  });

  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !isAutosize) return;
    const config = typeof autosize === "object" ? autosize : {};
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
    const padding = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
    const border = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
    const minRows = config.minRows ?? (height === "minmax" ? 3 : 1);
    const maxRows = config.maxRows ?? (height === "minmax" ? 7 : Number.POSITIVE_INFINITY);
    const minHeight = lineHeight * minRows + padding + border;
    const maxHeight = lineHeight * maxRows + padding + border;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [autosize, height, isAutosize]);

  useLayoutEffect(() => {
    resize();
  }, [currentValue, resize]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    if (value == null) setUncontrolledValue(nextValue);
    onChange?.(event);
    window.requestAnimationFrame(resize);
  };

  return (
    <div className={fieldClasses}>
      {label !== undefined ? <label className="ink-field__label" htmlFor={id}>{label}</label> : null}
      <div ref={inputHistory.controlRef} className="ink-field__control">
        <textarea
          {...props}
          ref={(node) => {
            textareaRef.current = node;
            assignRef(ref, node);
          }}
          id={id}
          className={textareaClasses}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          autoComplete={historyKey ? "off" : providedAutoComplete}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={handleChange}
          onFocus={(event) => { inputHistory.handleFocus(); providedOnFocus?.(event); }}
          onBlur={(event) => { inputHistory.handleBlur(); providedOnBlur?.(event); }}
        />
        {counterId ? <output className={`ink-textarea__counter${measureLength(currentValue) > maxLength! ? " ink-textarea__counter--over" : ""}`} id={counterId} aria-live="polite">{measureLength(currentValue)} / {maxLength}</output> : null}
        {inputHistory.open ? <InputHistoryPopover entries={inputHistory.entries} label={historyLabel} placement={inputHistory.placement} popoverRef={inputHistory.popoverRef} style={inputHistory.position} onSelect={inputHistory.handleSelect} /> : null}
      </div>
      {hint ? <p className="ink-field__hint" id={hintId}>{hint}</p> : null}
      {feedback ? <p className={`ink-field__feedback ink-field__feedback--${status}`} id={feedbackId} role={error ? "alert" : "status"}>{feedback}</p> : null}
    </div>
  );
});

export default Textarea;
