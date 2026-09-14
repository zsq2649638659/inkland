"use client";

import { type InputHTMLAttributes, type ReactNode } from "react";

export interface InklandRadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  children?: ReactNode;
  variant?: "card" | "control";
}

export default function Radio({
  children,
  className,
  disabled,
  variant = "card",
  ...inputProps
}: InklandRadioProps) {
  const rootClassName = [
    "ink-radio",
    `ink-radio--${variant}`,
    disabled ? "ink-radio--disabled" : "",
    className || "",
  ].filter(Boolean).join(" ");

  return (
    <label className={rootClassName}>
      <input {...inputProps} type="radio" className="ink-radio__input" disabled={disabled} />
      <span className="ink-radio__control" aria-hidden="true" />
      {children !== undefined && <span className="ink-radio__content">{children}</span>}
    </label>
  );
}
