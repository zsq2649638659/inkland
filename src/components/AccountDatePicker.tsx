"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface AccountDatePickerProps {
  value: string;
  onChange: (value: string) => void;
}

const MIN_DATE = "1900-01-01";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toMonthValue(date: Date) {
  return toDateValue(date).slice(0, 7);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${year}年${Number(month)}月${Number(day)}日` : "选择出生日期";
}

export default function AccountDatePicker({ value, onChange }: AccountDatePickerProps) {
  const todayValue = useMemo(() => toDateValue(new Date()), []);
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(value ? value.slice(0, 7) : toMonthValue(new Date()));
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closePicker = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const calendarMonthDate = new Date(`${calendarMonth}-01T00:00:00`);
  const calendarYear = calendarMonthDate.getFullYear();
  const calendarMonthIndex = calendarMonthDate.getMonth();
  const firstWeekday = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const calendarDays = Array.from(
    { length: firstWeekday + daysInMonth },
    (_, index) => index < firstWeekday ? null : index - firstWeekday + 1,
  );

  function togglePicker() {
    if (!open) setCalendarMonth(value ? value.slice(0, 7) : toMonthValue(new Date()));
    setOpen((current) => !current);
  }

  function changeMonth(offset: number) {
    const next = new Date(calendarYear, calendarMonthIndex + offset, 1);
    const nextMonth = toMonthValue(next);
    setCalendarMonth(nextMonth < MIN_DATE.slice(0, 7) ? MIN_DATE.slice(0, 7) : nextMonth > todayValue.slice(0, 7) ? todayValue.slice(0, 7) : nextMonth);
  }

  function changeYear(offset: number) {
    const next = new Date(calendarYear + offset, calendarMonthIndex, 1);
    const nextMonth = toMonthValue(next);
    setCalendarMonth(nextMonth < MIN_DATE.slice(0, 7) ? MIN_DATE.slice(0, 7) : nextMonth > todayValue.slice(0, 7) ? todayValue.slice(0, 7) : nextMonth);
  }

  return (
    <div className="account-date-picker" ref={pickerRef}>
      <button
        type="button"
        className={`account-date-trigger${value ? " selected" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={togglePicker}
      >
        <span><i className="fa-regular fa-calendar-days" aria-hidden="true" /> {formatDate(value)}</span>
        <i className={`fa-solid fa-chevron-down${open ? " up" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="account-calendar-popover" role="dialog" aria-label="选择出生日期">
          <div className="account-calendar-header">
            <button
              type="button"
              aria-label="上一年"
              disabled={calendarMonth <= MIN_DATE.slice(0, 7)}
              onClick={() => changeYear(-1)}
            >
              <i className="fa-solid fa-angles-left" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="上个月"
              disabled={calendarMonth <= MIN_DATE.slice(0, 7)}
              onClick={() => changeMonth(-1)}
            >
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
            <strong>{calendarYear} 年 {calendarMonthIndex + 1} 月</strong>
            <button
              type="button"
              aria-label="下个月"
              disabled={calendarMonth >= todayValue.slice(0, 7)}
              onClick={() => changeMonth(1)}
            >
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="下一年"
              disabled={calendarMonth >= todayValue.slice(0, 7)}
              onClick={() => changeYear(1)}
            >
              <i className="fa-solid fa-angles-right" aria-hidden="true" />
            </button>
          </div>
          <div className="account-calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="account-calendar-grid">
            {calendarDays.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
              const dayValue = `${calendarMonth}-${String(day).padStart(2, "0")}`;
              const isSelected = value === dayValue;
              const isFuture = dayValue > todayValue;
              const isTooOld = dayValue < MIN_DATE;
              return (
                <button
                  type="button"
                  key={dayValue}
                  className={`${isSelected ? "selected" : ""}${dayValue === todayValue ? " today" : ""}${isFuture || isTooOld ? " disabled" : ""}`}
                  disabled={isFuture || isTooOld}
                  aria-label={`${calendarYear}年${calendarMonthIndex + 1}月${day}日`}
                  onClick={() => { onChange(dayValue); setOpen(false); }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="account-calendar-footer">
            <span>请选择真实出生日期，未来日期不可选</span>
            {value && <button type="button" onClick={() => { onChange(""); setOpen(false); }}>清除日期</button>}
          </div>
        </div>
      )}
    </div>
  );
}
