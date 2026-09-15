"use client";

import {
  forwardRef,
  useId,
  type ForwardedRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { InputHistoryPopover, useInputHistory } from "./InputHistoryPopover";
import type { InputHistoryField } from "@/lib/inputHistory";

export type InklandInputStatus = "default" | "success" | "warning" | "error";

export interface InklandInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  success?: ReactNode;
  warning?: ReactNode;
  status?: InklandInputStatus;
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

const Input = forwardRef<HTMLInputElement, InklandInputProps>(function Input(
  {
    label,
    hint,
    error,
    success,
    warning,
    status = error ? "error" : success ? "success" : warning ? "warning" : "default",
    fieldClassName,
    showLimitNumber,
    id: providedId,
    className,
    disabled,
    readOnly,
    value,
    defaultValue,
    maxLength,
    autoComplete: providedAutoComplete,
    historyKey,
    historyLabel = "输入内容",
    onHistorySelect,
    "aria-describedby": ariaDescribedBy,
    onFocus: providedOnFocus,
    onBlur: providedOnBlur,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId || `ink-input-${generatedId}`;
  const currentValue = value == null ? String(defaultValue ?? "") : String(value);
  const shouldShowLimitNumber = showLimitNumber ?? (typeof maxLength === "number" && maxLength >= 0);
  const feedback = error || warning || success;
  const hintId = hint ? `${id}-hint` : undefined;
  const feedbackId = feedback ? `${id}-feedback` : undefined;
  const counterId = shouldShowLimitNumber && typeof maxLength === "number" && maxLength >= 0 ? `${id}-counter` : undefined;
  const describedBy = [ariaDescribedBy, hintId, feedbackId, counterId].filter(Boolean).join(" ") || undefined;
  const fieldClasses = ["ink-field", `ink-field--${status}`, fieldClassName].filter(Boolean).join(" ");
  const inputClasses = ["ink-input", counterId ? "ink-input--with-counter" : "", className].filter(Boolean).join(" ");
  const inputHistory = useInputHistory({
    field: historyKey,
    value: currentValue,
    disabled,
    readOnly,
    onSelect: (nextValue) => {
      onHistorySelect?.(nextValue);
    },
  });

  return (
    <div className={fieldClasses}>
      {label !== undefined ? <label className="ink-field__label" htmlFor={id}>{label}</label> : null}
      <div ref={inputHistory.controlRef} className="ink-field__control">
        <input
          {...props}
          ref={(node) => assignRef(ref, node)}
          id={id}
          className={inputClasses}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          autoComplete={historyKey ? "off" : providedAutoComplete}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={(event) => { inputHistory.handleFocus(); providedOnFocus?.(event); }}
          onBlur={(event) => { inputHistory.handleBlur(); providedOnBlur?.(event); }}
        />
        {counterId ? <output className={`ink-input__counter${measureLength(currentValue) > maxLength! ? " ink-input__counter--over" : ""}`} id={counterId} aria-live="polite">{measureLength(currentValue)} / {maxLength}</output> : null}
        {inputHistory.open ? <InputHistoryPopover entries={inputHistory.entries} label={historyLabel} placement={inputHistory.placement} popoverRef={inputHistory.popoverRef} style={inputHistory.position} onSelect={inputHistory.handleSelect} /> : null}
      </div>
      {hint ? <p className="ink-field__hint" id={hintId}>{hint}</p> : null}
      {feedback ? <p className={`ink-field__feedback ink-field__feedback--${status}`} id={feedbackId} role={error ? "alert" : "status"}>{feedback}</p> : null}
    </div>
  );
});

export default Input;
