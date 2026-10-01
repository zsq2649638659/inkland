export const DAILY_REWARDS_CHANGED_EVENT = "inkland:daily-rewards-changed";

export function getShanghaiDayKey(value: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function notifyDailyRewardsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DAILY_REWARDS_CHANGED_EVENT));
  }
}
