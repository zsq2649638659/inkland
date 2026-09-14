"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import Tag from "./Tag";

export interface InklandTagInputProps {
  label?: ReactNode;
  tags: string[];
  inputValue: string;
  onChange: (tags: string[]) => void;
  onInputValueChange: (value: string) => void;
  placeholder?: string;
  maxTagLength?: number;
  disabled?: boolean;
  readOnly?: boolean;
  fieldClassName?: string;
  inputId?: string;
  suggestedTags?: string[];
  onSelectSuggestedTag?: (tag: string) => void;
}

export default function TagInput({
  label,
  tags,
  inputValue,
  onChange,
  onInputValueChange,
  placeholder = "输入标签，按回车添加",
  maxTagLength = 20,
  disabled = false,
  readOnly = false,
  fieldClassName,
  inputId: providedInputId,
  suggestedTags = [],
  onSelectSuggestedTag,
}: InklandTagInputProps) {
  const generatedId = useId();
  const inputId = providedInputId || `ink-tag-input-${generatedId}`;

  const add = () => {
    const value = inputValue.trim().slice(0, maxTagLength);
    if (!value || tags.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    onChange([...tags, value]);
    onInputValueChange("");
  };

  const availableSuggestedTags = [...new Set(suggestedTags)]
    .filter((tag) => !tags.some((selectedTag) => selectedTag.toLocaleLowerCase() === tag.toLocaleLowerCase()))
    .slice(0, 10);

  const selectSuggestedTag = (tag: string) => {
    if (onSelectSuggestedTag) {
      onSelectSuggestedTag(tag);
      onInputValueChange("");
      return;
    }
    onChange([...tags, tag]);
    onInputValueChange("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
    if (event.key === "Backspace" && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className={["ink-field", "ink-tag-input", fieldClassName || ""].filter(Boolean).join(" ")}>
      {label !== undefined ? <label className="ink-field__label" htmlFor={inputId}>{label}</label> : null}
      <div className="ink-tag-input__list" role="group" aria-label="已添加标签" onClick={(event) => {
        if (event.target === event.currentTarget) document.getElementById(inputId)?.focus();
      }}>
        {tags.map((tag) => <Tag key={tag} variant="site" removable disabled={disabled || readOnly} onRemove={() => onChange(tags.filter((item) => item !== tag))} removeLabel={`移除标签：${tag}`}>{tag}</Tag>)}
        {!readOnly ? <input id={inputId} className="ink-tag-input__field" type="text" value={inputValue} disabled={disabled} maxLength={maxTagLength} placeholder={placeholder} onChange={(event) => onInputValueChange(event.target.value)} onKeyDown={handleKeyDown} /> : null}
      </div>
      {!disabled && !readOnly && availableSuggestedTags.length > 0 ? (
        <div className="ink-tag-input__suggestions" aria-label="最近使用标签">
          <span className="ink-tag-input__suggestions-label">近期使用标签</span>
          <div className="ink-tag-input__suggestion-list" role="list">
            {availableSuggestedTags.map((tag) => (
              <Tag key={tag} variant="outline" onClick={() => selectSuggestedTag(tag)}>{tag}</Tag>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
