// Per-account search history + saved searches, stored client-side.
// Keyed by the account identity so each account gets its own 30-entry history
// and switching accounts swaps the suggestions. Stored locally (not in
// SpacetimeDB) because search history is private per-user data.

export interface SearchEntry {
  q: string;
  saved: boolean;
  at: number;
}

export const SEARCH_HISTORY_CAP = 100;

const keyFor = (id: string) => `veri_search_history_${id}`;

export function loadSearchHistory(id: string): SearchEntry[] {
  try {
    const raw = localStorage.getItem(keyFor(id));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is SearchEntry => typeof e?.q === 'string' && typeof e.saved === 'boolean' && typeof e.at === 'number'
    );
  } catch {
    return [];
  }
}

function persist(id: string, list: SearchEntry[]) {
  try {
    localStorage.setItem(keyFor(id), JSON.stringify(list.slice(0, SEARCH_HISTORY_CAP)));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

// Record a used search at the front of the history (deduped, capped at 30).
// The saved flag survives re-running a saved search.
export function recordSearch(id: string, q: string): SearchEntry[] {
  const list = loadSearchHistory(id);
  const saved = list.find((e) => e.q === q)?.saved ?? false;
  const filtered = list.filter((e) => e.q !== q);
  filtered.unshift({ q, saved, at: Date.now() });
  persist(id, filtered);
  return filtered;
}

// Remove a search from the history entirely (saved or not).
export function deleteSearch(id: string, q: string): SearchEntry[] {
  const list = loadSearchHistory(id).filter((e) => e.q !== q);
  persist(id, list);
  return list;
}

// Flip the saved flag for a search; adds it (saved) if not present yet.
export function toggleSaveSearch(id: string, q: string): SearchEntry[] {
  const list = loadSearchHistory(id);
  const i = list.findIndex((e) => e.q === q);
  if (i === -1) {
    list.unshift({ q, saved: true, at: Date.now() });
  } else {
    list[i] = { ...list[i], saved: !list[i].saved, at: Date.now() };
  }
  persist(id, list);
  return list;
}

// The shared history bucket id for the signed-in account: their email
// (stable across identity re-claims), 'anon' when logged out. Keeps ONE
// suggestion list across every page with a search bar.
import { getOAuthSession } from './oauthSession';

export function getSearchHistoryId(): string {
  const s = getOAuthSession();
  const email = s?.email?.trim().toLowerCase();
  return email || 'anon';
}