function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Homepage feed timestamp format from the card-library contract.
 * The optional `now` argument keeps the calendar rules deterministic in tests.
 */
export function formatHomeFeedTimestamp(dateStr: string, now = new Date()): string {
  const publishedAt = new Date(dateStr);
  if (Number.isNaN(publishedAt.getTime())) return "";

  const elapsedSeconds = Math.floor((now.getTime() - publishedAt.getTime()) / 1000);
  if (elapsedSeconds < 60) return "刚刚";

  const isSameCalendarDay =
    publishedAt.getFullYear() === now.getFullYear() &&
    publishedAt.getMonth() === now.getMonth() &&
    publishedAt.getDate() === now.getDate();

  if (isSameCalendarDay) {
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;
    return `${Math.floor(elapsedMinutes / 60)} 小时前`;
  }

  const calendarDayDelta = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(publishedAt)) / 86_400_000,
  );
  if (calendarDayDelta === 1) {
    return `昨天 ${padTwoDigits(publishedAt.getHours())}:${padTwoDigits(publishedAt.getMinutes())}`;
  }
  if (calendarDayDelta >= 2 && calendarDayDelta <= 6) {
    return `${calendarDayDelta} 天前`;
  }

  const monthAndDay = `${padTwoDigits(publishedAt.getMonth() + 1)}-${padTwoDigits(publishedAt.getDate())}`;
  if (publishedAt.getFullYear() === now.getFullYear()) return monthAndDay;
  return `${publishedAt.getFullYear()}-${monthAndDay}`;
}
