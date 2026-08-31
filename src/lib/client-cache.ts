type CacheEntry<T> = {
  value: T;
  storedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function readStorage<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = sessionStorage.getItem(`inkland-cache:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.storedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readClientCache<T>(key: string, ttlMs: number, persist = false): T | undefined {
  const now = Date.now();
  const memory = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memory && now - memory.storedAt < ttlMs) return memory.value;
  if (memory) memoryCache.delete(key);

  if (!persist || typeof window === "undefined") return undefined;
  const stored = readStorage<T>(key);
  if (!stored || now - stored.storedAt >= ttlMs) {
    try { sessionStorage.removeItem(`inkland-cache:${key}`); } catch { /* ignore storage failures */ }
    return undefined;
  }
  memoryCache.set(key, stored);
  return stored.value;
}

export function writeClientCache<T>(key: string, value: T, persist = false) {
  const entry: CacheEntry<T> = { value, storedAt: Date.now() };
  memoryCache.set(key, entry);
  if (!persist || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`inkland-cache:${key}`, JSON.stringify(entry));
  } catch { /* ignore storage quota/private-mode failures */ }
}

export function getOrCreateClientCache<T>(
  key: string,
  loader: () => Promise<T>,
  options: { ttlMs: number; persist?: boolean },
): Promise<T> {
  const cached = readClientCache<T>(key, options.ttlMs, options.persist);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = loader()
    .then((value) => {
      writeClientCache(key, value, options.persist);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

export function invalidateClientCache(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(`inkland-cache:${prefix}`)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  } catch { /* ignore storage failures */ }
}
