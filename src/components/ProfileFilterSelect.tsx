"use client";

import { useEffect, useRef, useState } from "react";
import SiteIcon from "@/components/SiteIcon";

export default function ProfileFilterSelect({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <label className="filter-system-field">
      <span>{label}</span>
      <span className="filter-system-select-wrap">
        <div className="custom-select" data-select ref={rootRef}>
          <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((current) => !current)}>
            <span data-select-label>{active.label}</span>
            <SiteIcon name="fa-chevron-right" variant="solid" aria-hidden="true" style={{ transform: `rotate(${open ? "-90deg" : "90deg"})` }} />
          </button>
          <div className="select-menu" id={id} role="listbox" aria-label={label} hidden={!open}>
            {options.map((option) => (
              <button key={option.value} className="select-option" type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </span>
    </label>
  );
}
