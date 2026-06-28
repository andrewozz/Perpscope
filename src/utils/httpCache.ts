const CACHE_PREFIX = 'perpscope:cache:';

interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

function readCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.fetchedAt > ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { fetchedAt: Date.now(), data };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage unavailable or full — skip caching, fetch will just run again next time.
  }
}

/** Plain fetch with no caching (for large responses we don't want to store raw). */
export async function fetchJsonNoCache<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fetches JSON from `url`, reusing a cached response younger than `ttlMs` instead of refetching. */
export async function cachedFetchJson<T>(url: string, ttlMs: number, init?: RequestInit): Promise<T | null> {
  const cached = readCache<T>(url, ttlMs);
  if (cached) return cached;

  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    writeCache(url, data);
    return data;
  } catch {
    return null;
  }
}
