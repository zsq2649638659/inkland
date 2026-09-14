"use client";

import { useEffect, useRef, useState } from "react";
import SiteIcon from "@/components/SiteIcon";

const LAST_SCHEDULE_TIME_KEY = "inkland:last-scheduled-publish-time";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export interface SchedulePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  hideLabels?: boolean;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localMonthValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

function validTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function defaultDateForTime(time: string, now = new Date()) {
  const today = localDateValue(now);
  if (!validTime(time)) return today;
  const [hour, minute] = time.split(":").map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return hour * 60 + minute <= currentMinutes ? addDays(today, 1) : today;
}

function ensureFutureDate(dateValue: string, time: string, now = new Date()) {
  const today = localDateValue(now);
  if (dateValue === today && validTime(time)) {
    const [hour, minute] = time.split(":").map(Number);
    if (hour * 60 + minute <= now.getHours() * 60 + now.getMinutes()) return addDays(today, 1);
  }
  return dateValue;
}

function dateLabel(value: string) {
  if (!value) return "选择日期";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "选择日期"
    : date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function valueParts(value: string) {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export default function SchedulePicker({ value, onChange, disabled = false, className, hideLabels = false }: SchedulePickerProps) {
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");
  const [monthValue, setMonthValue] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const initialisedRef = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const todayValue = localDateValue(new Date());
  const currentMonthValue = localMonthValue(new Date());
  const activeMonthValue = monthValue || currentMonthValue;
  const activeMonthDate = new Date(`${activeMonthValue}-01T00:00:00`);
  const calendarYear = activeMonthDate.getFullYear();
  const calendarMonth = activeMonthDate.getMonth();
  const firstWeekday = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarDays = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => (
    index < firstWeekday ? null : index - firstWeekday + 1
  ));
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const source = valueParts(value);
      if (initialisedRef.current) {
        if (source.date && source.time) {
          setDateValue(source.date);
          setTimeValue(source.time);
          setMonthValue(source.date.slice(0, 7));
        }
        return;
      }
      initialisedRef.current = true;
      const remembered = window.localStorage.getItem(LAST_SCHEDULE_TIME_KEY) || "";
      const nextTime = source.time || (validTime(remembered) ? remembered : "");
      const nextDate = source.date || defaultDateForTime(nextTime);
      setDateValue(nextDate);
      setTimeValue(nextTime);
      setMonthValue(nextDate.slice(0, 7));
      if (!source.date && nextTime) onChange(`${nextDate}T${nextTime}`);
      setInitialised(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [value, onChange]);

  useEffect(() => {
    if (!timeOpen) return;
    const hour = pickerRef.current?.querySelector<HTMLButtonElement>('[data-schedule-column="hour"][data-selected="true"]');
    const minute = pickerRef.current?.querySelector<HTMLButtonElement>('[data-schedule-column="minute"][data-selected="true"]');
    hour?.scrollIntoView({ block: "center" });
    minute?.scrollIntoView({ block: "center" });
  }, [timeOpen, timeValue]);

  const commit = (nextDate: string, nextTime: string) => {
    if (!nextDate || !validTime(nextTime)) return;
    const safeDate = ensureFutureDate(nextDate, nextTime);
    setDateValue(safeDate);
    setMonthValue(safeDate.slice(0, 7));
    setTimeValue(nextTime);
    window.localStorage.setItem(LAST_SCHEDULE_TIME_KEY, nextTime);
    onChange(`${safeDate}T${nextTime}`);
  };

  const chooseDate = (nextDate: string) => {
    const safeDate = timeValue ? ensureFutureDate(nextDate, timeValue) : nextDate;
    setDateValue(safeDate);
    setMonthValue(safeDate.slice(0, 7));
    if (timeValue) onChange(`${safeDate}T${timeValue}`);
    setDateOpen(false);
  };

  const chooseTime = (nextTime: string) => {
    commit(dateValue || defaultDateForTime(nextTime), nextTime);
  };

  const changeMonth = (offset: number) => {
    const next = new Date(calendarYear, calendarMonth + offset, 1);
    setMonthValue(localMonthValue(next));
  };

  const renderTimeColumn = (label: string, options: string[], selected: string, column: "hour" | "minute") => (
    <div className="schedule-time-column">
      <span className="schedule-time-column-label">{label}</span>
      <div className="schedule-time-options" role="listbox" aria-label={`选择${label}`}>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            role="option"
            aria-selected={selected === option}
            data-schedule-column={column}
            data-selected={selected === option ? "true" : "false"}
            className={selected === option ? "selected" : ""}
            onClick={() => chooseTime(label === "小时" ? `${option}:${timeValue.slice(3, 5) || "00"}` : `${timeValue.slice(0, 2) || "00"}:${option}`)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );

  if (!initialised) return null;

  return (
    <div ref={pickerRef} className={`publish-schedule-fields schedule-picker-fields ${hideLabels ? "schedule-picker-fields-compact" : ""} ${className || ""}`.trim()}>
      <div className="publish-datetime-picker schedule-picker-field">
        {!hideLabels && <span className="publish-picker-label schedule-picker-label">公开日期</span>}
        <button
          type="button"
          className={`publish-datetime-trigger schedule-picker-trigger ${dateValue ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => { setDateOpen((open) => !open); setTimeOpen(false); setMonthValue((dateValue || todayValue).slice(0, 7)); }}
          aria-expanded={dateOpen}
        >
          <span><SiteIcon name="fa-calendar-days" variant="outline" aria-hidden="true" /> {dateLabel(dateValue)}</span>
          <SiteIcon name="fa-chevron-down" variant="solid" className={dateOpen ? "up" : undefined} aria-hidden="true" />
        </button>
        {dateOpen && (
          <div className="publish-calendar-popover schedule-calendar-popover" role="dialog" aria-label="选择公开日期">
            <div className="publish-calendar-header schedule-calendar-header">
              <button type="button" aria-label="上个月" disabled={activeMonthValue <= currentMonthValue} onClick={() => changeMonth(-1)}><SiteIcon name="fa-chevron-left" variant="solid" aria-hidden="true" /></button>
              <strong>{calendarYear} 年 {calendarMonth + 1} 月</strong>
              <button type="button" aria-label="下个月" onClick={() => changeMonth(1)}><SiteIcon name="fa-chevron-right" variant="solid" aria-hidden="true" /></button>
            </div>
            <div className="publish-calendar-weekdays schedule-calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="publish-calendar-grid schedule-calendar-grid">
              {calendarDays.map((day, index) => {
                if (!day) return <span key={`empty-${index}`} />;
                const dayValue = `${activeMonthValue}-${pad(day)}`;
                const isToday = dayValue === todayValue;
                const isPast = dayValue < todayValue;
                return (
                  <button type="button" key={dayValue} disabled={isPast} className={`${dateValue === dayValue ? "selected" : ""} ${isToday ? "today" : ""} ${isPast ? "past" : ""}`} onClick={() => chooseDate(dayValue)}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="publish-time-picker schedule-picker-field">
        {!hideLabels && <span className="publish-picker-label schedule-picker-label">公开时间</span>}
        <button
          type="button"
          className={`publish-time-trigger schedule-picker-trigger ${timeOpen ? "open" : ""} ${timeValue ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => { setTimeOpen((open) => !open); setDateOpen(false); }}
          aria-expanded={timeOpen}
        >
          <span><SiteIcon name="fa-clock" variant="outline" aria-hidden="true" /> {timeValue || "选择时间"}</span>
          <SiteIcon name="fa-chevron-down" variant="solid" className={timeOpen ? "up" : undefined} aria-hidden="true" />
        </button>
        {timeOpen && (
          <div className="publish-time-popover schedule-time-popover" role="dialog" aria-label="选择公开时间">
            <div className="publish-time-columns schedule-time-columns">
              {renderTimeColumn("小时", HOURS, timeValue.slice(0, 2), "hour")}
              {renderTimeColumn("分钟", MINUTES, timeValue.slice(3, 5), "minute")}
            </div>
            <button type="button" className="schedule-time-confirm" disabled={!validTime(timeValue)} onClick={() => setTimeOpen(false)}>确定</button>
          </div>
        )}
      </div>
    </div>
  );
}
