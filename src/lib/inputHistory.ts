export type InputHistoryField =
  | "work-title"
  | "series-description"
  | "image-description"
  | "chapter-title"
  | "author-note"
  | "article-body"
  | "chapter-body";

type InputHistoryStore = Partial<Record<InputHistoryField, string[]>>;

const STORAGE_KEY = "inkland:publish-input-history:v1";
const MAX_ITEMS_PER_FIELD = 6;
const MAX_VALUE_LENGTH = 120_000;

function readStore(): InputHistoryStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as InputHistoryStore;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function getInputHistory(field: InputHistoryField): string[] {
  const values = readStore()[field];
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).slice(0, MAX_ITEMS_PER_FIELD);
}

export function rememberInputHistory(field: InputHistoryField, value: string) {
  if (typeof window === "undefined") return;
  const normalized = value.trim();
  if (!normalized) return;
  const store = readStore();
  const current = Array.isArray(store[field]) ? store[field] : [];
  store[field] = [normalized.slice(0, MAX_VALUE_LENGTH), ...current.filter((item) => item !== normalized)].slice(0, MAX_ITEMS_PER_FIELD);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 历史记录只是辅助功能，存储空间不足时不影响发布。
  }
}
