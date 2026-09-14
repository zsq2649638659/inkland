"use client";

import { type InputHTMLAttributes, type ReactNode, useEffect, useRef } from "react";

export interface InklandCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  children?: ReactNode;
  indeterminate?: boolean;
  as?: "label" | "span";
}

export default function Checkbox({
  as = "label",
  children,
  className,
  disabled,
  indeterminate = false,
  ...inputProps
}: InklandCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const rootClassName = [
    "ink-checkbox",
    as === "span" ? "ink-checkbox--standalone" : "",
    disabled ? "ink-checkbox--disabled" : "",
    className || "",
  ].filter(Boolean).join(" ");

  const content = (
    <>
      <input
        {...inputProps}
        ref={inputRef}
        type="checkbox"
        className="ink-checkbox__input"
        disabled={disabled}
        aria-checked={indeterminate ? "mixed" : inputProps["aria-checked"]}
      />
      <span className="ink-checkbox__control" aria-hidden="true" />
      {children !== undefined && <span className="ink-checkbox__label">{children}</span>}
    </>
  );

  if (as === "span") {
    return <span className={rootClassName}>{content}</span>;
  }

  return <label className={rootClassName}>{content}</label>;
}
